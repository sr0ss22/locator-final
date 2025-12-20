-- Recreate the function to ensure it's correct and robust
DROP FUNCTION IF EXISTS public.get_canadian_points_in_radius_count(double precision, double precision, double precision);
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
    WHERE cpc.geog IS NOT NULL AND ST_DWithin(cpc.geog, center_point, radius_meters, true); -- Use accurate spheroid calculation

    RETURN point_count;
END;
$$;