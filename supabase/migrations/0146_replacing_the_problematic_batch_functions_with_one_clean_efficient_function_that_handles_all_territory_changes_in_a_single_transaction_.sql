-- 1. Clean up all previous versions of this function
DROP FUNCTION IF EXISTS public.batch_process_territory_changes(text, text[], jsonb, jsonb);

-- 2. Create a robust, high-performance function using JSONB for all parameters
-- This is the most reliable way to pass large sets of data between the browser and the database.
CREATE OR REPLACE FUNCTION public.batch_process_territory_changes(
  p_installer_id text,
  p_removed_zips jsonb,
  p_updated_zips jsonb,
  p_added_zips jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  _user_id UUID;
  _summary TEXT;
BEGIN
  -- Performance mode: bypass row-by-row audit logs for this transaction
  PERFORM set_config('my_app.bulk_op_in_progress', 'true', true);

  -- Identify the acting user
  BEGIN
    SELECT auth.uid() INTO _user_id;
  EXCEPTION WHEN OTHERS THEN
    _user_id := NULL;
  END;

  -- A. Handle Deletions (Resilient to both flat strings and objects)
  IF p_removed_zips IS NOT NULL AND jsonb_array_length(p_removed_zips) > 0 THEN
    DELETE FROM public.installer_zip_codes
    WHERE installer_id = p_installer_id 
    AND zip_code IN (
      SELECT COALESCE(value->>'zip_code', value->>'zipCode', value::text)
      FROM jsonb_array_elements(p_removed_zips)
    );
  END IF;

  -- B. Handle Updates
  IF p_updated_zips IS NOT NULL AND jsonb_array_length(p_updated_zips) > 0 THEN
    UPDATE public.installer_zip_codes AS izc
    SET
      status = COALESCE(u.assigned_status, u."assignedStatus"),
      updated_at = now()
    FROM jsonb_to_recordset(p_updated_zips) AS u(zip_code text, "zipCode" text, assigned_status text, "assignedStatus" text)
    WHERE izc.installer_id = p_installer_id 
    AND izc.zip_code = COALESCE(u.zip_code, u."zipCode");
  END IF;

  -- C. Handle Additions
  IF p_added_zips IS NOT NULL AND jsonb_array_length(p_added_zips) > 0 THEN
    INSERT INTO public.installer_zip_codes (installer_id, zip_code, state_province, status)
    SELECT
      p_installer_id,
      COALESCE(value->>'zip_code', value->>'zipCode'),
      COALESCE(value->>'state_province', value->>'stateProvince'),
      COALESCE(value->>'assigned_status', value->>'assignedStatus')
    FROM jsonb_array_elements(p_added_zips)
    ON CONFLICT (installer_id, zip_code) DO NOTHING;
  END IF;

  -- D. Log the bulk operation in a single audit entry
  _summary := 'Bulk sync complete. Removed: ' || COALESCE(jsonb_array_length(p_removed_zips), 0) || 
              ', Updated: ' || COALESCE(jsonb_array_length(p_updated_zips), 0) || 
              ', Added: ' || COALESCE(jsonb_array_length(p_added_zips), 0);

  INSERT INTO public.territory_audit_log (installer_id, zip_code, change_type, assigned_by, summary)
  VALUES (p_installer_id, 'N/A', 'bulk_process', _user_id, _summary);

  -- Restore normal trigger mode
  PERFORM set_config('my_app.bulk_op_in_progress', 'false', true);
END;
$$;