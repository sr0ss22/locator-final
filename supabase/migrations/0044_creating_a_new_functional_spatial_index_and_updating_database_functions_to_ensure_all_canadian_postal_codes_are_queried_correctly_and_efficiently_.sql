-- Step 1: Clean up previous attempts to ensure a fresh start.
DROP FUNCTION IF EXISTS public.get_canadian_postal_codes_in_circle(double precision, double precision, double precision);
DROP FUNCTION IF EXISTS public.get_canadian_postal_codes_in_bounds(double precision, double precision, double precision, double precision);
DROP INDEX IF EXISTS public.canadian_postal_codes_functional_geog_idx;
DROP INDEX IF EXISTS public.canadian_postal_codes_geog_idx;

-- Step 2: Create the new, highly performant functional index.
-- This is a one-time operation that pre-computes the geographic locations for fast lookups.
-- It avoids the slow table-wide UPDATE that was causing timeouts.
CREATE INDEX canadian_postal_codes_functional_geog_idx
ON public.canadian_postal_codes
USING GIST ( geography(ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)) );

-- Step 3: Recreate the radius search function.
-- The WHERE clause is written to EXACTLY match the functional index,
-- ensuring the database uses the fast index instead of scanning the table.
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
            geography(ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)), -- This expression matches the index
            ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
            radius_meters
        );
$function$;

-- Step 4: Recreate the bounds search function, also matching the index and removing the arbitrary LIMIT.
-- Removing the LIMIT ensures all data (like all postal codes for Three Hills) is returned.
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
        geography(ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)) && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography;
$function$;