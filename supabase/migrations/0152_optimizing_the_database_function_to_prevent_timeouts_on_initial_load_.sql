CREATE OR REPLACE FUNCTION public.get_canadian_points_in_radius_count(center_lat double precision, center_lng double precision, radius_meters double precision)
 RETURNS integer
 LANGUAGE sql
AS $function$
    SELECT count(*)::integer
    FROM public.canadian_postal_codes
    WHERE ST_DWithin(
        geog,
        ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
        radius_meters,
        false
    );
$function$;