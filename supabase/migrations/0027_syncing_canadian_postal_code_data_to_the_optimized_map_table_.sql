-- Create a function to sync Canadian postal codes to their optimized table
CREATE OR REPLACE FUNCTION public.sync_canadian_postal_codes()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    inserted_count integer;
BEGIN
    TRUNCATE public.canadian_postal_codes;
    INSERT INTO public.canadian_postal_codes ("POSTAL_CODE", "LATITUDE", "LONGITUDE", "PROVINCE_ABBR")
    SELECT 
        zip_code,
        centroid_latitude,
        centroid_longitude,
        state_province
    FROM 
        public.zip_code_geometries
    WHERE 
        zip_code ~ '^[A-Z]'
        AND centroid_latitude IS NOT NULL
        AND centroid_longitude IS NOT NULL;
    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    RETURN 'Successfully synced ' || inserted_count || ' Canadian postal codes.';
END;
$$;

-- Run the sync function once to populate the table
SELECT public.sync_canadian_postal_codes();