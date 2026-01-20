CREATE OR REPLACE FUNCTION public.set_territory_state_on_insert_or_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    _state_province TEXT;
BEGIN
    -- If state/province is already provided and valid, do nothing.
    -- A "valid" state is not NULL, not an empty string, and not 'Unknown'.
    IF NEW.state_province IS NOT NULL AND NEW.state_province <> '' AND NEW.state_province <> 'Unknown' THEN
        RETURN NEW;
    END IF;

    -- For Canadian codes (which start with a letter), check the detailed postal code table first.
    IF NEW.zip_code ~ '^[A-Z]' THEN
        SELECT "PROVINCE_ABBR" INTO _state_province
        FROM public.canadian_postal_codes
        WHERE "POSTAL_CODE" = NEW.zip_code
        LIMIT 1;
        
        IF _state_province IS NOT NULL THEN
            NEW.state_province := _state_province;
            RETURN NEW;
        END IF;
    END IF;

    -- For all other codes (US zips and Canadian FSAs like 'M5V'), check the geometries table.
    SELECT state_province INTO _state_province
    FROM public.zip_code_geometries
    WHERE zip_code = NEW.zip_code
    LIMIT 1;

    IF _state_province IS NOT NULL THEN
        NEW.state_province := _state_province;
    END IF;

    RETURN NEW;
END;
$function$