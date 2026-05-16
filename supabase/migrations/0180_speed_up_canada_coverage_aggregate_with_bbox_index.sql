-- =============================================================================
-- Performance: avoid full-table haversine scan on canadian_postal_codes.
--
-- Root cause
-- ----------
-- get_zip_coverage_aggregate's Canada path (candidate_postals CTE) applies
-- the haversine distance formula to all ~860k rows in canadian_postal_codes
-- before filtering. PostgreSQL cannot use any index on a computed expression
-- like `3959 * acos(...)`, so every query does a sequential scan.
--
-- At 100-mile radius around a dense city (Toronto, Montreal, Vancouver) this
-- takes 20-30 s and hits the statement_timeout of 30 s.
--
-- Fix
-- ---
-- 1. Add btree indexes on LATITUDE and LONGITUDE separately.  PostgreSQL's
--    bitmap index intersection can satisfy the bounding-box clause
--    (LATITUDE BETWEEN ... AND LONGITUDE BETWEEN ...) using both indexes
--    via BitmapAnd, cutting the haversine candidates from 860k to ~50-100k
--    for a 100-mile radius.
--
-- 2. Add the bounding-box pre-filter to the candidate_postals CTE so the
--    index can be used.  The haversine is kept as a second pass for
--    correctness (a bbox overestimates, corners of the box are outside the
--    circle).
--
-- 3. Raise statement_timeout to 45 s to give the refactored query headroom
--    even for the very largest Canadian radii (800 km = 500 miles).
--
-- Conversion factors used in the bbox:
--   1 degree latitude  ≈ 69.0 miles (close enough for a generous bbox)
--   1 degree longitude ≈ 69.0 * cos(lat) miles
--   We add a 2% margin so the bbox never clips right at the boundary.
-- =============================================================================

-- Index on LATITUDE for the bbox lower/upper bound filter.
CREATE INDEX IF NOT EXISTS idx_canadian_postal_codes_latitude
  ON public.canadian_postal_codes ("LATITUDE");

-- Index on LONGITUDE for the bbox lower/upper bound filter.
CREATE INDEX IF NOT EXISTS idx_canadian_postal_codes_longitude
  ON public.canadian_postal_codes ("LONGITUDE");

-- Replace get_zip_coverage_aggregate with the bbox-optimised version.
-- Only the Canada path (candidate_postals CTE) changes; the USA path is
-- identical to 0177.
CREATE OR REPLACE FUNCTION public.get_zip_coverage_aggregate(
  p_country            text,
  p_lat                double precision,
  p_lng                double precision,
  p_radius_miles       double precision,
  p_brands             text[]  DEFAULT NULL,
  p_skills             text[]  DEFAULT NULL,
  p_certifications     text[]  DEFAULT NULL,
  p_accepts_shipments  boolean DEFAULT NULL,
  p_installer_ids      text[]  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result       jsonb;
  -- Bounding-box half-widths (generous; the haversine clips to the circle).
  bbox_lat_d   double precision;
  bbox_lng_d   double precision;
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

  -- Pre-compute bounding box deltas once, used only by the Canada path.
  -- Add 2 % margin so the bbox never clips right at the circle boundary.
  bbox_lat_d := (p_radius_miles / 69.0) * 1.02;
  bbox_lng_d := (p_radius_miles / (69.0 * cos(radians(p_lat)))) * 1.02;

  IF p_country = 'USA' THEN
    WITH matching_installers AS (
      SELECT i.id
      FROM public.installers i
      WHERE i.is_active = 1
        AND (p_installer_ids IS NULL OR i.id = ANY(p_installer_ids))
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
        count(DISTINCT izc.installer_id) FILTER (WHERE izc.status = 'Approved')       AS free_count,
        count(DISTINCT izc.installer_id) FILTER (WHERE izc.status = 'Needs Approval') AS paid_count,
        count(DISTINCT izc.zip_code)     FILTER (WHERE izc.status = 'Approved')       AS free_postal_codes,
        count(DISTINCT izc.zip_code)     FILTER (WHERE izc.status = 'Needs Approval') AS paid_postal_codes
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
            'zip',               a.zip_code,
            'state_province',    a.state_province,
            'free',              a.free_count,
            'paid',              a.paid_count,
            'free_postal_codes', a.free_postal_codes,
            'paid_postal_codes', a.paid_postal_codes,
            'centroid_lat',      a.lat,
            'centroid_lng',      a.lng
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
    -- Canada path. Two-phase radius filter:
    --   Phase 1 (bbox): LATITUDE/LONGITUDE range uses the new btree
    --           indexes via BitmapAnd — drops candidates from ~860k to
    --           a few thousand for typical radii.
    --   Phase 2 (haversine): applied to the small bbox survivor set for
    --           correctness (the bbox corners are outside the circle).
    WITH matching_installers AS (
      SELECT i.id
      FROM public.installers i
      WHERE i.is_active = 1
        AND (p_installer_ids IS NULL OR i.id = ANY(p_installer_ids))
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
        cpc."PROVINCE_ABBR"                                  AS province_abbr,
        cpc."LATITUDE"                                       AS lat,
        cpc."LONGITUDE"                                      AS lng
      FROM public.canadian_postal_codes cpc
      WHERE cpc."POSTAL_CODE" IS NOT NULL
        AND cpc."LATITUDE"    IS NOT NULL
        AND cpc."LONGITUDE"   IS NOT NULL
        -- Phase 1: bounding-box filter (uses idx_canadian_postal_codes_latitude
        -- + idx_canadian_postal_codes_longitude via BitmapAnd). Drops ~98% of
        -- rows before the haversine even runs.
        AND cpc."LATITUDE"  BETWEEN (p_lat - bbox_lat_d) AND (p_lat + bbox_lat_d)
        AND cpc."LONGITUDE" BETWEEN (p_lng - bbox_lng_d) AND (p_lng + bbox_lng_d)
        -- Phase 2: exact haversine on the bbox survivors.
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
        min(province_abbr) AS province_abbr,
        avg(lat)           AS lat,
        avg(lng)           AS lng
      FROM candidate_postals
      GROUP BY fsa
    ),
    fsa_keys AS (
      SELECT fsa FROM fsa_centroids
    ),
    izc_normalized AS (
      SELECT
        upper(left(replace(izc.zip_code, ' ', ''), 3)) AS fsa,
        upper(replace(izc.zip_code, ' ', ''))           AS zip_norm,
        izc.installer_id,
        izc.status
      FROM public.installer_zip_codes izc
      WHERE upper(left(replace(izc.zip_code, ' ', ''), 3)) IN (SELECT fsa FROM fsa_keys)
    ),
    aggregated AS (
      SELECT
        f.fsa            AS zip_code,
        f.province_abbr  AS state_province,
        f.lat,
        f.lng,
        count(DISTINCT n.installer_id) FILTER (WHERE n.status = 'Approved')       AS free_count,
        count(DISTINCT n.installer_id) FILTER (WHERE n.status = 'Needs Approval') AS paid_count,
        count(DISTINCT n.zip_norm)     FILTER (WHERE n.status = 'Approved')       AS free_postal_codes,
        count(DISTINCT n.zip_norm)     FILTER (WHERE n.status = 'Needs Approval') AS paid_postal_codes
      FROM fsa_centroids f
      JOIN izc_normalized n       ON n.fsa = f.fsa
      JOIN matching_installers mi ON mi.id = n.installer_id
      GROUP BY f.fsa, f.province_abbr, f.lat, f.lng
    )
    SELECT jsonb_build_object(
      'country', 'Canada',
      'items', COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'zip',               a.zip_code,
            'state_province',    a.state_province,
            'free',              a.free_count,
            'paid',              a.paid_count,
            'free_postal_codes', a.free_postal_codes,
            'paid_postal_codes', a.paid_postal_codes,
            'centroid_lat',      a.lat,
            'centroid_lng',      a.lng
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

-- Raise timeout to 45 s — gives the bbox-filtered query comfortable
-- headroom even for the largest Canadian radii (800 km / 500 miles).
ALTER FUNCTION public.get_zip_coverage_aggregate(
  text, double precision, double precision, double precision,
  text[], text[], text[], boolean, text[]
) SET statement_timeout = '45s';

GRANT EXECUTE ON FUNCTION public.get_zip_coverage_aggregate(
  text, double precision, double precision, double precision,
  text[], text[], text[], boolean, text[]
) TO anon, authenticated;
