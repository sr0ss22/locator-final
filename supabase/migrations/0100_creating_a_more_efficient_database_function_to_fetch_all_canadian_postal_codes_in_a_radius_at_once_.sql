-- Drop the old paginated function and count function as they are no longer needed
DROP FUNCTION IF EXISTS public.get_all_canadian_points_in_radius(double precision, double precision, double precision, integer, integer);
DROP FUNCTION IF EXISTS public.get_canadian_points_in_radius_count(double precision, double precision, double precision);

-- Create a new function that returns all results as a single JSON array
CREATE OR REPLACE FUNCTION public.get_all_canadian_points_in_radius_as_json(
    center_lat double precision,
    center_lng double precision,
    radius_meters double precision
)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
    center_point GEOGRAPHY;
BEGIN
    center_point := ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography;
    
    RETURN (
        SELECT json_agg(
            json_build_object(
                'id', cpc.id,
                'POSTAL_CODE', cpc."POSTAL_CODE",
                'PROVINCE_ABBR', cpc."PROVINCE_ABBR",
                'LATITUDE', cpc."LATITUDE",
                'LONGITUDE', cpc."LONGITUDE"
            )
        )
        FROM public.canadian_postal_codes cpc
        WHERE cpc.geog IS NOT NULL AND ST_DWithin(cpc.geog, center_point, radius_meters, true)
    );
END;
$$;