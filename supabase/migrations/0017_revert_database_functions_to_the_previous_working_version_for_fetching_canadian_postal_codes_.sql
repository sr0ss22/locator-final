-- Remove the function that was incorrectly querying the wrong table
DROP FUNCTION IF EXISTS public.get_canadian_zip_geometries_in_radius(double precision, double precision, double precision);

-- Remove the other function from the broken implementation
DROP FUNCTION IF EXISTS public.get_canadian_postal_code_details(text[]);

-- Re-create the original, correct function that queries the 'canadian_postal_codes' table
CREATE OR REPLACE FUNCTION public.get_canadian_postal_codes_in_radius(center_lat double precision, center_lng double precision, radius_meters double precision)
RETURNS TABLE("POSTAL_CODE" text, "LATITUDE" double precision, "LONGITUDE" double precision, "PROVINCE_ABBR" text)
LANGUAGE sql
AS $$
    SELECT
        "POSTAL_CODE",
        "LATITUDE",
        "LONGITUDE",
        "PROVINCE_ABBR"
    FROM
        public.canadian_postal_codes
    WHERE
        ST_DWithin(
            geog,
            ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
            radius_meters
        );
$$;