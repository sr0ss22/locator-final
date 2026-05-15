-- =============================================================================
-- Performance fix: single-call RPC for an installer's own zip codes.
--
-- Background:
--   useInstallerZipCodes() in src/hooks/useInstallerData.ts loads an
--   installer's territory by paginating PostgREST in 1000-row chunks
--   sequentially. PostgREST's default row limit is 1000; the only way
--   around it via the table API is exactly this kind of paginated loop.
--
--   For installers with very large territories (~90K zip assignments), that
--   meant ~90 sequential HTTP roundtrips on every page load — 30+ seconds
--   of latency, dominated by network time, not query time.
--
-- Fix:
--   New SECURITY DEFINER RPC `get_installer_zip_codes_admin(p_installer_id)`
--   returns the full set in a single call. PostgREST does not impose its
--   1000-row limit on RPC results, and SECURITY DEFINER bypasses RLS so
--   there's no per-row policy evaluation.
--
-- Rollback:
--   DROP FUNCTION public.get_installer_zip_codes_admin(text);
--   (Frontend would revert to the paginated pattern.)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_installer_zip_codes_admin(
  p_installer_id text
)
RETURNS TABLE(zip_code text, status text, state_province text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admins only.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    izc.zip_code,
    izc.status::text,
    izc.state_province
  FROM public.installer_zip_codes izc
  WHERE izc.installer_id = p_installer_id;
END;
$function$;

ALTER FUNCTION public.get_installer_zip_codes_admin(text)
  SET statement_timeout = '30s';

GRANT EXECUTE ON FUNCTION public.get_installer_zip_codes_admin(text) TO authenticated;
