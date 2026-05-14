-- =============================================================================
-- Performance fix: replace inline `SELECT role FROM profiles WHERE id = auth.uid()`
-- subqueries inside RLS policies with the SECURITY DEFINER `is_admin()` helper.
--
-- Why:
--   When migration 0163 enabled RLS on `profiles`, any policy that did an
--   inline subquery against `profiles` (e.g. on `canadian_postal_codes` and
--   `installer_zip_codes`) lost the planner's ability to hoist that subquery
--   out as a one-shot InitPlan — the per-row RLS check on `profiles` forced
--   re-evaluation. On large spatial queries (e.g. a 75km Canadian postal-code
--   count for an installer with tens of thousands of assigned zips), this
--   pushed the query past Supabase's 8s statement timeout.
--
--   `is_admin()` (defined in 0163) is SECURITY DEFINER + STABLE, so it
--   bypasses RLS on `profiles` entirely and is evaluated once per query.
--   Functionally equivalent admin check, dramatically faster execution plan.
--
-- Tables touched:
--   * public.canadian_postal_codes — fixes 500/timeout when loading admin
--     installer edit page for Canadian installers with large territories
--   * public.installer_zip_codes  — same anti-pattern; preempts the same
--     regression on territory queries
--
-- Rollback:
--   Re-create the original inline-subquery policies (see migrations 0034 and
--   0008) and the issue returns. Strongly preferred to leave this in place.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- canadian_postal_codes
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage canadian postal codes"
  ON public.canadian_postal_codes;

CREATE POLICY "Admins can manage canadian postal codes"
  ON public.canadian_postal_codes
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- installer_zip_codes
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins have full access to installer zip codes"
  ON public.installer_zip_codes;

CREATE POLICY "Admins have full access to installer zip codes"
  ON public.installer_zip_codes
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
