CREATE OR REPLACE FUNCTION get_canadian_postal_codes_in_bounds(
    min_lng double precision,
    min_lat double precision,
    max_lng double precision,
    max_lat double precision
)
RETURNS TABLE("POSTAL_CODE" text, "LATITUDE" double precision, "LONGITUDE" double precision, "PROVINCE_ABBR" text)
LANGUAGE sql
AS $$
    SELECT
        "POSTAL_CODE",
        "LATITUDE",
        "LONGITUDE",
        "PROVINCE_ABBR"
    FROM
        public.canadian_postal_codes
    WHERE
        geog && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
    LIMIT 5000;
$$;

CREATE OR REPLACE FUNCTION get_canadian_postal_codes_in_circle(
    center_lat double precision,
    center_lng double precision,
    radius_meters double precision
)
RETURNS TABLE("POSTAL_CODE" text, "PROVINCE_ABBR" text)
LANGUAGE sql
AS $$
    SELECT
        "POSTAL_CODE",
        "PROVINCE_ABBR"
    FROM
        public.canadian_postal_codes
    WHERE
        ST_DWithin(
            geog,
            ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
            radius_meters
        );
$$;