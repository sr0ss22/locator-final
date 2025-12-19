-- Drop the old, slow function
DROP FUNCTION IF EXISTS public.get_all_canadian_postal_codes_in_circle(double precision, double precision, double precision);

-- Create a new performant function for initial map point loading
CREATE OR REPLACE FUNCTION public.get_canadian_points_in_radius(center_lat double precision, center_lng double precision, radius_meters double precision)
 RETURNS TABLE(id uuid, "POSTAL_CODE" text, "PROVINCE_ABBR" text, "LATITUDE" double precision, "LONGITUDE" double precision)
 LANGUAGE sql
AS $function$
    SELECT
        id,
        "POSTAL_CODE",
        "PROVINCE_ABBR",
        "LATITUDE",
        "LONGITUDE"
    FROM
        public.canadian_postal_codes
    WHERE
        geog IS NOT NULL AND
        ST_DWithin(
            geog,
            ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
            radius_meters
        );
$function$;

-- Create a new lightweight function for bulk selection
CREATE OR REPLACE FUNCTION public.get_canadian_fsa_in_radius(center_lat double precision, center_lng double precision, radius_meters double precision)
 RETURNS TABLE("POSTAL_CODE" text, "PROVINCE_ABBR" text)
 LANGUAGE sql
AS $function$
    SELECT
        "POSTAL_CODE",
        "PROVINCE_ABBR"
    FROM
        public.canadian_postal_codes
    WHERE
        geog IS NOT NULL AND
        ST_DWithin(
            geog,
            ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
            radius_meters
        );
$function$;