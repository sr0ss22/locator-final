-- =============================================================================
-- Two related fixes for the admin installer edit page.
--
--
-- Part 1: get_installer_zip_codes_admin_v2 — JSONB single-row return.
-- ---------------------------------------------------------------------------
-- Background:
--   PR #11 replaced a paginated PostgREST loop with a single SECURITY DEFINER
--   RPC, on the assumption that PostgREST's row cap (default 1,000 rows)
--   does not apply to RPC results. That was wrong: PostgREST applies the
--   `db-max-rows` cap to *every* response shape, including RPC results that
--   are TABLE/SETOF — they are still streamed as multiple rows.
--
--   Result: an installer with ~90,000 territory rows was being silently
--   truncated to 1,000 in the admin edit page. The new "1,000 assigned
--   territories loaded" line in the UI made this visible.
--
-- Fix:
--   New SECURITY DEFINER RPC that returns the full set as a SINGLE jsonb
--   value. PostgREST sees one row, so the row cap does not apply. The
--   client receives one parsed JSON array.
--
-- Notes:
--   - We intentionally make this a NEW function name (`_v2`) instead of
--     CREATE OR REPLACE on the existing one, because PG cannot change a
--     function's return type via REPLACE. The old function stays in place
--     until callers migrate; once nothing references it we can drop it.
--   - SECURITY DEFINER + is_admin() gate is unchanged; same auth boundary.
--
-- Rollback:
--   DROP FUNCTION public.get_installer_zip_codes_admin_v2(text);
--
--
-- Part 2: get_canadian_fsa_postal_counts — total postal codes per FSA.
-- ---------------------------------------------------------------------------
-- Background:
--   The Canadian FSA polygon styling on the map needs to know whether an
--   FSA is fully covered by an installer's assignments, partially covered,
--   or covered with mixed Free/Paid statuses. To detect "partial coverage"
--   we need to compare an installer's assignments against the *total*
--   number of postal codes that exist in each FSA.
--
--   The static client-side GeoJSON only stores FSA polygon geometry and
--   province; it does not include postal-code counts. The
--   `canadian_postal_codes` table does have every postal code, so we group
--   by the leading 3 characters (FSA) and return counts.
--
-- Notes:
--   - Returns jsonb so we are not subject to PostgREST's row cap (~3,800
--     FSAs in Canada) and the round trip is one parsed JSON object.
--   - SECURITY DEFINER + is_admin() gate keeps this admin-only. The data
--     itself is non-sensitive (just postal-code counts) but we keep the
--     same posture as the other admin RPCs for consistency.
--
-- Rollback:
--   DROP FUNCTION public.get_canadian_fsa_postal_counts();
-- =============================================================================

-- ---------- Part 1 ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_installer_zip_codes_admin_v2(
  p_installer_id text
)
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

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'zip_code',       izc.zip_code,
               'status',         izc.status::text,
               'state_province', izc.state_province
             )
           ),
           '[]'::jsonb
         )
  INTO result
  FROM public.installer_zip_codes izc
  WHERE izc.installer_id = p_installer_id;

  RETURN result;
END;
$function$;

ALTER FUNCTION public.get_installer_zip_codes_admin_v2(text)
  SET statement_timeout = '60s';

GRANT EXECUTE ON FUNCTION public.get_installer_zip_codes_admin_v2(text) TO authenticated;


-- ---------- Part 2 ---------------------------------------------------------
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

  SELECT COALESCE(
           jsonb_object_agg(fsa, total),
           '{}'::jsonb
         )
  INTO result
  FROM (
    SELECT upper(left(cpc."POSTAL_CODE", 3)) AS fsa,
           count(*)::int                     AS total
    FROM public.canadian_postal_codes cpc
    WHERE cpc."POSTAL_CODE" IS NOT NULL
      AND length(cpc."POSTAL_CODE") >= 3
    GROUP BY 1
  ) sub;

  RETURN result;
END;
$function$;

ALTER FUNCTION public.get_canadian_fsa_postal_counts()
  SET statement_timeout = '30s';

GRANT EXECUTE ON FUNCTION public.get_canadian_fsa_postal_counts() TO authenticated;
