CREATE OR REPLACE FUNCTION public.get_canadian_postal_codes_in_radius(center_lat double precision, center_lng double precision, radius_meters double precision)
RETURNS TABLE("POSTAL_CODE" text, "LATITUDE" double precision, "LONGITUDE" double precision, "PROVINCE_ABBR" text)
LANGUAGE sql
AS $function$
    SELECT
        "POSTAL_CODE",
        "LATITUDE",
        "LONGITUDE",
        "PROVINCE_ABBR"
    FROM
        public.canadian_postal_codes
    WHERE
        geog IS NOT NULL AND
        ST_DWithin(
            geog,
            ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
            radius_meters,
            false -- Use faster sphere calculation to prevent timeouts
        );
$function$;