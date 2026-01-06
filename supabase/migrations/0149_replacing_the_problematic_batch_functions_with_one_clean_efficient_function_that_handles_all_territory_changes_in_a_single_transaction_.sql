-- 1. Remove all old variants to ensure zero conflict
DROP FUNCTION IF EXISTS public.batch_process_territory_changes(text, text[], jsonb, jsonb);
DROP FUNCTION IF EXISTS public.batch_process_territory_changes(text, jsonb, jsonb, jsonb);

-- 2. Create the "Bulletproof" high-speed sync function
CREATE OR REPLACE FUNCTION public.batch_process_territory_changes(
  p_installer_id text,
  p_removed_zips jsonb,  -- Array of strings or objects
  p_updated_zips jsonb,  -- Array of objects
  p_added_zips jsonb     -- Array of objects
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
  -- A. ACTIVATE SILENT MODE: Completely skip row-by-row audit triggers
  PERFORM set_config('my_app.bulk_op_in_progress', 'true', true);

  -- B. Identify actor (Safe check)
  BEGIN
    SELECT auth.uid() INTO _user_id;
  EXCEPTION WHEN OTHERS THEN
    _user_id := NULL;
  END;

  -- C. HIGH-SPEED DELETION
  -- We parse the JSON once into a memory table for maximum speed
  IF p_removed_zips IS NOT NULL AND jsonb_array_length(p_removed_zips) > 0 THEN
    DELETE FROM public.installer_zip_codes
    WHERE installer_id = p_installer_id 
    AND zip_code IN (
      SELECT COALESCE(val->>'zip_code', val->>'zipCode', val#>>'{}')
      FROM jsonb_array_elements(p_removed_zips) AS val
    );
  END IF;

  -- D. HIGH-SPEED UPDATE
  IF p_updated_zips IS NOT NULL AND jsonb_array_length(p_updated_zips) > 0 THEN
    UPDATE public.installer_zip_codes AS izc
    SET
      status = COALESCE(u.assigned_status, u."assignedStatus"),
      updated_at = now()
    FROM jsonb_to_recordset(p_updated_zips) AS u(zip_code text, "zipCode" text, assigned_status text, "assignedStatus" text)
    WHERE izc.installer_id = p_installer_id 
    AND izc.zip_code = COALESCE(u.zip_code, u."zipCode");
  END IF;

  -- E. HIGH-SPEED INSERT
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

  -- F. RECORD ONE SINGLE AUDIT EVENT (SUMMARY)
  _summary := 'Bulk Sync: Removed=' || COALESCE(jsonb_array_length(p_removed_zips), 0) || 
              ', Updated=' || COALESCE(jsonb_array_length(p_updated_zips), 0) || 
              ', Added=' || COALESCE(jsonb_array_length(p_added_zips), 0);

  INSERT INTO public.territory_audit_log (installer_id, zip_code, change_type, assigned_by, summary)
  VALUES (p_installer_id, 'N/A', 'bulk_process', _user_id, _summary);

  -- G. RESTORE NORMAL MODE
  PERFORM set_config('my_app.bulk_op_in_progress', 'false', true);

EXCEPTION WHEN OTHERS THEN
  -- Ensure triggers are re-enabled even if it fails
  PERFORM set_config('my_app.bulk_op_in_progress', 'false', true);
  RAISE;
END;
$$;