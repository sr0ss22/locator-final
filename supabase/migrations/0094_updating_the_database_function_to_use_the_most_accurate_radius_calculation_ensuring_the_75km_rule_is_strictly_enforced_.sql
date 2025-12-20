-- Recreate the function to ensure it's correct and robust
DROP FUNCTION IF EXISTS public.get_all_canadian_points_in_radius(double precision,double precision,double precision,integer,integer);
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
        cpc.geog IS NOT NULL AND ST_DWithin(cpc.geog, center_point, radius_meters) -- Use default, most accurate spheroid calculation
    ORDER BY cpc.id -- A stable order is crucial for consistent pagination
    LIMIT page_size
    OFFSET query_offset;
END;
$$;