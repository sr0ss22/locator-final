CREATE OR REPLACE FUNCTION public.get_canadian_postal_code_details(postal_codes TEXT[])
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
        "POSTAL_CODE" = ANY(postal_codes);
$$;