-- Step 1: Drop the old function to ensure a clean update.
DROP FUNCTION IF EXISTS public.get_clustered_canadian_map_data(integer, double precision, double precision, double precision, double precision, double precision, double precision, double precision);

-- Step 2: Re-create the functional index to optimize queries on raw coordinates.
-- This index will speed up the second part of our UNION ALL query.
CREATE INDEX IF NOT EXISTS canadian_postal_codes_functional_geog_idx
ON public.canadian_postal_codes
USING GIST ( (ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography) );

-- Step 3: Recreate the function using a UNION ALL strategy to avoid the slow OR clause.
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
        -- HIGH ZOOM: Use UNION ALL to combine indexed and non-indexed queries efficiently.
        RETURN QUERY
        -- Part 1: Fast query for records with a pre-calculated 'geog' value
        SELECT
            cpc.id, cpc."LATITUDE", cpc."LONGITUDE", false AS is_cluster, 1::bigint AS point_count, cpc."POSTAL_CODE"
        FROM
            public.canadian_postal_codes cpc
        WHERE
            cpc.geog IS NOT NULL AND ST_DWithin(cpc.geog, center_point, radius_meters)
        
        UNION ALL
        
        -- Part 2: Slower, but correct, query for records missing the 'geog' value, using the functional index.
        SELECT
            cpc.id, cpc."LATITUDE", cpc."LONGITUDE", false AS is_cluster, 1::bigint AS point_count, cpc."POSTAL_CODE"
        FROM
            public.canadian_postal_codes cpc
        WHERE
            cpc.geog IS NULL 
            AND cpc."LATITUDE" IS NOT NULL AND cpc."LONGITUDE" IS NOT NULL
            AND ST_DWithin(
                ST_SetSRID(ST_MakePoint(cpc."LONGITUDE", cpc."LATITUDE"), 4326)::geography,
                center_point,
                radius_meters
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