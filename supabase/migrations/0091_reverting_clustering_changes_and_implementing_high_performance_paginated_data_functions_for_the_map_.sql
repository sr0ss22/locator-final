-- Step 1: Revert previous changes by dropping the clustering function and summary table
DROP FUNCTION IF EXISTS public.get_clustered_canadian_map_data(integer,double precision,double precision,double precision,double precision,double precision,double precision,double precision,integer,integer);
DROP TABLE IF EXISTS public.canadian_fsa_stats;

-- Step 2: Create a new, fast function to get the TOTAL count of points in a radius
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
    WHERE ST_DWithin(cpc.geog, center_point, radius_meters, false);

    RETURN point_count;
END;
$$;

-- Step 3: Update the main data fetching function to support high-performance pagination
DROP FUNCTION IF EXISTS public.get_all_canadian_points_in_radius(double precision,double precision,double precision);
CREATE OR REPLACE FUNCTION public.get_all_canadian_points_in_radius(
    center_lat double precision,
    center_lng double precision,
    radius_meters double precision,
    page_size integer DEFAULT 20000,
    page_number integer DEFAULT 1
)
RETURNS TABLE(id uuid, "POSTAL_CODE" text, "PROVINCE_ABBR" text, "LATITUDE" double precision, "LONGITUDE" double precision)
LANGUAGE plpgsql
AS $$
DECLARE
    center_point GEOGRAPHY;
    query_offset integer;
BEGIN
    center_point := ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography;
    query_offset := (page_number - 1) * page_size;
    
    RETURN QUERY
    SELECT
        cpc.id,
        cpc."POSTAL_CODE",
        cpc."PROVINCE_ABBR",
        cpc."LATITUDE",
        cpc."LONGITUDE"
    FROM
        public.canadian_postal_codes cpc
    WHERE
        ST_DWithin(cpc.geog, center_point, radius_meters, false)
    ORDER BY cpc.id -- Add a stable order for consistent pagination
    LIMIT page_size
    OFFSET query_offset;
END;
$$;