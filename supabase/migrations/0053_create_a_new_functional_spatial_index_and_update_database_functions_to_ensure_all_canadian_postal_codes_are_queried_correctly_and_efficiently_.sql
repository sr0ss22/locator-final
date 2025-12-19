-- Create a spatial index for faster geographic queries. This is the key to fixing the timeout.
CREATE INDEX IF NOT EXISTS canadian_postal_codes_geog_idx ON public.canadian_postal_codes USING GIST (geog);

-- Drop the old function to ensure a clean update
DROP FUNCTION IF EXISTS public.get_all_canadian_postal_codes_in_circle(double precision, double precision, double precision);

-- Re-create the function, which will now use the new index for high performance
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