-- 1. Optimize the FSA summary table by adding a physical geography column and index
-- This prevents the database from having to calculate the point on every single row scan.
ALTER TABLE public.canadian_fsa_stats 
ADD COLUMN IF NOT EXISTS geog geography(Point, 4326);

-- Populate the new column
UPDATE public.canadian_fsa_stats 
SET geog = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography 
WHERE geog IS NULL AND longitude IS NOT NULL AND latitude IS NOT NULL;

-- Create a spatial index on the summary table
CREATE INDEX IF NOT EXISTS canadian_fsa_stats_geog_idx ON public.canadian_fsa_stats USING GIST (geog);

-- 2. Update the function to be crash-proof against invalid map bounds
DROP FUNCTION IF EXISTS public.get_clustered_canadian_map_data(integer, double precision, double precision, double precision, double precision, double precision, double precision, double precision);

CREATE OR REPLACE FUNCTION public.get_clustered_canadian_map_data(
    zoom integer,
    min_lon double precision,
    min_lat double precision,
    max_lon double precision,
    max_lat double precision,
    center_lat double precision DEFAULT NULL,
    center_lng double precision DEFAULT NULL,
    radius_meters double precision DEFAULT NULL
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
    -- Clamp coordinates to valid WGS84 ranges to prevent crashes when zooming out far
    safe_min_lat float8 := GREATEST(-90, LEAST(90, min_lat));
    safe_max_lat float8 := GREATEST(-90, LEAST(90, max_lat));
    -- Normalize longitudes to -180 to 180 range if possible, or just clamp to prevent numeric overflows in geometry
    safe_min_lon float8 := GREATEST(-180, LEAST(180, min_lon)); 
    safe_max_lon float8 := GREATEST(-180, LEAST(180, max_lon));
    
    bbox GEOGRAPHY;
    grid_size double precision := 360 / (2^zoom * 2); 
    center_point GEOGRAPHY;
BEGIN
    -- Construct bbox safely
    -- If the map wraps around the world, we might want to skip the bbox check or handle it differently,
    -- but for now, clamping prevents the 500 error.
    bbox := ST_MakeEnvelope(safe_min_lon, safe_min_lat, safe_max_lon, safe_max_lat, 4326)::geography;

    -- Prepare center point if coordinates are provided
    IF center_lat IS NOT NULL AND center_lng IS NOT NULL THEN
        center_point := ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography;
    END IF;

    -- High Zoom (10+): Return individual points from the detailed table
    IF zoom > 9 THEN
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
            -- Primary Filter: Radius (if provided). This is the most efficient filter.
            (radius_meters IS NULL OR center_point IS NULL OR ST_DWithin(cpc.geog, center_point, radius_meters))
            AND
            -- Secondary Filter: Viewport BBox (only if radius isn't doing the job or to clip view)
            ST_Intersects(cpc.geog, bbox);
            
    -- Low Zoom (0-9): Return clusters from the summary table
    ELSE
        RETURN QUERY
        WITH points_in_view AS (
            SELECT
                cfs.latitude as "LATITUDE",
                cfs.longitude as "LONGITUDE"
            FROM
                public.canadian_fsa_stats cfs
            WHERE
                -- Use the pre-calculated, indexed 'geog' column for speed
                (radius_meters IS NULL OR center_point IS NULL OR ST_DWithin(cfs.geog, center_point, radius_meters))
                AND
                ST_Intersects(cfs.geog, bbox)
        )
        SELECT
            gen_random_uuid() as id,
            avg("LATITUDE") as "LATITUDE",
            avg("LONGITUDE") as "LONGITUDE",
            true AS is_cluster,
            count(*)::bigint AS point_count,
            'cluster' as "POSTAL_CODE"
        FROM
            points_in_view
        GROUP BY
            floor("LONGITUDE" / grid_size),
            floor("LATITUDE" / grid_size);
    END IF;
END;
$$;