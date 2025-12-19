-- Step 1: Clean up all previous, ineffective attempts for a fresh start.
DROP FUNCTION IF EXISTS public.get_canadian_postal_codes_in_circle(double precision, double precision, double precision);
DROP FUNCTION IF EXISTS public.get_canadian_postal_codes_in_bounds(double precision, double precision, double precision, double precision);
DROP INDEX IF EXISTS public.canadian_postal_codes_functional_geog_idx;
DROP INDEX IF EXISTS public.canadian_postal_codes_geog_idx;

-- Step 2: Create a new, highly performant functional index.
-- This version explicitly excludes any rows with null coordinates, making the index more stable and efficient.
CREATE INDEX canadian_postal_codes_functional_geog_idx
ON public.canadian_postal_codes
USING GIST ( geography(ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)) )
WHERE "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL;

-- Step 3: Recreate the radius search function to match the new partial index.
-- Adding the "IS NOT NULL" checks ensures the database uses this optimized index every time.
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
        "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL AND -- This line ensures the partial index is used
        ST_DWithin(
            geography(ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)),
            ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
            radius_meters
        );
$function$;

-- Step 4: Recreate the bounds search function similarly, ensuring it also uses the index and has no arbitrary limit.
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
        "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL AND -- This line ensures the partial index is used
        geography(ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)) && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography;
$function$;