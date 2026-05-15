-- =============================================================================
-- Bug fix: FSA postal-code totals were inflated by duplicates.
--
-- Background:
--   Migration 0013 explicitly modified `public.canadian_postal_codes` to
--   "allow duplicate postal codes by adding a unique id column as the new
--   primary key". The PRIMARY KEY became a generated UUID rather than the
--   POSTAL_CODE column, and there is no unique constraint on POSTAL_CODE.
--
--   Migration 0169's `get_canadian_fsa_postal_counts` used `count(*)`, which
--   therefore returned the row count per FSA, not the distinct-postal count.
--
--   Effect on the UI: the Canadian FSA polygon styling treats an FSA as
--   "fully covered" only when an installer's assignment count for the FSA
--   is >= the total. With inflated denominators, FSAs that are functionally
--   fully covered (e.g. 877 of an effective 877) read as partial coverage
--   because the RPC reported, say, 920 due to ~5% duplicate rows.
--
-- Fix:
--   Switch to `count(DISTINCT cpc."POSTAL_CODE")`. Same shape, same row
--   limits, same auth — just the correct denominator.
--
-- Rollback:
--   Re-run 0169 to restore the count(*) version, or DROP and recreate.
-- =============================================================================

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
    SELECT upper(left(cpc."POSTAL_CODE", 3))     AS fsa,
           count(DISTINCT cpc."POSTAL_CODE")::int AS total
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
