CREATE OR REPLACE FUNCTION public.get_all_canadian_postal_codes_in_circle(center_lat double precision, center_lng double precision, radius_meters double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    result jsonb;
BEGIN
    SELECT jsonb_agg(t)
    INTO result
    FROM (
        SELECT
            id,
            "POSTAL_CODE",
            "PROVINCE_ABBR",
            "LATITUDE",
            "LONGITUDE"
        FROM
            public.canadian_postal_codes
        WHERE
            "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL AND
            ST_DWithin(
                (ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography),
                ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
                radius_meters
            )
    ) t;
    RETURN COALESCE(result, '[]'::jsonb);
END;
$function$