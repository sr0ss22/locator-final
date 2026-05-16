-- =============================================================================
-- get_coverage_detail: extend Canadian path to accept full postal codes.
--
-- Previously the function only accepted 3-character FSA prefixes for
-- Canada. The coverage-detail panel now exposes a search box that lets
-- admins type either an FSA (e.g. "V0X") or a full postal code
-- (e.g. "V0X 1T0") to identify coverage faster — without scrolling
-- the panel through every postal in a large FSA.
--
-- Behaviour:
--   * len(normalized) = 3 → FSA lookup (existing behaviour).
--   * len(normalized) = 6 → exact postal-code match. Returns only the
--     installers covering that one postal, not the whole FSA.
--   * USA branch unchanged.
--
-- Still admin only; reuses idx_installer_zip_codes_fsa_prefix to first
-- narrow the candidate set down to the FSA, then filters by exact
-- normalized postal — so even on a full-postal lookup we never scan
-- the whole installer_zip_codes table.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_coverage_detail(
  p_country       text,
  p_zip_or_fsa    text,
  p_installer_ids text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result        jsonb;
  fsa_norm      text;
  postal_norm   text;
  zip_norm      text;
  is_full_postal boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admins only.'
      USING ERRCODE = '42501';
  END IF;

  IF p_country NOT IN ('USA', 'Canada') THEN
    RAISE EXCEPTION 'p_country must be USA or Canada (got %)', p_country
      USING ERRCODE = '22023';
  END IF;

  IF p_country = 'USA' THEN
    zip_norm := trim(coalesce(p_zip_or_fsa, ''));
    IF zip_norm = '' THEN
      RETURN jsonb_build_object(
        'country',    'USA',
        'zip_or_fsa', '',
        'rows',       '[]'::jsonb
      );
    END IF;

    SELECT jsonb_build_object(
      'country',    'USA',
      'zip_or_fsa', zip_norm,
      'rows',       COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'postal_code',    izc.zip_code,
            'installer_id',   i.id,
            'installer_name', i.name,
            'status',         izc.status
          )
          ORDER BY i.name, izc.status
        ),
        '[]'::jsonb
      )
    )
    INTO result
    FROM public.installer_zip_codes izc
    JOIN public.installers i ON i.id = izc.installer_id
    WHERE izc.zip_code = zip_norm
      AND coalesce(i.is_active, 0) = 1
      AND (p_installer_ids IS NULL OR izc.installer_id = ANY(p_installer_ids));

  ELSE
    postal_norm := upper(replace(coalesce(p_zip_or_fsa, ''), ' ', ''));
    is_full_postal := length(postal_norm) = 6;
    fsa_norm := left(postal_norm, 3);

    IF length(fsa_norm) <> 3 THEN
      RETURN jsonb_build_object(
        'country',    'Canada',
        'zip_or_fsa', coalesce(p_zip_or_fsa, ''),
        'rows',       '[]'::jsonb
      );
    END IF;

    SELECT jsonb_build_object(
      'country',    'Canada',
      'zip_or_fsa', CASE WHEN is_full_postal THEN postal_norm ELSE fsa_norm END,
      'rows',       COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'postal_code',    upper(replace(izc.zip_code, ' ', '')),
            'installer_id',   i.id,
            'installer_name', i.name,
            'status',         izc.status
          )
          ORDER BY upper(replace(izc.zip_code, ' ', '')), i.name, izc.status
        ),
        '[]'::jsonb
      )
    )
    INTO result
    FROM public.installer_zip_codes izc
    JOIN public.installers i ON i.id = izc.installer_id
    WHERE upper(left(replace(izc.zip_code, ' ', ''), 3)) = fsa_norm
      AND (NOT is_full_postal
           OR upper(replace(izc.zip_code, ' ', '')) = postal_norm)
      AND coalesce(i.is_active, 0) = 1
      AND (p_installer_ids IS NULL OR izc.installer_id = ANY(p_installer_ids));
  END IF;

  RETURN COALESCE(
    result,
    jsonb_build_object(
      'country',    p_country,
      'zip_or_fsa', coalesce(p_zip_or_fsa, ''),
      'rows',       '[]'::jsonb
    )
  );
END;
$$;

ALTER FUNCTION public.get_coverage_detail(text, text, text[])
  SET statement_timeout = '15s';

GRANT EXECUTE ON FUNCTION public.get_coverage_detail(text, text, text[])
  TO authenticated;
