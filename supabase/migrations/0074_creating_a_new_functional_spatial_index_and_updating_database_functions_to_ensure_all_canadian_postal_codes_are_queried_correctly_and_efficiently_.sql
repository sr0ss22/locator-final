-- Step 1: Drop the old, problematic function.
DROP FUNCTION IF EXISTS public.get_clustered_canadian_map_data(integer, double precision, double precision, double precision, double precision, double precision, double precision, double precision);

-- Step 2: Create a new, more robust functional index directly on the coordinate columns.
-- This ensures that ALL records with coordinates are indexed, bypassing any issues with the 'geog' column.
-- The condition `WHERE "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL` makes the index smaller and more efficient.
CREATE INDEX IF NOT EXISTS canadian_postal_codes_coords_geog_idx
ON public.canadian_postal_codes
USING GIST ( (ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography) )
WHERE "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL;

-- Step 3: Recreate the function to be simpler and more performant, using the new index.
-- This version ALWAYS returns individual points for radius searches, as requested.
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
    -- If a radius is provided (installer-specific map), ALWAYS fetch individual points.
    IF radius_meters IS NOT NULL AND center_lat IS NOT NULL AND center_lng IS NOT NULL THEN
        center_point := ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography;
        
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
            -- This query is now optimized by the new functional index.
            cpc."LONGITUDE" IS NOT NULL AND cpc."LATITUDE" IS NOT NULL
            AND ST_DWithin(
                ST_SetSRID(ST_MakePoint(cpc."LONGITUDE", cpc."LATITUDE"), 4326)::geography,
                center_point,
                radius_meters
            );
        RETURN;
    END IF;

    -- If NO radius is provided (overview map), use the pre-calculated FSA clusters for performance.
    bbox := ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)::geography;
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
END;
$$;