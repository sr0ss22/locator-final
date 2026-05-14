-- =============================================================================
-- Performance fix: make Canadian spatial RPCs SECURITY DEFINER.
--
-- Background:
--   Migration 0163 enabled RLS on `profiles`. Migration 0164 swapped the
--   inline-subquery RLS policies on `canadian_postal_codes` and
--   `installer_zip_codes` to use the SECURITY DEFINER `is_admin()` helper.
--
--   That helped, but it's still not enough for the very large spatial queries
--   that the territory map performs (counting / paginating millions of
--   Canadian postal codes within a 75km radius). Even with `is_admin()` as
--   the policy USING clause, the planner can re-evaluate it per row, and the
--   CPU cost on a multi-hundred-thousand-row spatial scan pushes past the
--   8-second statement timeout — producing 500s when an admin opens the edit
--   page for an installer with a large Canadian territory.
--
-- Fix:
--   Convert the two spatial RPCs themselves to SECURITY DEFINER. They then
--   execute as the function owner (postgres / table owner), which bypasses
--   RLS on `canadian_postal_codes` entirely. The result: a single fast
--   spatial scan using the GiST index, with no per-row policy evaluation.
--
-- Security implications:
--   * The functions now bypass RLS on `canadian_postal_codes`.
--   * This matches the prior de-facto state — `canadian_postal_codes` has
--     long had a "Allow public read access" policy from migration 0011, so
--     anonymous reads were already permitted on this reference data.
--   * The data itself is non-sensitive Canadian postal-code reference data.
--   * RLS on the underlying table is preserved and still blocks the direct
--     `/rest/v1/canadian_postal_codes` REST endpoint for non-admin callers
--     attempting to bulk-scrape via PostgREST.
--   * SET search_path is set to public, pg_temp to prevent search-path
--     hijacking — standard hardening for SECURITY DEFINER functions.
--
-- Rollback:
--   Re-apply migration 0116 (which created these as plain plpgsql).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- get_canadian_points_in_radius_count: count points within a radius.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_canadian_points_in_radius_count(
  center_lat double precision,
  center_lng double precision,
  radius_meters double precision
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  center_point geography;
  total_count integer;
BEGIN
  center_point := ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography;

  SELECT count(*)
  INTO total_count
  FROM public.canadian_postal_codes cpc
  WHERE ST_DWithin(cpc.geog, center_point, radius_meters, false);

  RETURN total_count;
END;
$function$;


-- -----------------------------------------------------------------------------
-- get_all_canadian_points_in_radius: paginated fetch of points within a radius.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_all_canadian_points_in_radius(
  center_lat double precision,
  center_lng double precision,
  radius_meters double precision,
  page_size integer,
  page_number integer
)
RETURNS TABLE(
  id uuid,
  "POSTAL_CODE" text,
  "PROVINCE_ABBR" text,
  "LATITUDE" double precision,
  "LONGITUDE" double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  center_point geography;
  offset_val integer;
BEGIN
  center_point := ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography;
  offset_val := (page_number - 1) * page_size;

  RETURN QUERY
  SELECT
    cpc.id,
    cpc."POSTAL_CODE",
    cpc."PROVINCE_ABBR",
    cpc."LATITUDE",
    cpc."LONGITUDE"
  FROM public.canadian_postal_codes cpc
  WHERE ST_DWithin(cpc.geog, center_point, radius_meters, false)
  ORDER BY cpc.id
  LIMIT page_size
  OFFSET offset_val;
END;
$function$;
