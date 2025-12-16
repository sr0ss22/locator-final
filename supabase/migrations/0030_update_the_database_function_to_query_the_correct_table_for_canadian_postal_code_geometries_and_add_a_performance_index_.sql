-- Add a high-performance spatial index on the centroid coordinates.
-- This allows for rapid distance-based lookups directly on the main data table.
CREATE INDEX IF NOT EXISTS zip_code_geometries_geog_centroid_idx 
ON public.zip_code_geometries 
USING GIST ((ST_SetSRID(ST_MakePoint(centroid_longitude, centroid_latitude), 4326)::geography));

-- Update the function to use this indexed, direct query.
-- This is more reliable than the previous sync-based approach.
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
        -- This ST_DWithin call will now use the new spatial index for high performance
        ST_DWithin(
            ST_SetSRID(ST_MakePoint(centroid_longitude, centroid_latitude), 4326)::geography,
            ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
            radius_meters
        );
$function$;