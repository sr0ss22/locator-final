CREATE OR REPLACE FUNCTION public.assign_territories_for_all_us_installers(
    radius_miles DOUBLE PRECISION
)
RETURNS TEXT AS $$
DECLARE
    installer_record RECORD;
    processed_count INTEGER := 0;
BEGIN
    FOR installer_record IN
        SELECT id FROM public.installers
        WHERE (country ILIKE 'USA' OR country ILIKE 'US') AND latitude IS NOT NULL AND longitude IS NOT NULL
    LOOP
        -- Call the assignment function for each installer
        PERFORM public.assign_zips_in_radius_to_installer(installer_record.id, radius_miles);
        processed_count := processed_count + 1;
    END LOOP;

    RETURN 'Processed ' || processed_count || ' US installers.';
END;
$$ LANGUAGE plpgsql;