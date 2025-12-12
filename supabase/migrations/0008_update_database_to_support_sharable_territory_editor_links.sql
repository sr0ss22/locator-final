-- Add a secure token column to the installers table for unique URL generation
ALTER TABLE public.installers ADD COLUMN IF NOT EXISTS territory_access_token UUID DEFAULT gen_random_uuid();

-- To secure the installers table, the public locator function will now run with elevated privileges,
-- allowing it to bypass row-level security. This is a secure, standard practice.
CREATE OR REPLACE FUNCTION public.find_installers_for_public_locator(search_lat double precision, search_lng double precision, search_zip text, radius_miles double precision)
RETURNS TABLE(id text, name text, address1 text, add2 text, city text, state text, postalcode text, primary_phone text, secondary_phone text, country text, blinds_and_shades bigint, power_view integer, service_call integer, shutters bigint, email text, specialnote text, comments text, installer_vendor_id bigint, pip_certification_level text, shutter_certification_level text, powerview_certification text, sales_org text, draperies bigint, draperies_certification_level text, shipment integer, star_rating text, alta bigint, alta_motorization bigint, latitude double precision, longitude double precision, account_id uuid, hunter_douglas integer, carole integer, architectural integer, levolor integer, three_day_blinds integer, tall_window integer, fixture_displays integer, outdoor integer, high_voltage_hardwired integer, is_local_service_area boolean, distance_miles double precision)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    WITH installers_in_radius AS (
        SELECT
            *,
            (
                3959 * acos(
                    cos(radians(search_lat)) * cos(radians(i.latitude)) *
                    cos(radians(i.longitude) - radians(search_lng)) +
                    sin(radians(search_lat)) * sin(radians(i.latitude))
                )
            ) AS calculated_distance
        FROM
            public.installers i
        WHERE
            i.latitude IS NOT NULL 
            AND i.longitude IS NOT NULL
            AND i.is_active = 1
    )
    SELECT
        i.id, i.name, i.address1, i.add2, i.city, i.state, i.postalcode, i.primary_phone, i.secondary_phone, i.country,
        i.blinds_and_shades, i.power_view, i.service_call, i.shutters, i.email, i.specialnote, i.comments, i.installer_vendor_id,
        i.pip_certification_level, i.shutter_certification_level, i.powerview_certification, i.sales_org, i.draperies,
        i.draperies_certification_level, i.shipment, i.star_rating, i.alta, i.alta_motorization, i.latitude, i.longitude,
        i.account_id, i.hunter_douglas, i.carole, i.architectural, i.levolor, i.three_day_blinds, i.tall_window,
        i.fixture_displays, i.outdoor, i.high_voltage_hardwired,
        EXISTS (
            SELECT 1
            FROM public.installer_zip_codes izc
            WHERE izc.installer_id = i.id
              AND izc.zip_code = search_zip
              AND izc.status = 'Approved'
        ) AS is_local_service_area,
        i.calculated_distance AS distance_miles
    FROM
        installers_in_radius i
    WHERE
        i.calculated_distance <= radius_miles
    ORDER BY
        is_local_service_area DESC,
        i.calculated_distance;
END;
$function$;

-- Remove the broad public read access from the installers table
DROP POLICY IF EXISTS "Allow public read access for locator" ON public.installers;

-- Enable Row Level Security on the installer_zip_codes table
ALTER TABLE public.installer_zip_codes ENABLE ROW LEVEL SECURITY;

-- Clean up old policies to ensure only the correct one is active
DROP POLICY IF EXISTS "Allow admins to manage installer zip codes." ON public.installer_zip_codes;
DROP POLICY IF EXISTS "Admins have full access to installer zip codes" ON public.installer_zip_codes;

-- Add a new, secure policy that only allows administrators to manage zip code assignments directly
CREATE POLICY "Admins have full access to installer zip codes"
ON public.installer_zip_codes
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::app_role
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::app_role
  )
);