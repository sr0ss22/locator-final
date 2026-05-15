-- =============================================================================
-- Performance fix: precomputed table for FSA distinct postal counts.
--
-- Background:
--   Migration 0171 normalised POSTAL_CODE in get_canadian_fsa_postal_counts
--   to fix the off-by-one denominator bug, but the resulting query
--   (full-table scan + per-row regex + count(distinct)) busts the 30s
--   statement_timeout on cold cache and competes with other admin-page
--   queries (get_global_territory_statuses, get_canadian_points_in_radius_count
--   from the FSA-mode prefetch), causing 500 errors.
--
-- Fix:
--   Persist the distinct-postal-per-FSA aggregate in a tiny
--   summary table (~1.6k rows) and read from it. RPC becomes O(rows in
--   summary) and returns in ~10ms. The expensive aggregation runs once
--   here in the migration and again whenever the canadian_postal_codes
--   table is reloaded, via the new admin-only refresh function.
--
-- Expected result:
--   * get_canadian_fsa_postal_counts no longer times out.
--   * Frees the DB to serve the parallel global-statuses + radius-count
--     queries on the same admin pageload.
-- =============================================================================

-- 1. Summary table.
CREATE TABLE IF NOT EXISTS public.canadian_fsa_postal_count_stats (
  fsa           text PRIMARY KEY,
  total_postals int  NOT NULL,
  refreshed_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.canadian_fsa_postal_count_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON public.canadian_fsa_postal_count_stats;
CREATE POLICY "Allow public read access"
  ON public.canadian_fsa_postal_count_stats
  FOR SELECT USING (true);

-- 2. Initial population. Bumped statement_timeout for this transaction
--    so the one-time cold-cache aggregation can complete.
SET LOCAL statement_timeout = '180s';

INSERT INTO public.canadian_fsa_postal_count_stats (fsa, total_postals)
SELECT left(pc, 3)            AS fsa,
       count(DISTINCT pc)::int AS total
FROM (
  SELECT upper(replace(cpc."POSTAL_CODE", ' ', '')) AS pc
  FROM public.canadian_postal_codes cpc
  WHERE cpc."POSTAL_CODE" IS NOT NULL
) n
WHERE length(pc) >= 3
GROUP BY 1
ON CONFLICT (fsa) DO UPDATE
  SET total_postals = EXCLUDED.total_postals,
      refreshed_at  = now();

-- 3. Admin-only refresh function. Call after a CSV import so the totals
--    stay in sync without anyone editing this migration.
CREATE OR REPLACE FUNCTION public.refresh_canadian_fsa_postal_counts()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rows_affected int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admins only.'
      USING ERRCODE = '42501';
  END IF;

  WITH agg AS (
    SELECT left(pc, 3)            AS fsa,
           count(DISTINCT pc)::int AS total
    FROM (
      SELECT upper(replace(cpc."POSTAL_CODE", ' ', '')) AS pc
      FROM public.canadian_postal_codes cpc
      WHERE cpc."POSTAL_CODE" IS NOT NULL
    ) n
    WHERE length(pc) >= 3
    GROUP BY 1
  ),
  upserted AS (
    INSERT INTO public.canadian_fsa_postal_count_stats (fsa, total_postals)
    SELECT fsa, total FROM agg
    ON CONFLICT (fsa) DO UPDATE
      SET total_postals = EXCLUDED.total_postals,
          refreshed_at  = now()
    RETURNING fsa
  ),
  deleted AS (
    DELETE FROM public.canadian_fsa_postal_count_stats s
    WHERE NOT EXISTS (SELECT 1 FROM agg WHERE agg.fsa = s.fsa)
    RETURNING s.fsa
  )
  SELECT (SELECT count(*) FROM upserted) + (SELECT count(*) FROM deleted)
  INTO rows_affected;

  RETURN rows_affected;
END;
$$;

ALTER FUNCTION public.refresh_canadian_fsa_postal_counts()
  SET statement_timeout = '180s';

GRANT EXECUTE ON FUNCTION public.refresh_canadian_fsa_postal_counts() TO authenticated;

-- 4. Replace the existing RPC with one that just reads the summary.
CREATE OR REPLACE FUNCTION public.get_canadian_fsa_postal_counts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admins only.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_object_agg(fsa, total_postals), '{}'::jsonb)
  INTO result
  FROM public.canadian_fsa_postal_count_stats;

  RETURN result;
END;
$function$;

ALTER FUNCTION public.get_canadian_fsa_postal_counts()
  SET statement_timeout = '15s';

GRANT EXECUTE ON FUNCTION public.get_canadian_fsa_postal_counts() TO authenticated;
