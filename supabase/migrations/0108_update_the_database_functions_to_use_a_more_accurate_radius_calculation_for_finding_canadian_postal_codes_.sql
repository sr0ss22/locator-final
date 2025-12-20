-- Drop the existing functions to replace them
DROP FUNCTION IF EXISTS public.get_canadian_points_in_radius_count(double precision, double precision, double precision);
DROP FUNCTION IF EXISTS public.get_all_canadian_points_in_radius(double precision, double precision, double precision, integer, integer);

-- Recreate the count function with the more accurate spheroid calculation
CREATE OR REPLACE FUNCTION public.get_canadian_points_in_radius_count(
    center_lat double precision, 
    center_lng double precision, 
    radius_meters double precision
)
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
    center_point GEOGRAPHY;
    total_count integer;
BEGIN
    center_point := ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography;
    
    SELECT count(*)
    INTO total_count
    FROM public.canadian_postal_codes cpc
    WHERE 
        -- Use the more accurate spheroid calculation (true)
        ST_DWithin(cpc.geog, center_point, radius_meters, true);

    RETURN total_count;
END;
$function$;

-- Recreate the data fetching function with the more accurate spheroid calculation
CREATE OR REPLACE FUNCTION public.get_all_canadian_points_in_radius(
    center_lat double precision, 
    center_lng double precision, 
    radius_meters double precision, 
    page_size integer, 
    page_number integer
)
RETURNS TABLE(id uuid, "POSTAL_CODE" text, "PROVINCE_ABBR" text, "LATITUDE" double precision, "LONGITUDE" double precision)
LANGUAGE plpgsql
AS $function$
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
        -- Use the more accurate spheroid calculation (true)
        ST_DWithin(cpc.geog, center_point, radius_meters, true)
    ORDER BY
        cpc.id -- Stable order for pagination
    LIMIT page_size
    OFFSET offset_val;
END;
$function$;