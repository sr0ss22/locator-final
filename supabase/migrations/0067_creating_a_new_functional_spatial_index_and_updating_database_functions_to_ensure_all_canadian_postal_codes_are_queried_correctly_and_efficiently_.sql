-- Step 1: Run a one-time update to ensure all existing records have the necessary geography data.
UPDATE public.canadian_postal_codes
SET geog = ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography
WHERE geog IS NULL AND "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL;

-- Step 2: Create a new, more robust functional index directly on the coordinates.
-- This ensures the query planner always has a fast and reliable index to use.
CREATE INDEX IF NOT EXISTS canadian_postal_codes_functional_geog_idx
ON public.canadian_postal_codes
USING GIST ( (ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography) );

-- Step 3: Drop the old function to replace it with the corrected version.
DROP FUNCTION IF EXISTS public.get_clustered_canadian_map_data(integer, double precision, double precision, double precision, double precision, double precision, double precision, double precision);

-- Step 4: Recreate the function to use the new, robust query logic.
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

    -- Overview map (no radius) - always use fast FSA clusters.
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
        -- HIGH ZOOM: Show ALL individual postal codes within the radius.
        -- This query now uses the functional index for maximum reliability.
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
            ST_DWithin(
                ST_SetSRID(ST_MakePoint(cpc."LONGITUDE", cpc."LATITUDE"), 4326)::geography,
                center_point,
                radius_meters
            );
            
    ELSE
        -- LOW/MID ZOOM: Show FSA clusters within the radius AND visible map bounds.
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