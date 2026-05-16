-- =============================================================================
-- Coverage overlay: per-zip / per-FSA aggregate of free vs paid coverage.
--
-- Backs the new map overlay on /public-locator and /locator that paints each
-- zip code (US) or FSA (Canada) green/orange/striped based on how many
-- installers cover it free (installer_zip_codes.status = 'Approved') vs paid
-- ('Needs Approval').
--
-- Design notes:
--   * SECURITY DEFINER so the public locator can call it unauthenticated
--     (mirrors find_installers_for_public_locator from migration 0008).
--   * Returns jsonb to bypass PostgREST's 1000-row cap; a 250 mi search can
--     easily touch 2-3k US zips.
--   * Filters (brands/skills/certifications/shipments) intentionally use the
--     same AND semantics as the public locator
--     (PublicLocator.tsx:filteredAndSortedInstallers) so the overlay matches
--     the visible installer pool exactly.
--   * Certifications are normalized via _standardize_cert which mirrors the
--     standardizeCertificationName() in PublicLocator.tsx. Keep them in
--     sync if you ever add a new cert variant.
--   * Candidate zips/FSAs are picked by Haversine on the canonical centroid
--     tables (zip_code_geometries for US, canadian_postal_codes for CA).
--   * USA and Canada paths are split across IF branches so the unused
--     country's tables are never scanned.
-- =============================================================================

-- Cert-name normalizer mirroring the JS standardizeCertificationName.
-- IMMUTABLE so the planner can fold it into expression indexes if we ever
-- need one. Underscored to mark it as an internal helper.
CREATE OR REPLACE FUNCTION public._standardize_cert(cert text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  n text;
BEGIN
  IF cert IS NULL OR length(trim(cert)) = 0 THEN
    RETURN NULL;
  END IF;
  n := lower(trim(regexp_replace(regexp_replace(cert, '[^a-zA-Z0-9\s]', '', 'g'), '\s+', ' ', 'g')));
  IF n LIKE '%motorization pro%' OR n = 'pv pro' OR n = 'powerview pro certified' THEN
    RETURN 'Motorization Pro';
  END IF;
  RETURN CASE n
    WHEN 'certified installer' THEN 'Certified Installer'
    WHEN 'master installer'    THEN 'Master Installer'
    WHEN 'master shutter'      THEN 'Shutter Pro'
    WHEN 'drapery pro'         THEN 'Drapery Pro'
    WHEN 'pip certified'       THEN 'PIP Certified'
    ELSE NULL
  END;
END;
$$;

-- =============================================================================
-- public.get_zip_coverage_aggregate
--   p_country            'USA' | 'Canada'
--   p_lat / p_lng        search center (decimal degrees, WGS84)
--   p_radius_miles       only consider zips/FSAs whose centroid is within
--                        this radius of (p_lat, p_lng). Should be >= the
--                        user's search radius so the overlay covers the
--                        visible map a touch beyond the installer search.
--   p_brands[]           AND-filter: installer must have ALL listed brands
--   p_skills[]           AND-filter: installer must have ALL listed skills
--   p_certifications[]   AND-filter: installer must hold ALL listed certs
--   p_accepts_shipments  if true, restrict to installers with shipment > 0
--
-- Returns jsonb of the form:
--   { "country": "USA",
--     "items": [
--       { "zip": "80020", "state_province": "CO",
--         "free": 5, "paid": 2,
--         "centroid_lat": 39.9..., "centroid_lng": -105.1... }, ... ] }
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_zip_coverage_aggregate(
  p_country            text,
  p_lat                double precision,
  p_lng                double precision,
  p_radius_miles       double precision,
  p_brands             text[] DEFAULT NULL,
  p_skills             text[] DEFAULT NULL,
  p_certifications     text[] DEFAULT NULL,
  p_accepts_shipments  boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result jsonb;
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL OR p_radius_miles IS NULL OR p_radius_miles <= 0 THEN
    RETURN jsonb_build_object(
      'country', coalesce(p_country, 'USA'),
      'items', '[]'::jsonb
    );
  END IF;

  IF p_country NOT IN ('USA', 'Canada') THEN
    RAISE EXCEPTION 'p_country must be USA or Canada (got %)', p_country
      USING ERRCODE = '22023';
  END IF;

  IF p_country = 'USA' THEN
    -- USA path: candidate zips by centroid distance, then aggregate counts
    -- of distinct matching installers per status.
    WITH matching_installers AS (
      SELECT i.id
      FROM public.installers i
      WHERE i.is_active = 1
        AND (p_brands IS NULL OR (
              (NOT ('Hunter Douglas'   = ANY(p_brands)) OR coalesce(i.hunter_douglas,   0) > 0)
          AND (NOT ('Alta'             = ANY(p_brands)) OR coalesce(i.alta,             0) > 0)
          AND (NOT ('Carole'           = ANY(p_brands)) OR coalesce(i.carole,           0) > 0)
          AND (NOT ('Architectural'    = ANY(p_brands)) OR coalesce(i.architectural,    0) > 0)
          AND (NOT ('Levolor'          = ANY(p_brands)) OR coalesce(i.levolor,          0) > 0)
          AND (NOT ('Three Day Blinds' = ANY(p_brands)) OR coalesce(i.three_day_blinds, 0) > 0)
        ))
        AND (p_skills IS NULL OR (
              (NOT ('Blinds & Shades'        = ANY(p_skills)) OR coalesce(i.blinds_and_shades,      0) > 0)
          AND (NOT ('Automation'             = ANY(p_skills)) OR coalesce(i.power_view,             0) > 0)
          AND (NOT ('Shutters'               = ANY(p_skills)) OR coalesce(i.shutters,               0) > 0)
          AND (NOT ('Drapery'                = ANY(p_skills)) OR coalesce(i.draperies,              0) > 0)
          AND (NOT ('Service Call'           = ANY(p_skills)) OR coalesce(i.service_call,           0) > 0)
          AND (NOT ('Tall Window'            = ANY(p_skills)) OR coalesce(i.tall_window,            0) > 0)
          AND (NOT ('Fixture Displays'       = ANY(p_skills)) OR coalesce(i.fixture_displays,       0) > 0)
          AND (NOT ('Outdoor'                = ANY(p_skills)) OR coalesce(i.outdoor,                0) > 0)
          AND (NOT ('High Voltage Hardwired' = ANY(p_skills)) OR coalesce(i.high_voltage_hardwired, 0) > 0)
        ))
        AND (p_certifications IS NULL OR NOT EXISTS (
          SELECT 1
          FROM unnest(p_certifications) AS req(cert)
          WHERE req.cert NOT IN (
            public._standardize_cert(i.pip_certification_level),
            public._standardize_cert(i.shutter_certification_level),
            public._standardize_cert(i.draperies_certification_level),
            public._standardize_cert(i.powerview_certification)
          )
        ))
        AND (p_accepts_shipments IS NOT TRUE OR coalesce(i.shipment, 0) > 0)
    ),
    candidate_zips AS (
      SELECT
        z.zip_code,
        z.state_province,
        z.centroid_latitude  AS lat,
        z.centroid_longitude AS lng
      FROM public.zip_code_geometries z
      WHERE z.centroid_latitude  IS NOT NULL
        AND z.centroid_longitude IS NOT NULL
        AND (
          3959 * acos(
            least(1.0, greatest(-1.0,
              cos(radians(p_lat)) * cos(radians(z.centroid_latitude)) *
              cos(radians(z.centroid_longitude) - radians(p_lng)) +
              sin(radians(p_lat)) * sin(radians(z.centroid_latitude))
            ))
          )
        ) <= p_radius_miles
    ),
    aggregated AS (
      SELECT
        cz.zip_code,
        cz.state_province,
        cz.lat,
        cz.lng,
        count(DISTINCT izc.installer_id) FILTER (WHERE izc.status = 'Approved')      AS free_count,
        count(DISTINCT izc.installer_id) FILTER (WHERE izc.status = 'Needs Approval') AS paid_count
      FROM candidate_zips cz
      JOIN public.installer_zip_codes izc ON izc.zip_code = cz.zip_code
      JOIN matching_installers mi ON mi.id = izc.installer_id
      GROUP BY cz.zip_code, cz.state_province, cz.lat, cz.lng
    )
    SELECT jsonb_build_object(
      'country', 'USA',
      'items', COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'zip',            a.zip_code,
            'state_province', a.state_province,
            'free',           a.free_count,
            'paid',           a.paid_count,
            'centroid_lat',   a.lat,
            'centroid_lng',   a.lng
          )
          ORDER BY a.zip_code
        ),
        '[]'::jsonb
      )
    )
    INTO result
    FROM aggregated a
    WHERE a.free_count + a.paid_count > 0;

  ELSE
    -- Canada path: candidate FSA prefixes derived from postals within
    -- radius, aggregated to FSA = upper(left(replace(postal,' ',''),3)).
    WITH matching_installers AS (
      SELECT i.id
      FROM public.installers i
      WHERE i.is_active = 1
        AND (p_brands IS NULL OR (
              (NOT ('Hunter Douglas'   = ANY(p_brands)) OR coalesce(i.hunter_douglas,   0) > 0)
          AND (NOT ('Alta'             = ANY(p_brands)) OR coalesce(i.alta,             0) > 0)
          AND (NOT ('Carole'           = ANY(p_brands)) OR coalesce(i.carole,           0) > 0)
          AND (NOT ('Architectural'    = ANY(p_brands)) OR coalesce(i.architectural,    0) > 0)
          AND (NOT ('Levolor'          = ANY(p_brands)) OR coalesce(i.levolor,          0) > 0)
          AND (NOT ('Three Day Blinds' = ANY(p_brands)) OR coalesce(i.three_day_blinds, 0) > 0)
        ))
        AND (p_skills IS NULL OR (
              (NOT ('Blinds & Shades'        = ANY(p_skills)) OR coalesce(i.blinds_and_shades,      0) > 0)
          AND (NOT ('Automation'             = ANY(p_skills)) OR coalesce(i.power_view,             0) > 0)
          AND (NOT ('Shutters'               = ANY(p_skills)) OR coalesce(i.shutters,               0) > 0)
          AND (NOT ('Drapery'                = ANY(p_skills)) OR coalesce(i.draperies,              0) > 0)
          AND (NOT ('Service Call'           = ANY(p_skills)) OR coalesce(i.service_call,           0) > 0)
          AND (NOT ('Tall Window'            = ANY(p_skills)) OR coalesce(i.tall_window,            0) > 0)
          AND (NOT ('Fixture Displays'       = ANY(p_skills)) OR coalesce(i.fixture_displays,       0) > 0)
          AND (NOT ('Outdoor'                = ANY(p_skills)) OR coalesce(i.outdoor,                0) > 0)
          AND (NOT ('High Voltage Hardwired' = ANY(p_skills)) OR coalesce(i.high_voltage_hardwired, 0) > 0)
        ))
        AND (p_certifications IS NULL OR NOT EXISTS (
          SELECT 1
          FROM unnest(p_certifications) AS req(cert)
          WHERE req.cert NOT IN (
            public._standardize_cert(i.pip_certification_level),
            public._standardize_cert(i.shutter_certification_level),
            public._standardize_cert(i.draperies_certification_level),
            public._standardize_cert(i.powerview_certification)
          )
        ))
        AND (p_accepts_shipments IS NOT TRUE OR coalesce(i.shipment, 0) > 0)
    ),
    candidate_postals AS (
      SELECT
        upper(left(replace(cpc."POSTAL_CODE", ' ', ''), 3)) AS fsa,
        cpc."PROVINCE_ABBR"                                 AS province_abbr,
        cpc."LATITUDE"                                      AS lat,
        cpc."LONGITUDE"                                     AS lng
      FROM public.canadian_postal_codes cpc
      WHERE cpc."POSTAL_CODE" IS NOT NULL
        AND cpc."LATITUDE"    IS NOT NULL
        AND cpc."LONGITUDE"   IS NOT NULL
        AND (
          3959 * acos(
            least(1.0, greatest(-1.0,
              cos(radians(p_lat)) * cos(radians(cpc."LATITUDE")) *
              cos(radians(cpc."LONGITUDE") - radians(p_lng)) +
              sin(radians(p_lat)) * sin(radians(cpc."LATITUDE"))
            ))
          )
        ) <= p_radius_miles
    ),
    fsa_centroids AS (
      SELECT
        fsa,
        -- Single province per FSA in practice; pick lexicographic min as
        -- the canonical label.
        min(province_abbr) AS province_abbr,
        avg(lat)           AS lat,
        avg(lng)           AS lng
      FROM candidate_postals
      GROUP BY fsa
    ),
    aggregated AS (
      SELECT
        f.fsa            AS zip_code,
        f.province_abbr  AS state_province,
        f.lat,
        f.lng,
        count(DISTINCT izc.installer_id) FILTER (WHERE izc.status = 'Approved')      AS free_count,
        count(DISTINCT izc.installer_id) FILTER (WHERE izc.status = 'Needs Approval') AS paid_count
      FROM fsa_centroids f
      JOIN public.installer_zip_codes izc
             ON upper(left(replace(izc.zip_code, ' ', ''), 3)) = f.fsa
      JOIN matching_installers mi ON mi.id = izc.installer_id
      GROUP BY f.fsa, f.province_abbr, f.lat, f.lng
    )
    SELECT jsonb_build_object(
      'country', 'Canada',
      'items', COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'zip',            a.zip_code,
            'state_province', a.state_province,
            'free',           a.free_count,
            'paid',           a.paid_count,
            'centroid_lat',   a.lat,
            'centroid_lng',   a.lng
          )
          ORDER BY a.zip_code
        ),
        '[]'::jsonb
      )
    )
    INTO result
    FROM aggregated a
    WHERE a.free_count + a.paid_count > 0;
  END IF;

  RETURN COALESCE(result, jsonb_build_object('country', p_country, 'items', '[]'::jsonb));
END;
$$;

-- 30s ceiling: a 250 mi search hits up to ~3k US zips. With existing indexes
-- on installer_zip_codes(zip_code) + canadian_postal_codes FSA prefix index
-- (0173) this returns well under that, but cold-cache scans of the larger
-- tables can spike on first call.
ALTER FUNCTION public.get_zip_coverage_aggregate(
  text, double precision, double precision, double precision,
  text[], text[], text[], boolean
) SET statement_timeout = '30s';

GRANT EXECUTE ON FUNCTION public.get_zip_coverage_aggregate(
  text, double precision, double precision, double precision,
  text[], text[], text[], boolean
) TO anon, authenticated;


-- =============================================================================
-- public.get_public_zip_geometries_in_radius
--   Companion to get_zip_coverage_aggregate. Returns the polygon shapes for
--   every US ZIP whose centroid sits within p_radius_miles of (p_lat,p_lng),
--   wrapped in a GeoJSON FeatureCollection.
--
--   Why a separate function instead of inlining geometries into the
--   aggregate response: a 250 mi search can touch ~3k zips and each
--   polygon serializes to ~2-5 KB; combining them risks 5-15 MB JSON
--   payloads. Splitting lets the frontend defer the polygon fetch until
--   the user opts into the overlay (or auto-pads the visible viewport).
--
--   Hard cap of 5000 features keeps an accidental wide-radius call from
--   pulling the entire table. Beyond that the frontend should re-query
--   with a smaller radius (e.g. clamp to viewport).
--
--   Canadian FSA polygons live in a static client-side asset for now;
--   server-side FSA geometry will land in a follow-up.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_public_zip_geometries_in_radius(
  p_lat           double precision,
  p_lng           double precision,
  p_radius_miles  double precision
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result jsonb;
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL OR p_radius_miles IS NULL OR p_radius_miles <= 0 THEN
    RETURN jsonb_build_object('type', 'FeatureCollection', 'features', '[]'::jsonb);
  END IF;

  WITH candidate_zips AS (
    SELECT
      z.zip_code,
      z.state_province,
      z.geometry,
      z.centroid_latitude,
      z.centroid_longitude,
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
  double precision, double precision, double precision
) SET statement_timeout = '20s';

GRANT EXECUTE ON FUNCTION public.get_public_zip_geometries_in_radius(
  double precision, double precision, double precision
) TO anon, authenticated;
