CREATE OR REPLACE FUNCTION public.get_canadian_points_in_radius_count(center_lat double precision, center_lng double precision, radius_meters double precision)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
    center_point GEOGRAPHY;
    total_count integer;
BEGIN
    center_point := ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography;
    
    SELECT count(*)
    INTO total_count
    FROM public.canadian_postal_codes cpc
    WHERE 
        cpc.geog IS NOT NULL 
        -- Use the index with a geometry-casted expand
        AND cpc.geog && ST_Expand(center_point::geometry, radius_meters) 
        -- Then, run the more precise distance check
        AND ST_DWithin(cpc.geog, center_point, radius_meters, false);

    RETURN total_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_all_canadian_points_in_radius(center_lat double precision, center_lng double precision, radius_meters double precision, page_size integer, page_number integer)
 RETURNS TABLE(id uuid, "POSTAL_CODE" text, "PROVINCE_ABBR" text, "LATITUDE" double precision, "LONGITUDE" double precision)
 LANGUAGE plpgsql
AS $function$
DECLARE
    center_point GEOGRAPHY;
    offset_val integer;
BEGIN
    center_point := ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography;
    offset_val := (page_number - 1) * page_size;

    RETURN QUERY
    SELECT
        cpc.id,
        cpc."POSTAL_CODE",
        cpc."PROVINCE_ABBR",
        cpc."LATITUDE",
        cpc."LONGITUDE"
    FROM
        public.canadian_postal_codes cpc
    WHERE
        cpc.geog IS NOT NULL 
        -- Use the index with a geometry-casted expand
        AND cpc.geog && ST_Expand(center_point::geometry, radius_meters)
        -- Then, run the more precise distance check
        AND ST_DWithin(cpc.geog, center_point, radius_meters, false)
    ORDER BY
        cpc.id -- Add a stable order for pagination
    LIMIT page_size
    OFFSET offset_val;
END;
$function$;