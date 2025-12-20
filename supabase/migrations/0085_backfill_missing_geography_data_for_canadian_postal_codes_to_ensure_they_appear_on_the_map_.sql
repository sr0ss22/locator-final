UPDATE public.canadian_postal_codes
SET geog = ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography
WHERE geog IS NULL;