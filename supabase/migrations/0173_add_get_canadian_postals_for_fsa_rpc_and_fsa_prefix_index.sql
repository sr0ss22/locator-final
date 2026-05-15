-- =============================================================================
-- New feature: bulk-assign all postals in an FSA from the map.
--
-- Returns the distinct, normalized postal codes for a single FSA so the
-- frontend can populate an installer's assignments in one click.
--
-- Performance:
--   * Adds a functional index on `upper(replace(POSTAL_CODE, ' ', ''))`
--     keyed by the first 3 chars (the FSA), so a single FSA lookup is
--     O(log N) seek + a few hundred rows of leaf scan instead of a
--     full table scan over ~860k rows.
--   * Returns jsonb to bypass PostgREST's 1000-row cap; FSAs typically
--     have 100-900 distinct postals, well within a single response.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_canadian_postal_codes_fsa_prefix
  ON public.canadian_postal_codes (
    (upper(left(replace("POSTAL_CODE", ' ', ''), 3)))
  );

CREATE OR REPLACE FUNCTION public.get_canadian_postals_for_fsa(p_fsa text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  result          jsonb;
  fsa_normalized  text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admins only.'
      USING ERRCODE = '42501';
  END IF;

  fsa_normalized := upper(left(replace(coalesce(p_fsa, ''), ' ', ''), 3));
  IF length(fsa_normalized) <> 3 THEN
    RETURN '[]'::jsonb;
  END IF;

  WITH normalized AS (
    SELECT DISTINCT ON (upper(replace(cpc."POSTAL_CODE", ' ', '')))
           upper(replace(cpc."POSTAL_CODE", ' ', '')) AS postal_code,
           cpc."PROVINCE_ABBR"                        AS province_abbr,
           cpc."LATITUDE"                             AS latitude,
           cpc."LONGITUDE"                            AS longitude
    FROM public.canadian_postal_codes cpc
    WHERE upper(left(replace(cpc."POSTAL_CODE", ' ', ''), 3)) = fsa_normalized
      AND cpc."POSTAL_CODE" IS NOT NULL
  )
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'postal_code',   postal_code,
               'province_abbr', province_abbr,
               'latitude',      latitude,
               'longitude',     longitude
             )
             ORDER BY postal_code
           ),
           '[]'::jsonb
         )
  INTO result
  FROM normalized;

  RETURN result;
END;
$function$;

ALTER FUNCTION public.get_canadian_postals_for_fsa(text)
  SET statement_timeout = '20s';

GRANT EXECUTE ON FUNCTION public.get_canadian_postals_for_fsa(text) TO authenticated;
