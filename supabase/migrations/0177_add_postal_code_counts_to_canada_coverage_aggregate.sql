-- =============================================================================
-- Coverage overlay: postal-code granularity for Canadian FSAs.
--
-- An FSA (e.g. "M5V") contains dozens or hundreds of 6-character postal
-- codes. The Canada path of get_zip_coverage_aggregate already counts
-- installers per FSA (free / paid), but treating an FSA as "covered"
-- whenever any postal inside it is covered hides a really common case:
-- an installer who only services a handful of postal codes inside an
-- otherwise-uncovered FSA. The overlay then paints the whole FSA
-- polygon solid green, which reads as "fully covered" even though
-- 95% of the FSA has no service.
--
-- TerritoryMap.tsx solves this for the admin editor by also counting
-- distinct postal codes assigned in each FSA and comparing against the
-- FSA total. This migration brings the same data shape to the public
-- coverage aggregate so the overlay can distinguish "fully covered"
-- from "partial coverage" the same way:
--
--   * free_postal_codes  -- distinct postals in this FSA covered as Approved
--                           by ANY matching installer
--   * paid_postal_codes  -- distinct postals in this FSA covered as
--                           Needs Approval by ANY matching installer
--
-- The frontend already loads the canonical FSA -> total_postal_count
-- map via `useCanadianFsaPostalCounts`, so once these counts are in
-- the response it can compute (free + paid) / total and pick a
-- "partial" pattern when the ratio is under 99%.
--
-- For US ZIPs the same fields are returned for shape consistency but
-- they're effectively 0/1 per row (each zip IS one postal code), so
-- nothing about US rendering changes.
--
-- Postgres can't add columns to the JSONB shape via CREATE OR REPLACE
-- alone when the function body changes, but we don't need to drop the
-- function this time (the parameter list is unchanged). CREATE OR
-- REPLACE is enough.
-- =============================================================================

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
        count(DISTINCT izc.installer_id) FILTER (WHERE izc.status = 'Approved')      AS free_count,
        count(DISTINCT izc.installer_id) FILTER (WHERE izc.status = 'Needs Approval') AS paid_count,
        count(DISTINCT izc.zip_code)     FILTER (WHERE izc.status = 'Approved')      AS free_postal_codes,
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
        min(province_abbr) AS province_abbr,
        avg(lat)           AS lat,
        avg(lng)           AS lng
      FROM candidate_postals
      GROUP BY fsa
    ),
    -- Per-FSA postal-code aggregation. We normalize installer_zip_codes
    -- to the same shape canadian_postal_codes uses (trimmed + upper)
    -- before counting distinct postals, otherwise "m5v 1a1" and
    -- "M5V 1A1" would double-count.
    fsa_postal_aggregates AS (
      SELECT
        upper(left(replace(izc.zip_code, ' ', ''), 3)) AS fsa,
        count(DISTINCT izc.installer_id)
          FILTER (WHERE izc.status = 'Approved')                                AS free_installers,
        count(DISTINCT izc.installer_id)
          FILTER (WHERE izc.status = 'Needs Approval')                          AS paid_installers,
        count(DISTINCT upper(replace(izc.zip_code, ' ', '')))
          FILTER (WHERE izc.status = 'Approved')                                AS free_postal_codes,
        count(DISTINCT upper(replace(izc.zip_code, ' ', '')))
          FILTER (WHERE izc.status = 'Needs Approval')                          AS paid_postal_codes
      FROM public.installer_zip_codes izc
      JOIN matching_installers mi ON mi.id = izc.installer_id
      GROUP BY upper(left(replace(izc.zip_code, ' ', ''), 3))
    ),
    aggregated AS (
      SELECT
        f.fsa            AS zip_code,
        f.province_abbr  AS state_province,
        f.lat,
        f.lng,
        COALESCE(fpa.free_installers,    0) AS free_count,
        COALESCE(fpa.paid_installers,    0) AS paid_count,
        COALESCE(fpa.free_postal_codes,  0) AS free_postal_codes,
        COALESCE(fpa.paid_postal_codes,  0) AS paid_postal_codes
      FROM fsa_centroids f
      JOIN fsa_postal_aggregates fpa ON fpa.fsa = f.fsa
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

ALTER FUNCTION public.get_zip_coverage_aggregate(
  text, double precision, double precision, double precision,
  text[], text[], text[], boolean, text[]
) SET statement_timeout = '30s';

GRANT EXECUTE ON FUNCTION public.get_zip_coverage_aggregate(
  text, double precision, double precision, double precision,
  text[], text[], text[], boolean, text[]
) TO anon, authenticated;
