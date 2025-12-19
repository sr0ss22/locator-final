-- Drop the old function to replace it with the new multi-level version
DROP FUNCTION IF EXISTS public.get_clustered_canadian_map_data(integer, double precision, double precision, double precision, double precision, double precision, double precision, double precision);

-- Create the new function with 3-step zoom logic for the installer-specific (radius) view
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

    -- CASE 1: Overview map (Territory Management) - NO RADIUS. Always use fast FSA clusters.
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

    -- CASE 2: Installer-specific map (Edit Page) - RADIUS IS PROVIDED. Use new 3-step logic.
    IF zoom > 10 THEN
        -- HIGH ZOOM: Show individual postal codes within the radius
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
            
    ELSIF zoom > 7 THEN
        -- MID ZOOM: Show FSA-level clusters within the radius
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
    ELSE
        -- LOW ZOOM: Show large, aggregated clusters of FSAs within the radius
        RETURN QUERY
        WITH points_in_view AS (
            SELECT
                cfs.latitude as "LATITUDE",
                cfs.longitude as "LONGITUDE"
            FROM
                public.canadian_fsa_stats cfs
            WHERE
                ST_DWithin(cfs.geog, center_point, radius_meters)
                AND ST_Intersects(cfs.geog, bbox)
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
            -- Use a larger grid size for coarser, higher-level clustering
            floor("LONGITUDE" / 2.0),
            floor("LATITUDE" / 2.0);
    END IF;
END;
$$;