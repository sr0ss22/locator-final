-- Step 1: Drop the complex function that is causing timeouts.
DROP FUNCTION IF EXISTS public.get_clustered_canadian_map_data(integer, double precision, double precision, double precision, double precision, double precision, double precision, double precision);

-- Step 2: Batch-update the 'geog' column to prevent timeouts. This ensures data integrity.
-- Each statement updates one letter-group of postal codes at a time.
UPDATE public.canadian_postal_codes SET geog = ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography WHERE "POSTAL_CODE" LIKE 'A%' AND geog IS NULL AND "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL;
UPDATE public.canadian_postal_codes SET geog = ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography WHERE "POSTAL_CODE" LIKE 'B%' AND geog IS NULL AND "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL;
UPDATE public.canadian_postal_codes SET geog = ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography WHERE "POSTAL_CODE" LIKE 'C%' AND geog IS NULL AND "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL;
UPDATE public.canadian_postal_codes SET geog = ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography WHERE "POSTAL_CODE" LIKE 'E%' AND geog IS NULL AND "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL;
UPDATE public.canadian_postal_codes SET geog = ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography WHERE "POSTAL_CODE" LIKE 'G%' AND geog IS NULL AND "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL;
UPDATE public.canadian_postal_codes SET geog = ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography WHERE "POSTAL_CODE" LIKE 'H%' AND geog IS NULL AND "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL;
UPDATE public.canadian_postal_codes SET geog = ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography WHERE "POSTAL_CODE" LIKE 'J%' AND geog IS NULL AND "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL;
UPDATE public.canadian_postal_codes SET geog = ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography WHERE "POSTAL_CODE" LIKE 'K%' AND geog IS NULL AND "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL;
UPDATE public.canadian_postal_codes SET geog = ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography WHERE "POSTAL_CODE" LIKE 'L%' AND geog IS NULL AND "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL;
UPDATE public.canadian_postal_codes SET geog = ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography WHERE "POSTAL_CODE" LIKE 'M%' AND geog IS NULL AND "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL;
UPDATE public.canadian_postal_codes SET geog = ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography WHERE "POSTAL_CODE" LIKE 'N%' AND geog IS NULL AND "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL;
UPDATE public.canadian_postal_codes SET geog = ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography WHERE "POSTAL_CODE" LIKE 'P%' AND geog IS NULL AND "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL;
UPDATE public.canadian_postal_codes SET geog = ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography WHERE "POSTAL_CODE" LIKE 'R%' AND geog IS NULL AND "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL;
UPDATE public.canadian_postal_codes SET geog = ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography WHERE "POSTAL_CODE" LIKE 'S%' AND geog IS NULL AND "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL;
UPDATE public.canadian_postal_codes SET geog = ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography WHERE "POSTAL_CODE" LIKE 'T%' AND geog IS NULL AND "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL;
UPDATE public.canadian_postal_codes SET geog = ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography WHERE "POSTAL_CODE" LIKE 'V%' AND geog IS NULL AND "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL;
UPDATE public.canadian_postal_codes SET geog = ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography WHERE "POSTAL_CODE" LIKE 'X%' AND geog IS NULL AND "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL;
UPDATE public.canadian_postal_codes SET geog = ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography WHERE "POSTAL_CODE" LIKE 'Y%' AND geog IS NULL AND "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL;

-- Step 3: Recreate the function to use ONLY the fast, indexed 'geog' column.
-- Now that the data is fixed, this query is both fast and correct.
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
    bbox GEOGRAPHY;
    center_point GEOGRAPHY;
BEGIN
    bbox := ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)::geography;

    IF center_lat IS NOT NULL AND center_lng IS NOT NULL THEN
        center_point := ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography;
    END IF;

    -- Overview map (no radius) - use FSA clusters.
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

    -- Installer-specific map (radius provided)
    IF zoom > 9 THEN
        -- HIGH ZOOM: Use the fast, indexed 'geog' column.
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
            cpc.geog IS NOT NULL AND ST_DWithin(cpc.geog, center_point, radius_meters);
            
    ELSE
        -- LOW/MID ZOOM: Use FSA clusters.
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