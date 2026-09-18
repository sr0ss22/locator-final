-- =============================================================================
-- 0185: Schema for the Brite -> locator pull sync.
--
-- Adds three things:
--   1. brite_sync_runs              - one row per sync execution
--   2. installer_brite_sync_snapshots - per-installer pre-sync snapshots
--   3. installers.brite_sync_paused - opt-out flag per installer
--
-- The snapshot table is the safety net: BEFORE the sync function writes any
-- update to an installer row, it copies the full row state and the inbound
-- Brite payload here. If anything ever gets clobbered by bad upstream data,
-- the diff is visible and the row can be restored from the JSON snapshot.
-- =============================================================================

-- 1. Sync run log -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.brite_sync_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  status          text        NOT NULL
    CHECK (status IN ('running', 'success', 'partial', 'failed')),
  trigger_source  text        NOT NULL
    CHECK (trigger_source IN ('cron', 'manual')),
  triggered_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  rows_synced     integer     NOT NULL DEFAULT 0,
  rows_failed     integer     NOT NULL DEFAULT 0,
  rows_skipped    integer     NOT NULL DEFAULT 0,
  error_summary   text,
  notes           text
);

CREATE INDEX IF NOT EXISTS idx_brite_sync_runs_started_at
  ON public.brite_sync_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_brite_sync_runs_status_started
  ON public.brite_sync_runs (status, started_at DESC);

-- 2. Per-installer pre-sync snapshots ----------------------------------------
CREATE TABLE IF NOT EXISTS public.installer_brite_sync_snapshots (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id       uuid        NOT NULL
    REFERENCES public.brite_sync_runs(id) ON DELETE CASCADE,
  installer_id      text        NOT NULL
    REFERENCES public.installers(id) ON DELETE CASCADE,
  snapshot_taken_at timestamptz NOT NULL DEFAULT now(),
  pre_sync_state    jsonb       NOT NULL,
  brite_payload     jsonb       NOT NULL,
  -- True only if this snapshot represents an actual write (sync changed something).
  -- We snapshot every row so we can reason about "what did Brite say last time"
  -- even when no diff was applied.
  applied_changes   boolean     NOT NULL DEFAULT false,
  error_message     text
);

CREATE INDEX IF NOT EXISTS idx_brite_sync_snapshots_installer_taken
  ON public.installer_brite_sync_snapshots (installer_id, snapshot_taken_at DESC);

CREATE INDEX IF NOT EXISTS idx_brite_sync_snapshots_run
  ON public.installer_brite_sync_snapshots (sync_run_id);

-- 3. Opt-out flag on installers ----------------------------------------------
ALTER TABLE public.installers
  ADD COLUMN IF NOT EXISTS brite_sync_paused boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_installers_brite_sync_paused
  ON public.installers (brite_sync_paused)
  WHERE brite_sync_paused = true;

-- 4. RLS ---------------------------------------------------------------------
-- Both new tables are admin-only. Reusing the public.is_admin() helper that
-- migration 0163 added for the installers/profiles RLS pass.
ALTER TABLE public.brite_sync_runs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installer_brite_sync_snapshots  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read sync runs"     ON public.brite_sync_runs;
DROP POLICY IF EXISTS "Admins can write sync runs"    ON public.brite_sync_runs;
DROP POLICY IF EXISTS "Admins can read snapshots"     ON public.installer_brite_sync_snapshots;
DROP POLICY IF EXISTS "Admins can write snapshots"    ON public.installer_brite_sync_snapshots;

CREATE POLICY "Admins can read sync runs"
  ON public.brite_sync_runs
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can write sync runs"
  ON public.brite_sync_runs
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can read snapshots"
  ON public.installer_brite_sync_snapshots
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can write snapshots"
  ON public.installer_brite_sync_snapshots
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- The Edge Function will run with the service_role key, which bypasses RLS,
-- so the policies above gate the Admin UI only.

-- 5. Restore helpers ---------------------------------------------------------
-- These live as SECURITY DEFINER admin RPCs so the UI can call them through
-- the supabase-js client without needing service_role.

CREATE OR REPLACE FUNCTION public.brite_restore_installer_from_snapshot(
  p_snapshot_id uuid
) RETURNS public.installers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_snapshot record;
  v_row      public.installers;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_snapshot
    FROM public.installer_brite_sync_snapshots
   WHERE id = p_snapshot_id;

  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'snapshot % not found', p_snapshot_id;
  END IF;

  -- jsonb_populate_record fills every column on installers from the snapshot
  -- jsonb. Extra keys are ignored, missing keys are left as default. We then
  -- write that record back.
  UPDATE public.installers
     SET (NAME, address, "zipCode", phone, skills, certifications, latitude, longitude)
       = (
         SELECT name, address, "zipCode", phone, skills, certifications, latitude, longitude
           FROM jsonb_populate_record(NULL::public.installers, v_snapshot.pre_sync_state)
         )
   WHERE id = v_snapshot.installer_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.brite_restore_installer_from_snapshot(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.brite_restore_installer_from_snapshot(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.brite_restore_sync_run(
  p_sync_run_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  WITH applied AS (
    SELECT s.id
      FROM public.installer_brite_sync_snapshots s
     WHERE s.sync_run_id = p_sync_run_id
       AND s.applied_changes = true
  ),
  restored AS (
    SELECT public.brite_restore_installer_from_snapshot(id) FROM applied
  )
  SELECT count(*) INTO v_count FROM restored;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.brite_restore_sync_run(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.brite_restore_sync_run(uuid) TO authenticated;

-- =============================================================================
-- Sanity check that everything is in place.
-- =============================================================================
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'installers'
      AND column_name  = 'brite_sync_paused')                AS has_paused_column,
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'brite_sync_runs')                  AS has_runs_table,
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'installer_brite_sync_snapshots')   AS has_snapshots_table,
  (SELECT count(*) FROM pg_proc
    WHERE proname IN ('brite_restore_installer_from_snapshot',
                      'brite_restore_sync_run'))             AS has_restore_functions;
