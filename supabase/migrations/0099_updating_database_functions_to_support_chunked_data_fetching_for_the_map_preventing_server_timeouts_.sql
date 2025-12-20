-- Drop the old function that fetched all data at once
DROP FUNCTION IF EXISTS public.get_all_canadian_points_in_radius(center_lat double precision, center_lng double precision, radius_meters double precision);

-- Create a new function to get only the total count of points, which is very fast
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
    WHERE cpc.geog IS NOT NULL AND ST_DWithin(cpc.geog, center_point, radius_meters, true);

    RETURN point_count;
END;
$$;

-- Create a new paginated function to fetch data in manageable chunks
CREATE OR REPLACE FUNCTION public.get_all_canadian_points_in_radius(
    center_lat double precision,
    center_lng double precision,
    radius_meters double precision,
    page_size integer,
    page_number integer
)
RETURNS TABLE(id uuid, "POSTAL_CODE" text, "PROVINCE_ABBR" text, "LATITUDE" double precision, "LONGITUDE" double precision)
LANGUAGE plpgsql
AS $$
DECLARE
    center_point GEOGRAPHY;
    offset_val integer;
BEGIN
    center_point := ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography;
    offset_val := (page_number - 1) * page_size;
    
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
        cpc.geog IS NOT NULL AND ST_DWithin(cpc.geog, center_point, radius_meters, true)
    ORDER BY cpc.id -- Add a stable order for pagination
    LIMIT page_size
    OFFSET offset_val;
END;
$$;