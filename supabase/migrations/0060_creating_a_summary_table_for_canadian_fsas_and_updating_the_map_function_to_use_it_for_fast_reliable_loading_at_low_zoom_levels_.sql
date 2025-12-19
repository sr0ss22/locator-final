-- 1. Create a summary table to store pre-aggregated FSA data (First 3 chars of postal code)
CREATE TABLE IF NOT EXISTS public.canadian_fsa_stats (
    fsa text PRIMARY KEY,
    latitude double precision,
    longitude double precision,
    point_count bigint
);

-- 2. Populate the summary table from the main dataset. 
-- This compresses ~900k rows into ~1.6k rows for instant querying.
INSERT INTO public.canadian_fsa_stats (fsa, latitude, longitude, point_count)
SELECT 
  substring("POSTAL_CODE", 1, 3) as fsa,
  avg("LATITUDE") as latitude,
  avg("LONGITUDE") as longitude,
  count(*) as point_count
FROM public.canadian_postal_codes
WHERE "LATITUDE" IS NOT NULL AND "LONGITUDE" IS NOT NULL
GROUP BY 1
ON CONFLICT (fsa) DO UPDATE 
SET latitude = EXCLUDED.latitude, 
    longitude = EXCLUDED.longitude, 
    point_count = EXCLUDED.point_count;

-- 3. Update the map function to use this new summary table for low zoom levels
CREATE OR REPLACE FUNCTION public.get_clustered_canadian_map_data(
    zoom integer,
    min_lon double precision,
    min_lat double precision,
    max_lon double precision,
    max_lat double precision
)
RETURNS TABLE(
    id uuid,
    "LATITUDE" double precision,
    "LONGITUDE" double precision,
    is_cluster boolean,
    point_count bigint,
    "POSTAL_CODE" text
)
LANGUAGE plpgsql
AS $$
DECLARE
    -- Bounding box for the current map view
    bbox GEOMETRY := ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326);
BEGIN
    -- High Zoom (10+): Show actual individual postal codes (from the big table)
    -- We restrict this to high zoom so we never query too many rows at once.
    IF zoom >= 10 THEN
        RETURN QUERY
        SELECT
            cpc.id,
            cpc."LATITUDE",
            cpc."LONGITUDE",
            false AS is_cluster,
            1::bigint AS point_count,
            cpc."POSTAL_CODE"
        FROM
            public.canadian_postal_codes cpc
        WHERE
            cpc.geog IS NOT NULL AND
            cpc.geog::geometry && bbox; -- Use spatial index
            
    -- Low Zoom (0-9): Show pre-calculated FSA clusters (from the small summary table)
    ELSE
        RETURN QUERY
        SELECT
            gen_random_uuid() as id, -- Generate a random ID for React keys
            cfs.latitude as "LATITUDE",
            cfs.longitude as "LONGITUDE",
            true AS is_cluster,      -- These are rendered as clusters
            cfs.point_count,
            cfs.fsa as "POSTAL_CODE" -- Return the FSA (e.g., M5V) as the code
        FROM
            public.canadian_fsa_stats cfs
        WHERE
            -- Simple bounding box check on the pre-calculated coordinates
            ST_SetSRID(ST_MakePoint(cfs.longitude, cfs.latitude), 4326) && bbox;
    END IF;
END;
$$;