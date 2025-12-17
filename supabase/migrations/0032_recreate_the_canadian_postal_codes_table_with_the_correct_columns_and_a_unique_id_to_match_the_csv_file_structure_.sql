-- Drop the existing table and its related objects to ensure a clean slate
DROP TABLE IF EXISTS public.canadian_postal_codes CASCADE;

-- Re-create the table with all columns from the CSV and a unique ID as the primary key
CREATE TABLE public.canadian_postal_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "POSTAL_CODE" TEXT,
    "CITY" TEXT,
    "PROVINCE_ABBR" TEXT,
    "TIME_ZONE" TEXT,
    "LATITUDE" DOUBLE PRECISION NOT NULL,
    "LONGITUDE" DOUBLE PRECISION NOT NULL,
    geog geography(Point, 4326)
);

-- Enable Row Level Security
ALTER TABLE public.canadian_postal_codes ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow public read access for the map
CREATE POLICY "Allow public read access" ON public.canadian_postal_codes FOR SELECT USING (true);

-- Re-create the function to auto-generate the spatial 'geography' point
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

-- Re-create the GIST spatial index for fast map queries
CREATE INDEX canadian_postal_codes_geog_idx ON public.canadian_postal_codes USING GIST (geog);