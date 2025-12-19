-- Ensure the FSA stats table has an indexed geography column for high-performance queries
ALTER TABLE public.canadian_fsa_stats ADD COLUMN IF NOT EXISTS geog geography(Point, 4326);
UPDATE public.canadian_fsa_stats SET geog = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography WHERE geog IS NULL AND longitude IS NOT NULL AND latitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS canadian_fsa_stats_geog_idx ON public.canadian_fsa_stats USING GIST (geog);

-- Drop the old function to replace it with a more robust version
DROP FUNCTION IF EXISTS public.get_clustered_canadian_map_data(integer, double precision, double precision, double precision, double precision, double precision, double precision, double precision);

-- Create the new, context-aware function
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
    safe_min_lat float8 := GREATEST(-90, LEAST(90, min_lat));
    safe_max_lat float8 := GREATEST(-90, LEAST(90, max_lat));
    safe_min_lon float8 := GREATEST(-180, LEAST(180, min_lon)); 
    safe_max_lon float8 := GREATEST(-180, LEAST(180, max_lon));
    bbox GEOGRAPHY;
    center_point GEOGRAPHY;
BEGIN
    bbox := ST_MakeEnvelope(safe_min_lon, safe_min_lat, safe_max_lon, safe_max_lat, 4326)::geography;

    IF center_lat IS NOT NULL AND center_lng IS NOT NULL THEN
        center_point := ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography;
    END IF;

    -- CASE 1: Overview map (like Territory Management) - NO RADIUS PROVIDED
    -- Always use the fast, pre-aggregated FSA stats table for performance.
    IF radius_meters IS NULL THEN
        RETURN QUERY
        SELECT
            gen_random_uuid() as id,
            cfs.latitude as "LATITUDE",
            cfs.longitude as "LONGITUDE",
            true AS is_cluster,
            cfs.point_count,
            cfs.fsa as "POSTAL_CODE"
        FROM
            public.canadian_fsa_stats cfs
        WHERE
            ST_Intersects(cfs.geog, bbox);
        RETURN;
    END IF;

    -- CASE 2: Installer-specific map (Edit Page) - RADIUS IS PROVIDED
    -- Use the zoom-based logic, but strictly filtered by the radius.
    IF zoom > 9 THEN
        -- High zoom: show individual postal codes within the radius
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
            ST_DWithin(cpc.geog, center_point, radius_meters)
            AND ST_Intersects(cpc.geog, bbox);
    ELSE
        -- Low zoom: show FSA clusters within the radius
        RETURN QUERY
        SELECT
            gen_random_uuid() as id,
            cfs.latitude as "LATITUDE",
            cfs.longitude as "LONGITUDE",
            true AS is_cluster,
            cfs.point_count,
            cfs.fsa as "POSTAL_CODE"
        FROM
            public.canadian_fsa_stats cfs
        WHERE
            ST_DWithin(cfs.geog, center_point, radius_meters)
            AND ST_Intersects(cfs.geog, bbox);
    END IF;
END;
$$;