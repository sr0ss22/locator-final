-- Drop the old function to replace it with a more advanced version.
DROP FUNCTION IF EXISTS public.get_canadian_points_in_radius(double precision, double precision, double precision);

-- This new function intelligently returns either clusters or individual points based on the zoom level.
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
    -- Adjust epsilon based on zoom level for appropriate clustering
    -- A smaller epsilon means points must be closer to be in the same cluster.
    epsilon double precision := CASE
        WHEN zoom < 5 THEN 0.8
        WHEN zoom < 6 THEN 0.4
        WHEN zoom < 7 THEN 0.2
        WHEN zoom < 8 THEN 0.1
        WHEN zoom < 9 THEN 0.05
        ELSE 0.02
    END;
    -- The geographic bounding box for the query
    bbox GEOMETRY := ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326);
BEGIN
    -- If zoomed in far enough, return individual points instead of clusters.
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
            cpc.geog::geometry && bbox;
    ELSE
        -- If zoomed out, return clusters of points.
        RETURN QUERY
        WITH clustered_points AS (
            SELECT
                "LATITUDE",
                "LONGITUDE",
                ST_ClusterDBSCAN(geog::geometry, eps := epsilon, minpoints := 1) OVER() AS cluster_id
            FROM
                public.canadian_postal_codes
            WHERE
                geog::geometry && bbox
        )
        SELECT
            gen_random_uuid() as id,
            avg("LATITUDE") as "LATITUDE",
            avg("LONGITUDE") as "LONGITUDE",
            true AS is_cluster,
            count(*)::bigint AS point_count,
            'cluster' as "POSTAL_CODE"
        FROM
            clustered_points
        GROUP BY
            cluster_id;
    END IF;
END;
$$;