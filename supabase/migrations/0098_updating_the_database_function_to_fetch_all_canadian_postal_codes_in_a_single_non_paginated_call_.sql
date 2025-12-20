-- Drop the old paginated function
DROP FUNCTION IF EXISTS public.get_all_canadian_points_in_radius(center_lat double precision, center_lng double precision, radius_meters double precision, page_size integer, page_number integer);

-- Create the new function to get all points at once
CREATE OR REPLACE FUNCTION public.get_all_canadian_points_in_radius(
    center_lat double precision,
    center_lng double precision,
    radius_meters double precision
)
RETURNS TABLE(id uuid, "POSTAL_CODE" text, "PROVINCE_ABBR" text, "LATITUDE" double precision, "LONGITUDE" double precision)
LANGUAGE plpgsql
AS $$
DECLARE
    center_point GEOGRAPHY;
BEGIN
    center_point := ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography;
    
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
        cpc.geog IS NOT NULL AND ST_DWithin(cpc.geog, center_point, radius_meters, true);
END;
$$;