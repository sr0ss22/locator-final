-- Drop the previous function to ensure a clean update.
DROP FUNCTION IF EXISTS public.get_clustered_canadian_map_data(integer, double precision, double precision, double precision, double precision, double precision, double precision, double precision);

-- Drop the functional index if it exists from a previous attempt, as it's not needed for this strategy.
DROP INDEX IF EXISTS public.canadian_postal_codes_functional_geog_idx;

-- Recreate the function with a hybrid query strategy.
-- This uses the fast, indexed 'geog' column for most records,
-- but falls back to an on-the-fly calculation for any records where 'geog' is missing.
-- This provides both performance and correctness.
CREATE OR REPLACE FUNCTION public.get_clustered_canadian_map_data(
    zoom integer,
    min_lon double precision,
    min_lat double precision,
    max_lon double precision,
    max_lat double precision,
    center_lat double precision DEFAULT NULL,
    center_lng double precision DEFAULT NULL,
    radius_meters double precision DEFAULT NULL
)
RETURNS TABLE(
    id uuid,
    "LATITUDE" double precision,
    "LONGITUDE" double precision,
    is_cluster boolean,
    point_count bigint,
    "POSTAL_CODE" text
)
LANGUAGE plpgsql
AS $$
DECLARE
    bbox GEOGRAPHY;
    center_point GEOGRAPHY;
BEGIN
    bbox := ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)::geography;

    IF center_lat IS NOT NULL AND center_lng IS NOT NULL THEN
        center_point := ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography;
    END IF;

    -- Overview map (no radius) - use FSA clusters.
    IF radius_meters IS NULL THEN
        RETURN QUERY
        SELECT
            gen_random_uuid() as id,
            cfs.latitude as "LATITUDE",
            cfs.longitude as "LONGITUDE",
            true AS is_cluster,
            cfs.point_count,
            cfs.fsa as "POSTAL_CODE"
        FROM
            public.canadian_fsa_stats cfs
        WHERE
            ST_Intersects(cfs.geog, bbox);
        RETURN;
    END IF;

    -- Installer-specific map (radius provided)
    IF zoom > 9 THEN
        -- HIGH ZOOM: Use a hybrid query.
        -- It prioritizes the fast, indexed 'geog' column but includes a fallback for any records
        -- where 'geog' might be null, ensuring all points are found without sacrificing performance.
        RETURN QUERY
        SELECT
            cpc.id,
            cpc."LATITUDE",
            cpc."LONGITUDE",
            false AS is_cluster,
            1::bigint AS point_count,
            cpc."POSTAL_CODE"
        FROM
            public.canadian_postal_codes cpc
        WHERE
            cpc."LATITUDE" IS NOT NULL AND cpc."LONGITUDE" IS NOT NULL AND
            (
                (cpc.geog IS NOT NULL AND ST_DWithin(cpc.geog, center_point, radius_meters))
                OR
                (cpc.geog IS NULL AND ST_DWithin(ST_SetSRID(ST_MakePoint(cpc."LONGITUDE", cpc."LATITUDE"), 4326)::geography, center_point, radius_meters))
            );
            
    ELSE
        -- LOW/MID ZOOM: Use FSA clusters.
        RETURN QUERY
        SELECT
            gen_random_uuid() as id,
            cfs.latitude as "LATITUDE",
            cfs.longitude as "LONGITUDE",
            true AS is_cluster,
            cfs.point_count,
            cfs.fsa as "POSTAL_CODE"
        FROM
            public.canadian_fsa_stats cfs
        WHERE
            ST_DWithin(cfs.geog, center_point, radius_meters)
            AND ST_Intersects(cfs.geog, bbox);
    END IF;
END;
$$;