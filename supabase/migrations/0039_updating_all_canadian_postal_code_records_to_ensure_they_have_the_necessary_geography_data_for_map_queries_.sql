UPDATE public.canadian_postal_codes
SET geog = ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography
WHERE geog IS NULL AND "LONGITUDE" IS NOT NULL AND "LATITUDE" IS NOT NULL;