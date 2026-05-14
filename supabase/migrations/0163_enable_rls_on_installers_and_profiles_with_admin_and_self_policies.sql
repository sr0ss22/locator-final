-- =============================================================================
-- Lock down direct REST API access to installers and profiles.
--
-- The Supabase anon key is shipped in the browser bundle, which means the
-- public-locator REST endpoints are reachable by anyone with curl. Without
-- RLS on installers and profiles, a curl-driven attacker could DELETE every
-- installer row or edit roles. This migration enables RLS and adds the
-- minimum policies needed to keep all existing app flows working:
--
--   * Public locator search keeps working (uses find_installers_for_public_locator,
--     which is SECURITY DEFINER and bypasses RLS).
--   * Admin pages keep working (admin role => full access to both tables).
--   * Authenticated installers can still read/edit their own row.
--   * Edge functions using SUPABASE_SERVICE_ROLE_KEY keep working (service
--     role bypasses RLS by design).
--
-- Rollback (if anything breaks unexpectedly):
--   ALTER TABLE public.installers DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.profiles   DISABLE ROW LEVEL SECURITY;
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: is_admin()
--
-- SECURITY DEFINER so it can read profiles regardless of the caller's RLS
-- context. STABLE so PostgreSQL caches its result within a single query.
-- This is the canonical Supabase pattern to avoid recursive RLS evaluation
-- when an admin check is needed inside a policy on the profiles table itself.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'::app_role
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;


-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own profile"  ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all profiles"      ON public.profiles;

CREATE POLICY "Users can read their own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Admins can read all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Intentionally NO INSERT/UPDATE/DELETE policies for profiles.
-- New profiles are created by the auth.users -> profiles trigger (server-side).
-- Roles are assigned by admins via the dashboard or SQL, never by clients.


-- -----------------------------------------------------------------------------
-- installers
--
-- Public locator search uses public.find_installers_for_public_locator() which
-- is SECURITY DEFINER and therefore bypasses RLS, so no public SELECT policy
-- is required here.
-- -----------------------------------------------------------------------------
ALTER TABLE public.installers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins have full access to installers" ON public.installers;
DROP POLICY IF EXISTS "Installers can read their own row"     ON public.installers;
DROP POLICY IF EXISTS "Installers can update their own row"   ON public.installers;

CREATE POLICY "Admins have full access to installers"
  ON public.installers
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Installers can read their own row"
  ON public.installers
  FOR SELECT
  TO authenticated
  USING (account_id = auth.uid());

CREATE POLICY "Installers can update their own row"
  ON public.installers
  FOR UPDATE
  TO authenticated
  USING (account_id = auth.uid())
  WITH CHECK (account_id = auth.uid());
