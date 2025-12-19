-- Drop the old, inefficient function to ensure it's no longer used.
DROP FUNCTION IF EXISTS public.get_canadian_postal_codes_in_bounds(double precision, double precision, double precision, double precision);

-- Create a new, highly optimized function that uses the spatial index to query for postal codes within a given rectangular boundary (the map view).
CREATE OR REPLACE FUNCTION public.get_canadian_postal_codes_in_bounds(min_lng double precision, min_lat double precision, max_lng double precision, max_lat double precision)
 RETURNS TABLE(id uuid, "POSTAL_CODE" text, "LATITUDE" double precision, "LONGITUDE" double precision, "PROVINCE_ABBR" text)
 LANGUAGE sql
AS $function$
    SELECT
        id,
        "POSTAL_CODE",
        "LATITUDE",
        "LONGITUDE",
        "PROVINCE_ABBR"
    FROM
        public.canadian_postal_codes
    WHERE
        -- This clause is critical for performance as it ensures the spatial index is used.
        "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL AND
        geography(ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)) && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography;
$function$;