-- Drop the existing spatial index if it exists
DROP INDEX IF EXISTS public.canadian_postal_codes_geog_idx;

-- Recreate a clean spatial index on the now fully-populated geog column
CREATE INDEX canadian_postal_codes_geog_idx ON public.canadian_postal_codes USING gist (geog);

-- Analyze the table to update statistics for the query planner, ensuring the new index is used
ANALYZE public.canadian_postal_codes;