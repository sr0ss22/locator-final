-- =============================================================================
-- Coverage overlay: targeted polygon fetch.
--
-- get_public_zip_geometries_in_radius (added in 0174) returns every US
-- ZIP polygon whose centroid falls inside the search radius, capped at
-- 5000 features for payload sanity. At wider radii (e.g. 500 miles from
-- a central-US city) the polygon set easily exceeds 5000 — so outer
-- ZIPs that DO have coverage in the aggregate response silently drop
-- off the map. Visually: a green/orange "doughnut hole" of missing
-- polygons around the search center.
--
-- Fix: accept an explicit p_zip_codes text[] argument. When the caller
-- supplies it (the frontend feeds it the aggregate's zip list), we
-- short-circuit the radius scan and fetch only those polygons —
-- there's no need to over-fetch zips that won't render anyway. The
-- list is bounded by the aggregate (which IS allowed to be large
-- because it returns counts, not geometries), so we can drop the
-- LIMIT in that path.
--
-- The radius-only path is preserved (NULL p_zip_codes) for backward
-- compat and as a safe fallback during loading states.
--
-- Postgres can't add a positional parameter via CREATE OR REPLACE, so
-- the prior signature is dropped first.
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_public_zip_geometries_in_radius(
  double precision, double precision, double precision
);

CREATE OR REPLACE FUNCTION public.get_public_zip_geometries_in_radius(
  p_lat           double precision,
  p_lng           double precision,
  p_radius_miles  double precision,
  p_zip_codes     text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result jsonb;
BEGIN
  IF p_zip_codes IS NOT NULL AND array_length(p_zip_codes, 1) > 0 THEN
    -- Targeted path: caller already knows which ZIPs need polygons.
    -- Skip the radius math entirely and just pull exactly that set.
    WITH targeted AS (
      SELECT
        z.zip_code,
        z.state_province,
        z.geometry
      FROM public.zip_code_geometries z
      WHERE z.geometry IS NOT NULL
        AND z.zip_code = ANY(p_zip_codes)
    )
    SELECT jsonb_build_object(
      'type', 'FeatureCollection',
      'features', COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'type', 'Feature',
            'properties', jsonb_build_object(
              'zip_code',       t.zip_code,
              'state_province', t.state_province
            ),
            'geometry', t.geometry
          )
        ),
        '[]'::jsonb
      )
    )
    INTO result
    FROM targeted t;

    RETURN result;
  END IF;

  -- Fallback: original radius-only behaviour. Kept so callers that
  -- haven't been updated to pass a zip list still work, and to act as
  -- a safe pre-aggregate render path.
  IF p_lat IS NULL OR p_lng IS NULL OR p_radius_miles IS NULL OR p_radius_miles <= 0 THEN
    RETURN jsonb_build_object('type', 'FeatureCollection', 'features', '[]'::jsonb);
  END IF;

  WITH candidate_zips AS (
    SELECT
      z.zip_code,
      z.state_province,
      z.geometry,
      (
        3959 * acos(
          least(1.0, greatest(-1.0,
            cos(radians(p_lat)) * cos(radians(z.centroid_latitude)) *
            cos(radians(z.centroid_longitude) - radians(p_lng)) +
            sin(radians(p_lat)) * sin(radians(z.centroid_latitude))
          ))
        )
      ) AS distance_miles
    FROM public.zip_code_geometries z
    WHERE z.geometry            IS NOT NULL
      AND z.centroid_latitude   IS NOT NULL
      AND z.centroid_longitude  IS NOT NULL
      AND (
        3959 * acos(
          least(1.0, greatest(-1.0,
            cos(radians(p_lat)) * cos(radians(z.centroid_latitude)) *
            cos(radians(z.centroid_longitude) - radians(p_lng)) +
            sin(radians(p_lat)) * sin(radians(z.centroid_latitude))
          ))
        )
      ) <= p_radius_miles
    ORDER BY distance_miles
    LIMIT 5000
  )
  SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'type', 'Feature',
          'properties', jsonb_build_object(
            'zip_code',       cz.zip_code,
            'state_province', cz.state_province
          ),
          'geometry', cz.geometry
        )
      ),
      '[]'::jsonb
    )
  )
  INTO result
  FROM candidate_zips cz;

  RETURN result;
END;
$$;

ALTER FUNCTION public.get_public_zip_geometries_in_radius(
  double precision, double precision, double precision, text[]
) SET statement_timeout = '30s';

GRANT EXECUTE ON FUNCTION public.get_public_zip_geometries_in_radius(
  double precision, double precision, double precision, text[]
) TO anon, authenticated;
