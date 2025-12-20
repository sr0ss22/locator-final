-- Drop the old function to change its return type and structure
DROP FUNCTION IF EXISTS public.get_all_canadian_points_in_radius(double precision, double precision, double precision);

-- Recreate the function to be more performant and bypass row limits
CREATE OR REPLACE FUNCTION public.get_all_canadian_points_in_radius(
    center_lat double precision,
    center_lng double precision,
    radius_meters double precision
)
RETURNS json -- Return a single JSON object to bypass row limits
LANGUAGE plpgsql
AS $$
DECLARE
    center_point GEOGRAPHY;
    result_json json;
BEGIN
    center_point := ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography;
    
    -- Aggregate all results into a single JSON array on the server
    SELECT json_agg(t)
    INTO result_json
    FROM (
        SELECT
            cpc.id, -- Include the ID to fix the React key warning
            cpc."POSTAL_CODE",
            cpc."PROVINCE_ABBR",
            cpc."LATITUDE",
            cpc."LONGITUDE"
        FROM
            public.canadian_postal_codes cpc
        WHERE
            -- Use the fast, indexed spatial query
            ST_DWithin(cpc.geog, center_point, radius_meters, false)
    ) t;

    -- Return the JSON array, or an empty array if no results
    RETURN COALESCE(result_json, '[]'::json);
END;
$$;