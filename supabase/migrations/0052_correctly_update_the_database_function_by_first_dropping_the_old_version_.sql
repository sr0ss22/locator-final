-- First, drop the existing function because we are changing its return type
DROP FUNCTION IF EXISTS public.get_all_canadian_postal_codes_in_circle(double precision, double precision, double precision);

-- Now, create the new, more efficient function that returns a table
CREATE FUNCTION public.get_all_canadian_postal_codes_in_circle(center_lat double precision, center_lng double precision, radius_meters double precision)
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