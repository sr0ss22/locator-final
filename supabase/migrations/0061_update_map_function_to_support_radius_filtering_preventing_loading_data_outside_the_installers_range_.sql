-- Drop the function to update its signature and logic
DROP FUNCTION IF EXISTS public.get_clustered_canadian_map_data(integer, double precision, double precision, double precision, double precision);

-- Updated function with center point and radius filtering
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
    -- Bounding box for the current map view
    bbox GEOGRAPHY := ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)::geography;
    -- Grid size for clustering
    grid_size double precision := 360 / (2^zoom * 2); 
    -- Center point geometry (if provided)
    center_point GEOGRAPHY;
BEGIN
    -- Prepare center point if coordinates are provided
    IF center_lat IS NOT NULL AND center_lng IS NOT NULL THEN
        center_point := ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography;
    END IF;

    -- High Zoom (10+): Individual points
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
            -- Must be within map view bounds
            ST_Intersects(cpc.geog, bbox)
            AND (
                -- AND optionally within radius of center
                radius_meters IS NULL OR center_point IS NULL OR
                ST_DWithin(cpc.geog, center_point, radius_meters)
            );
            
    -- Low Zoom (0-9): Clusters
    ELSE
        RETURN QUERY
        WITH points_in_view AS (
            SELECT
                cfs.latitude as "LATITUDE",
                cfs.longitude as "LONGITUDE"
            FROM
                public.canadian_fsa_stats cfs
            WHERE
                -- Simple bounding box check on the pre-calculated coordinates
                ST_SetSRID(ST_MakePoint(cfs.longitude, cfs.latitude), 4326)::geography && bbox
                AND (
                    -- AND optionally within radius of center
                    radius_meters IS NULL OR center_point IS NULL OR
                    ST_DWithin(
                        ST_SetSRID(ST_MakePoint(cfs.longitude, cfs.latitude), 4326)::geography, 
                        center_point, 
                        radius_meters
                    )
                )
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