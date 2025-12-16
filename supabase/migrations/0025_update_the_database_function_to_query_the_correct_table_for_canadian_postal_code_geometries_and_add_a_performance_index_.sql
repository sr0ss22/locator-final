-- Add a spatial index to the correct table for performance
CREATE INDEX IF NOT EXISTS zip_code_geometries_geom_idx ON public.zip_code_geometries USING GIST (geometry);

-- Update the function to query the correct table with all the data
CREATE OR REPLACE FUNCTION public.get_canadian_postal_codes_from_dedicated_table(center_lat double precision, center_lng double precision, radius_meters double precision)
 RETURNS TABLE("POSTAL_CODE" text, "LATITUDE" double precision, "LONGITUDE" double precision, "PROVINCE_ABBR" text)
 LANGUAGE sql
AS $function$
    SELECT
        zip_code AS "POSTAL_CODE",
        centroid_latitude AS "LATITUDE",
        centroid_longitude AS "LONGITUDE",
        state_province AS "PROVINCE_ABBR"
    FROM
        public.zip_code_geometries
    WHERE
        -- Filter for Canadian postal codes (non-numeric start, e.g., 'L5J')
        zip_code ~ '^[A-Z]' AND
        -- Use ST_DWithin with geography for accurate radius search
        ST_DWithin(
            geometry::geography,
            ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
            radius_meters
        )
    LIMIT 20000; -- Explicitly set a high limit
$function$;