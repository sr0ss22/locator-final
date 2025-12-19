-- Step 1: Drop the old function to ensure a clean update.
DROP FUNCTION IF EXISTS public.get_clustered_canadian_map_data(integer, double precision, double precision, double precision, double precision, double precision, double precision, double precision);

-- Step 2: Create a new, fast function to get ONLY the count of points in a radius.
CREATE OR REPLACE FUNCTION public.get_canadian_points_in_radius_count(
    center_lat double precision,
    center_lng double precision,
    radius_meters double precision
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    center_point GEOGRAPHY;
    point_count integer;
BEGIN
    center_point := ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography;
    
    SELECT count(*)
    INTO point_count
    FROM public.canadian_postal_codes cpc
    WHERE cpc.geog IS NOT NULL AND ST_DWithin(cpc.geog, center_point, radius_meters);

    RETURN point_count;
END;
$$;

-- Step 3: Recreate the main data function with pagination support to serve data in chunks.
CREATE OR REPLACE FUNCTION public.get_clustered_canadian_map_data(
    zoom integer,
    min_lon double precision,
    min_lat double precision,
    max_lon double precision,
    max_lat double precision,
    center_lat double precision DEFAULT NULL,
    center_lng double precision DEFAULT NULL,
    radius_meters double precision DEFAULT NULL,
    page_size integer DEFAULT 1000,
    page_number integer DEFAULT 1
)
RETURNS TABLE(
    id uuid,
    "LATITUDE" double precision,
    "LONGITUDE" double precision,
    is_cluster boolean,
    point_count bigint,
    "POSTAL_CODE" text,
    "PROVINCE_ABBR" text
)
LANGUAGE plpgsql
AS $$
DECLARE
    bbox GEOGRAPHY;
    center_point GEOGRAPHY;
    query_offset integer;
BEGIN
    -- If a radius is provided, fetch a paginated set of individual points.
    IF radius_meters IS NOT NULL AND center_lat IS NOT NULL AND center_lng IS NOT NULL THEN
        center_point := ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography;
        query_offset := (page_number - 1) * page_size;
        
        RETURN QUERY
        SELECT
            cpc.id,
            cpc."LATITUDE",
            cpc."LONGITUDE",
            false AS is_cluster,
            1::bigint AS point_count,
            cpc."POSTAL_CODE",
            cpc."PROVINCE_ABBR"
        FROM
            public.canadian_postal_codes cpc
        WHERE
            cpc.geog IS NOT NULL AND ST_DWithin(cpc.geog, center_point, radius_meters)
        ORDER BY cpc.id -- A stable order is crucial for reliable pagination
        LIMIT page_size
        OFFSET query_offset;
        RETURN;
    END IF;

    -- If NO radius is provided (overview map), use FSA clusters.
    bbox := ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)::geography;
    RETURN QUERY
    SELECT
        gen_random_uuid() as id,
        cfs.latitude as "LATITUDE",
        cfs.longitude as "LONGITUDE",
        true AS is_cluster,
        cfs.point_count,
        cfs.fsa as "POSTAL_CODE",
        NULL::text as "PROVINCE_ABBR"
    FROM
        public.canadian_fsa_stats cfs
    WHERE
        ST_Intersects(cfs.geog, bbox);
END;
$$;