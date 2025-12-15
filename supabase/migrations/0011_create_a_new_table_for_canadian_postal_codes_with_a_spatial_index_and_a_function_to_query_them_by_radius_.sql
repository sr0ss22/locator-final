-- Create the table to hold Canadian postal code data
CREATE TABLE public.canadian_postal_codes (
    postal_code TEXT PRIMARY KEY,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    province TEXT,
    geog GEOGRAPHY(Point, 4326)
);

-- Enable Row Level Security
ALTER TABLE public.canadian_postal_codes ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow public read access, as this is non-sensitive data
CREATE POLICY "Allow public read access" ON public.canadian_postal_codes FOR SELECT USING (true);

-- Create a function to automatically generate the geography point from latitude and longitude
CREATE OR REPLACE FUNCTION update_canadian_postal_codes_geog()
RETURNS TRIGGER AS $$
BEGIN
    NEW.geog = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to run the function whenever a row is inserted or updated
CREATE TRIGGER trigger_update_canadian_postal_codes_geog
BEFORE INSERT OR UPDATE ON public.canadian_postal_codes
FOR EACH ROW EXECUTE FUNCTION update_canadian_postal_codes_geog();

-- Create a spatial index for extremely fast location-based queries
CREATE INDEX canadian_postal_codes_geog_idx ON public.canadian_postal_codes USING GIST (geog);

-- Create a function to get postal codes within a given radius from a central point
CREATE OR REPLACE FUNCTION get_canadian_postal_codes_in_radius(
    center_lat double precision,
    center_lng double precision,
    radius_meters double precision
)
RETURNS TABLE (
    postal_code TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    province TEXT
)
LANGUAGE sql
AS $$
    SELECT
        postal_code,
        latitude,
        longitude,
        province
    FROM
        public.canadian_postal_codes
    WHERE
        ST_DWithin(
            geog,
            ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
            radius_meters
        );
$$;