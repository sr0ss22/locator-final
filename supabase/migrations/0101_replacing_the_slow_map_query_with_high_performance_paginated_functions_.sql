-- Drop the function that aggregates into a single JSON object
DROP FUNCTION IF EXISTS public.get_all_canadian_points_in_radius_as_json(double precision, double precision, double precision);

-- Create a function to get the total count of matching points
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
    total_count integer;
BEGIN
    center_point := ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography;
    
    SELECT count(*)
    INTO total_count
    FROM public.canadian_postal_codes cpc
    WHERE cpc.geog IS NOT NULL AND ST_DWithin(cpc.geog, center_point, radius_meters, true);

    RETURN total_count;
END;
$$;

-- Create a paginated function to fetch points
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
    ORDER BY
        cpc.id -- Add a stable order for pagination
    LIMIT page_size
    OFFSET offset_val;
END;
$$;