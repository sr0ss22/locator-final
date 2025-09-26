CREATE OR REPLACE FUNCTION public.assign_zips_in_radius_to_installer(
    installer_id_to_update TEXT,
    radius_miles DOUBLE PRECISION
)
RETURNS void AS $$
DECLARE
    installer_location GEOGRAPHY;
    radius_meters DOUBLE PRECISION;
BEGIN
    -- Get installer's location and convert to a geography point
    SELECT ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::GEOGRAPHY
    INTO installer_location
    FROM public.installers
    WHERE id = installer_id_to_update;

    -- If installer has no location, exit
    IF installer_location IS NULL THEN
        RAISE NOTICE 'Installer % has no location, skipping.', installer_id_to_update;
        RETURN;
    END IF;

    -- Convert radius from miles to meters
    radius_meters := radius_miles * 1609.34;

    -- Insert all US zip codes within the radius for the given installer
    INSERT INTO public.installer_zip_codes (installer_id, zip_code, state_province, status)
    SELECT
        installer_id_to_update,
        z.zip_code,
        z.state_province,
        'Approved'::text -- Default status to 'Approved'
    FROM
        public.zip_code_geometries z
    WHERE
        -- Filter for US ZIP codes (assuming they are 5-digit numeric)
        z.zip_code ~ '^[0-9]{5}$' AND
        ST_DWithin(
            z.geometry::GEOGRAPHY,
            installer_location,
            radius_meters
        )
    ON CONFLICT (installer_id, zip_code) DO NOTHING;
END;
$$ LANGUAGE plpgsql;