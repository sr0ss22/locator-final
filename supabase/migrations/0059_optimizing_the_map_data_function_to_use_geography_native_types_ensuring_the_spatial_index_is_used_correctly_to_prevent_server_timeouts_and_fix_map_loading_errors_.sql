-- Drop the old function to replace it with a more advanced version.
DROP FUNCTION IF EXISTS public.get_clustered_canadian_map_data(integer, double precision, double precision, double precision, double precision);

-- This new function intelligently returns either clusters or individual points based on the zoom level using a fast, direct grid-based approach.
-- It has been further optimized to ensure the spatial index is used by working with geography types.
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
    -- Bounding box for the current map view, now cast to GEOGRAPHY to ensure index usage
    bbox GEOGRAPHY := ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)::geography;
    -- Grid size in degrees for clustering. It gets smaller as zoom level increases.
    grid_size double precision := 360 / (2^zoom * 2); 
BEGIN
    -- If zoomed in far enough (e.g., zoom level 10+), return individual points.
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
            -- Use ST_Intersects with two geography types to ensure the GIST index is used
            ST_Intersects(cpc.geog, bbox);
    ELSE
        -- If zoomed out, return clusters based on a direct mathematical grid.
        RETURN QUERY
        WITH points_in_view AS (
            SELECT
                "LATITUDE",
                "LONGITUDE"
            FROM
                public.canadian_postal_codes
            WHERE
                -- Use ST_Intersects with two geography types to ensure the GIST index is used
                ST_Intersects(geog, bbox)
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