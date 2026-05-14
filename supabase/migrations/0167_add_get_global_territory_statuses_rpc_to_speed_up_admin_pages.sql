-- =============================================================================
-- Performance fix: replace global SELECT on installer_zip_codes with a
-- SECURITY DEFINER RPC that returns one row per zip code.
--
-- Background:
--   EditInstallerPage and TerritoryManagement both populate a heatmap of
--   "what's been claimed across all installers" by running:
--
--     SELECT zip_code, status FROM installer_zip_codes
--
--   At this scale (one row per (installer, zip) pair, 100K+ assignments per
--   large installer) that returns hundreds of thousands of rows on every
--   page load. Even after migration 0164 swapped the inline-subquery RLS
--   policy to use is_admin(), the per-row policy evaluation plus the JSON
--   payload size made admin pages take 30-60 seconds to open.
--
-- Fix:
--   New `get_global_territory_statuses()` RPC:
--     * SECURITY DEFINER — bypasses RLS, single auth check at function entry.
--     * Returns one row per zip code (deduplicated), so the payload shrinks
--       from "rows per assignment" to "rows per claimed zip code".
--     * When multiple installers share a zip, prefers 'Approved' over
--       'Needs Approval' over anything else (deterministic, replaces the
--       prior non-deterministic last-row-wins behaviour).
--     * SET search_path is set to prevent search-path hijacking — standard
--       SECURITY DEFINER hardening.
--
-- Rollback:
--   DROP FUNCTION public.get_global_territory_statuses();
--   (Frontend would need to revert to direct SELECT on installer_zip_codes.)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_global_territory_statuses()
RETURNS TABLE(zip_code text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- Only admins should see the global heatmap. Non-admins (signed-in
  -- installers, anonymous public visitors) do not need this data.
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admins only.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (izc.zip_code)
    izc.zip_code,
    izc.status::text
  FROM public.installer_zip_codes izc
  ORDER BY
    izc.zip_code,
    CASE izc.status::text
      WHEN 'Approved' THEN 0
      WHEN 'Needs Approval' THEN 1
      ELSE 2
    END;
END;
$function$;

-- Per-function statement_timeout: the underlying scan is fast even on large
-- tables, but if the row count grows or shared buffers are cold, give it
-- room to complete.
ALTER FUNCTION public.get_global_territory_statuses()
  SET statement_timeout = '30s';

-- Grant execute to authenticated users so admins can call this via the
-- standard supabase-js client. The is_admin() gate inside enforces auth.
GRANT EXECUTE ON FUNCTION public.get_global_territory_statuses() TO authenticated;
