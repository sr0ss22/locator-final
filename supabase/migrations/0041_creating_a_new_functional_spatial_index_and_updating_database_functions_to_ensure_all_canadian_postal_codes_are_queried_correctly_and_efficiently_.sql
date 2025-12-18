-- Drop any previous faulty index attempts, just in case.
DROP INDEX IF EXISTS public.canadian_postal_codes_lon_lat_geog_idx;
DROP INDEX IF EXISTS public.canadian_postal_codes_functional_geog_idx;

-- Create a new, reliable functional spatial index directly on the LATITUDE and LONGITUDE columns.
-- This avoids the need for a separate 'geog' column and the massive UPDATE that timed out.
CREATE INDEX canadian_postal_codes_functional_geog_idx
ON public.canadian_postal_codes
USING GIST ( geography(ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)) );

-- Update the function to use the new index for fast and accurate radius searches.
-- The expression in ST_DWithin now matches the index expression exactly.
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
            geography(ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)),
            geography(ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)),
            radius_meters
        );
$function$;

-- Update the bounds query for consistency, using the same indexed expression.
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
        geography(ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)) && geography(ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326))
    LIMIT 5000;
$function$;