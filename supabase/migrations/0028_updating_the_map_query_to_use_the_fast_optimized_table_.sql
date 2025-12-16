-- Update the map's query function to use the fast, populated table
CREATE OR REPLACE FUNCTION public.get_canadian_postal_codes_from_dedicated_table(center_lat double precision, center_lng double precision, radius_meters double precision)
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
        ST_DWithin(
            geog, -- Use the pre-calculated and indexed geography column
            ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
            radius_meters
        );
$function$;