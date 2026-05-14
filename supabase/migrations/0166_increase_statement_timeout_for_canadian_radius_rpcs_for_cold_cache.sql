-- =============================================================================
-- Increase per-function statement_timeout to handle cold-cache page loads.
--
-- Background:
--   Migration 0165 made the Canadian spatial RPCs SECURITY DEFINER, removing
--   per-row RLS overhead. That solved the per-row planner regression, but
--   for installers with very large territories (e.g. ~157K postal codes
--   inside a 35km radius around Toronto) the *cold-cache* run still pushed
--   past Supabase's default 8s statement timeout — the first page load after
--   the database has been idle would still 500.
--
--   Once the GiST index pages and table data are warm in Postgres' shared
--   buffers, the same query completes in well under a second.
--
-- Fix:
--   Override statement_timeout to 30s for these two functions only. This
--   gives cold-cache executions room to load index pages without affecting
--   any other query in the database.
--
-- Rollback:
--   ALTER FUNCTION public.get_canadian_points_in_radius_count(
--     double precision, double precision, double precision
--   ) RESET statement_timeout;
--   (and likewise for get_all_canadian_points_in_radius)
-- =============================================================================

ALTER FUNCTION public.get_canadian_points_in_radius_count(
  double precision, double precision, double precision
) SET statement_timeout = '30s';

ALTER FUNCTION public.get_all_canadian_points_in_radius(
  double precision, double precision, double precision, integer, integer
) SET statement_timeout = '30s';
