-- =============================================================================
-- Bug fix (continuation of 0170): off-by-one denominators in FSA totals.
--
-- After 0170 switched to count(DISTINCT POSTAL_CODE), users observed every
-- "should be fully covered" FSA reading as exactly 1 short of total
-- (190/191, 877/878, 901/902, ...). That consistent off-by-one points to
-- format variants of the *same* postal code being stored multiple times in
-- public.canadian_postal_codes - e.g. "L6A 1A1" with a space and "L6A1A1"
-- without, or differing case. count(DISTINCT POSTAL_CODE) keeps each text
-- form as its own row, inflating the denominator.
--
-- Fix:
--   Normalize the postal code before both the FSA grouping and the distinct
--   count: uppercase + strip all whitespace. Canadian postal codes are
--   unique by definition, so collapsing whitespace/case variants cannot
--   conflate two genuinely distinct postals.
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
    SELECT left(normalized, 3)            AS fsa,
           count(DISTINCT normalized)::int AS total
    FROM (
      SELECT upper(regexp_replace(cpc."POSTAL_CODE", '\s+', '', 'g')) AS normalized
      FROM public.canadian_postal_codes cpc
      WHERE cpc."POSTAL_CODE" IS NOT NULL
    ) n
    WHERE length(normalized) >= 3
    GROUP BY 1
  ) sub;

  RETURN result;
END;
$function$;

ALTER FUNCTION public.get_canadian_fsa_postal_counts()
  SET statement_timeout = '30s';

GRANT EXECUTE ON FUNCTION public.get_canadian_fsa_postal_counts() TO authenticated;
