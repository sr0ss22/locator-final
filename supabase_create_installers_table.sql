CREATE TABLE public.installers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  "zipCode" TEXT NOT NULL,
  phone TEXT NOT NULL,
  skills TEXT[], -- Array of strings for skills
  certifications TEXT[], -- Array of strings for certifications
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION
);

-- Optional: Add RLS (Row Level Security) policies if you want to control access.
-- For now, you might want to disable RLS or set a policy that allows anonymous reads for testing:
-- For example, to allow all reads:
-- CREATE POLICY "Enable read access for all users" ON public.installers FOR SELECT USING (true);