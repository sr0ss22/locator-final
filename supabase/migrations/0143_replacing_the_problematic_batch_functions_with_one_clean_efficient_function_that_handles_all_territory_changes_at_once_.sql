-- First, clear out any old/broken versions of these functions
DROP FUNCTION IF EXISTS public.batch_process_territory_changes(text, text[], jsonb, jsonb);

-- Create a single, high-performance function to handle everything at once
CREATE OR REPLACE FUNCTION public.batch_process_territory_changes(
  p_installer_id text,
  p_removed_zips text[],
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
  -- 1. Activate the high-performance mode by bypassing the row-by-row audit log
  PERFORM set_config('my_app.bulk_op_in_progress', 'true', true);

  -- 2. Identify the user making the change
  BEGIN
    SELECT auth.uid() INTO _user_id;
  EXCEPTION
    WHEN OTHERS THEN
      _user_id := NULL;
  END;

  -- 3. Execute all deletions in one efficient step
  IF p_removed_zips IS NOT NULL AND array_length(p_removed_zips, 1) > 0 THEN
    DELETE FROM public.installer_zip_codes
    WHERE installer_id = p_installer_id 
    AND zip_code = ANY(p_removed_zips);
  END IF;

  -- 4. Execute all status updates in one efficient step
  IF p_updated_zips IS NOT NULL AND jsonb_array_length(p_updated_zips) > 0 THEN
    UPDATE public.installer_zip_codes AS izc
    SET
      status = u.assigned_status,
      updated_at = now()
    FROM jsonb_to_recordset(p_updated_zips) AS u(zip_code text, assigned_status text)
    WHERE izc.installer_id = p_installer_id AND izc.zip_code = u.zip_code;
  END IF;

  -- 5. Execute all new additions in one efficient step
  IF p_added_zips IS NOT NULL AND jsonb_array_length(p_added_zips) > 0 THEN
    INSERT INTO public.installer_zip_codes (installer_id, zip_code, state_province, status)
    SELECT
      p_installer_id,
      (value->>'zip_code')::TEXT,
      (value->>'state_province')::TEXT,
      (value->>'assigned_status')::TEXT
    FROM jsonb_array_elements(p_added_zips)
    ON CONFLICT (installer_id, zip_code) DO NOTHING;
  END IF;

  -- 6. Create a single, summarized entry in the audit log
  _summary := 'Bulk territory update. Removed: ' || COALESCE(array_length(p_removed_zips, 1), 0) || 
              ', Updated: ' || COALESCE(jsonb_array_length(p_updated_zips), 0) || 
              ', Added: ' || COALESCE(jsonb_array_length(p_added_zips), 0) || '.';

  INSERT INTO public.territory_audit_log (
    installer_id,
    zip_code,
    change_type,
    assigned_by,
    summary
  )
  VALUES (
    p_installer_id,
    'N/A',
    'bulk_process',
    _user_id,
    _summary
  );

  -- 7. Deactivate high-performance mode
  PERFORM set_config('my_app.bulk_op_in_progress', 'false', true);
END;
$$;