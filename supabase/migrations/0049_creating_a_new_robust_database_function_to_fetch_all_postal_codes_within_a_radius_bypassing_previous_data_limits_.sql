-- Drop the old function that was hitting the row limit.
DROP FUNCTION IF EXISTS public.get_canadian_postal_codes_in_circle(double precision, double precision, double precision);

-- Drop the function that caused inconsistent clustering by loading data dynamically.
DROP FUNCTION IF EXISTS public.get_canadian_postal_codes_in_bounds(double precision, double precision, double precision, double precision);

-- Create a new, robust function that returns all matching postal codes as a single JSON object, bypassing any row limits.
CREATE OR REPLACE FUNCTION public.get_all_canadian_postal_codes_in_circle(center_lat double precision, center_lng double precision, radius_meters double precision)
RETURNS jsonb AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT jsonb_agg(t)
    INTO result
    FROM (
        SELECT
            id,
            "POSTAL_CODE",
            "PROVINCE_ABBR",
            "LATITUDE",
            "LONGITUDE"
        FROM
            public.canadian_postal_codes
        WHERE
            "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL AND
            ST_DWithin(
                geography(ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)),
                ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
                radius_meters
            )
    ) t;
    RETURN COALESCE(result, '[]'::jsonb); -- Return an empty JSON array if no rows are found
END;
$$ LANGUAGE plpgsql;