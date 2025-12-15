-- Drop the existing table and all dependent objects to ensure a clean slate
DROP TABLE IF EXISTS public.canadian_postal_codes CASCADE;

-- The CASCADE should have dropped these, but we'll be explicit.
DROP FUNCTION IF EXISTS public.get_canadian_postal_codes_in_radius(double precision, double precision, double precision);
DROP FUNCTION IF EXISTS public.update_canadian_postal_codes_geog();

-- Re-create the table with a new UUID primary key, allowing duplicate postal codes.
CREATE TABLE public.canadian_postal_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "POSTAL_CODE" TEXT,
    "LATITUDE" DOUBLE PRECISION NOT NULL,
    "LONGITUDE" DOUBLE PRECISION NOT NULL,
    "PROVINCE_ABBR" TEXT,
    geog GEOGRAPHY(Point, 4326)
);

-- Enable Row Level Security
ALTER TABLE public.canadian_postal_codes ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow public read access
CREATE POLICY "Allow public read access" ON public.canadian_postal_codes FOR SELECT USING (true);

-- Re-create the function to automatically generate the geography point
CREATE OR REPLACE FUNCTION update_canadian_postal_codes_geog()
RETURNS TRIGGER AS $$
BEGIN
    NEW.geog = ST_SetSRID(ST_MakePoint(NEW."LONGITUDE", NEW."LATITUDE"), 4326)::geography;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-create the trigger to run the function on insert or update
CREATE TRIGGER trigger_update_canadian_postal_codes_geog
BEFORE INSERT OR UPDATE ON public.canadian_postal_codes
FOR EACH ROW EXECUTE FUNCTION update_canadian_postal_codes_geog();

-- Create a spatial index for fast location-based queries
CREATE INDEX canadian_postal_codes_geog_idx ON public.canadian_postal_codes USING GIST (geog);

-- Create a regular index on the postal code column for faster lookups
CREATE INDEX idx_canadian_postal_codes_postal_code ON public.canadian_postal_codes ("POSTAL_CODE");

-- Re-create the function to get postal codes within a radius
CREATE OR REPLACE FUNCTION get_canadian_postal_codes_in_radius(
    center_lat double precision,
    center_lng double precision,
    radius_meters double precision
)
RETURNS TABLE (
    "POSTAL_CODE" TEXT,
    "LATITUDE" DOUBLE PRECISION,
    "LONGITUDE" DOUBLE PRECISION,
    "PROVINCE_ABBR" TEXT
)
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
        ST_DWithin(
            geog,
            ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
            radius_meters
        );
$$;