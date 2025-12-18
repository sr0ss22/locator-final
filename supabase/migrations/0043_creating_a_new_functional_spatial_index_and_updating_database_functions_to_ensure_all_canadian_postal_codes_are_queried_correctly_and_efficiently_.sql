-- Drop old functions and any potentially conflicting indexes for a clean slate.
DROP FUNCTION IF EXISTS public.get_canadian_postal_codes_in_circle(double precision, double precision, double precision);
DROP FUNCTION IF EXISTS public.get_canadian_postal_codes_in_bounds(double precision, double precision, double precision, double precision);
DROP INDEX IF EXISTS public.canadian_postal_codes_functional_geog_idx;
DROP INDEX IF EXISTS public.canadian_postal_codes_geog_idx;

-- Create a new, performant functional index directly on the LATITUDE and LONGITUDE columns.
CREATE INDEX canadian_postal_codes_functional_geog_idx
ON public.canadian_postal_codes
USING GIST ( geography(ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)) );

-- Recreate the function to fetch postal codes within a radius.
-- The WHERE clause now EXACTLY matches the functional index, guaranteeing a fast query.
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
            geography(ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)),
            geography(ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)),
            radius_meters
        );
$function$;

-- Recreate the bounds query to use the same performant expression.
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
        geography(ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)) && geography(ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326))
    LIMIT 5000;
$function$;