-- This dummy update fires an existing trigger for each row where 'geog' is null.
-- The trigger recalculates and saves the correct geographic point, backfilling the data
-- in a way that avoids the previous timeout errors.
UPDATE public.canadian_postal_codes SET "CITY" = "CITY" WHERE geog IS NULL;

-- Revert the function to use the now-correct and indexed 'geog' column for high performance.
DROP FUNCTION IF EXISTS public.get_canadian_postal_codes_in_circle(double precision, double precision, double precision);
CREATE OR REPLACE FUNCTION public.get_canadian_postal_codes_in_circle(center_lat double precision, center_lng double precision, radius_meters double precision)
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
        ST_DWithin(
            geog, -- Use the indexed 'geog' column
            ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
            radius_meters
        );
$function$;

-- Update the bounds query for consistency.
DROP FUNCTION IF EXISTS public.get_canadian_postal_codes_in_bounds(double precision, double precision, double precision, double precision);
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
        geog && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
    LIMIT 5000;
$function$;

-- Clean up the unused functional index from the previous failed attempt.
DROP INDEX IF EXISTS public.canadian_postal_codes_functional_geog_idx;