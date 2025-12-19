-- Step 1: Drop the old function and any previous, less effective indexes.
DROP FUNCTION IF EXISTS public.get_clustered_canadian_map_data(integer, double precision, double precision, double precision, double precision, double precision, double precision, double precision);
DROP INDEX IF EXISTS public.canadian_postal_codes_coords_geog_idx;

-- Step 2: Create the most standard and optimal GIST index directly on the 'geog' column.
-- This is the textbook method for ensuring fast spatial queries.
CREATE INDEX IF NOT EXISTS canadian_postal_codes_geog_idx ON public.canadian_postal_codes USING GIST (geog);

-- Step 3: Update table statistics to ensure the query planner uses the new, correct index immediately.
ANALYZE public.canadian_postal_codes;

-- Step 4: Recreate the function to use a simple, direct query that leverages the new index.
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
            -- This simplified query now uses the direct 'geog' column, which is properly indexed.
            cpc.geog IS NOT NULL AND ST_DWithin(cpc.geog, center_point, radius_meters);
        RETURN;
    END IF;

    -- If NO radius is provided (overview map), use FSA clusters for performance.
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