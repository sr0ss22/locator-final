-- =============================================================================
-- Coverage drill-down: get_coverage_detail
--
-- Powers the "click an FSA/ZIP polygon → see who covers what" panel on
-- the internal locator. Given a ZIP (USA) or FSA (Canada) AND the same
-- installer-id filter the overlay is currently using, returns one row
-- per (postal_code, installer) covered assignment with the installer's
-- name and territory status. The panel groups by postal_code so a
-- partially-covered FSA in Canada shows exactly which postal codes the
-- visible installers actually service.
--
-- Notes:
--   * Admin only — the public locator doesn't expose installer names
--     anywhere, so neither does this RPC. Gated by public.is_admin().
--   * Reuses the existing idx_installer_zip_codes_fsa_prefix functional
--     index (from migration 0177) so the FSA branch is an O(log n) seek
--     even at single-FSA scale.
--   * Returns jsonb (not SETOF) to bypass PostgREST's default 1000-row
--     cap. An FSA can contain hundreds of postal codes; an installer
--     can hold dozens of them.
--   * is_active = 1 mirrors the overlay's own filter (matching the
--     aggregate behaviour from get_zip_coverage_aggregate) so an admin
--     can't accidentally inspect inactive installers that aren't on
--     the map.
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
  result    jsonb;
  fsa_norm  text;
  zip_norm  text;
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
    fsa_norm := upper(left(replace(coalesce(p_zip_or_fsa, ''), ' ', ''), 3));
    IF length(fsa_norm) <> 3 THEN
      RETURN jsonb_build_object(
        'country',    'Canada',
        'zip_or_fsa', coalesce(p_zip_or_fsa, ''),
        'rows',       '[]'::jsonb
      );
    END IF;

    SELECT jsonb_build_object(
      'country',    'Canada',
      'zip_or_fsa', fsa_norm,
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
