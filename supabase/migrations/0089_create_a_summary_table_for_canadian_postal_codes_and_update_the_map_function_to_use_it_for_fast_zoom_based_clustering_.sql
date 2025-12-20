-- Step 1: Create a summary table for Canadian Forward Sortation Areas (FSAs)
DROP TABLE IF EXISTS public.canadian_fsa_stats;
CREATE TABLE public.canadian_fsa_stats (
    fsa TEXT PRIMARY KEY,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    point_count BIGINT,
    geog geography(Point, 4326)
);

-- Enable RLS for consistency, though it will be public read
ALTER TABLE public.canadian_fsa_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON public.canadian_fsa_stats FOR SELECT USING (true);


-- Step 2: Populate the summary table by grouping the main postal code table
INSERT INTO public.canadian_fsa_stats (fsa, latitude, longitude, point_count, geog)
SELECT
    SUBSTRING("POSTAL_CODE" FROM 1 FOR 3) as fsa,
    AVG("LATITUDE") as latitude,
    AVG("LONGITUDE") as longitude,
    COUNT(*) as point_count,
    ST_SetSRID(ST_MakePoint(AVG("LONGITUDE"), AVG("LATITUDE")), 4326)::geography
FROM
    public.canadian_postal_codes
WHERE
    "POSTAL_CODE" ~ '^[A-Z][0-9][A-Z]' -- Ensure it's a valid Canadian FSA format
GROUP BY
    fsa;

-- Step 3: Add a spatial index for performance
CREATE INDEX IF NOT EXISTS idx_canadian_fsa_stats_geog ON public.canadian_fsa_stats USING GIST (geog);

-- Step 4: Update the main map data function to use the new summary table
DROP FUNCTION IF EXISTS public.get_clustered_canadian_map_data(integer,double precision,double precision,double precision,double precision,double precision,double precision,double precision,integer,integer);
CREATE OR REPLACE FUNCTION public.get_clustered_canadian_map_data(
    zoom integer,
    min_lon double precision,
    min_lat double precision,
    max_lon double precision,
    max_lat double precision,
    center_lat double precision DEFAULT NULL,
    center_lng double precision DEFAULT NULL,
    radius_meters double precision DEFAULT NULL,
    page_size integer DEFAULT 1000,
    page_number integer DEFAULT 1
)
RETURNS TABLE(id uuid, "LATITUDE" double precision, "LONGITUDE" double precision, is_cluster boolean, point_count bigint, "POSTAL_CODE" text, "PROVINCE_ABBR" text)
LANGUAGE plpgsql
AS $$
DECLARE
    bbox GEOGRAPHY;
    center_point GEOGRAPHY;
    query_offset integer;
BEGIN
    -- If a radius is provided (for public locator or specific radius searches), fetch paginated individual points.
    IF radius_meters IS NOT NULL AND center_lat IS NOT NULL AND center_lng IS NOT NULL THEN
        center_point := ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography;
        query_offset := (page_number - 1) * page_size;
        
        RETURN QUERY
        SELECT
            cpc.id,
            cpc."LATITUDE",
            cpc."LONGITUDE",
            false AS is_cluster,
            1::bigint AS point_count,
            cpc."POSTAL_CODE",
            cpc."PROVINCE_ABBR"
        FROM
            public.canadian_postal_codes cpc
        WHERE
            ST_DWithin(cpc.geog, center_point, radius_meters, false)
        ORDER BY cpc.id
        LIMIT page_size
        OFFSET query_offset;
        RETURN;
    END IF;

    -- If NO radius is provided, use zoom-level clustering for the territory editor map.
    bbox := ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)::geography;

    -- High Zoom (e.g., 10+): Show individual postal codes within the map bounds.
    IF zoom >= 10 THEN
        RETURN QUERY
        SELECT
            cpc.id,
            cpc."LATITUDE",
            cpc."LONGITUDE",
            false AS is_cluster,
            1::bigint AS point_count,
            cpc."POSTAL_CODE",
            cpc."PROVINCE_ABBR"
        FROM
            public.canadian_postal_codes cpc
        WHERE
            cpc.geog && bbox; -- Use the spatial index for a fast bounding box check

    -- Low Zoom (e.g., < 10): Show pre-calculated FSA clusters.
    ELSE
        RETURN QUERY
        SELECT
            gen_random_uuid() as id,
            cfs.latitude as "LATITUDE",
            cfs.longitude as "LONGITUDE",
            true AS is_cluster,
            cfs.point_count,
            cfs.fsa as "POSTAL_CODE",
            NULL::text as "PROVINCE_ABBR"
        FROM
            public.canadian_fsa_stats cfs
        WHERE
            cfs.geog && bbox; -- Use the spatial index on the summary table
    END IF;
END;
$$;