-- Drop the old, separate batch processing functions
DROP FUNCTION IF EXISTS public.batch_delete_specific_installer_territories(text, text[]);
DROP FUNCTION IF EXISTS public.batch_update_installer_territories(text, jsonb);
DROP FUNCTION IF EXISTS public.batch_insert_installer_territories(text, jsonb);

-- Create a new, consolidated function to handle all territory changes in one transaction
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
  _summary TEXT := 'Bulk territory update for installer ' || p_installer_id || '.';
BEGIN
  -- Set a session-local variable to bypass the row-level audit trigger
  PERFORM set_config('my_app.bulk_op_in_progress', 'true', true);

  -- Get current user ID, handle system user case
  BEGIN
    SELECT auth.uid() INTO _user_id;
  EXCEPTION
    WHEN OTHERS THEN
      _user_id := NULL;
  END;

  -- Handle Deletions
  IF array_length(p_removed_zips, 1) > 0 THEN
    DELETE FROM public.installer_zip_codes
    WHERE installer_id = p_installer_id AND zip_code = ANY(p_removed_zips);
    _summary := _summary || ' Removed ' || array_length(p_removed_zips, 1) || ' territories.';
  END IF;

  -- Handle Updates
  IF jsonb_array_length(p_updated_zips) > 0 THEN
    UPDATE public.installer_zip_codes AS izc
    SET
      status = u. "assignedStatus",
      updated_at = now()
    FROM jsonb_to_recordset(p_updated_zips) AS u("zipCode" text, "assignedStatus" text)
    WHERE izc.installer_id = p_installer_id AND izc.zip_code = u."zipCode";
    _summary := _summary || ' Updated ' || jsonb_array_length(p_updated_zips) || ' territories.';
  END IF;

  -- Handle Additions
  IF jsonb_array_length(p_added_zips) > 0 THEN
    INSERT INTO public.installer_zip_codes (installer_id, zip_code, state_province, status)
    SELECT
      p_installer_id,
      (value->>'zipCode')::TEXT,
      (value->>'stateProvince')::TEXT,
      (value->>'assignedStatus')::TEXT
    FROM jsonb_array_elements(p_added_zips);
    _summary := _summary || ' Added ' || jsonb_array_length(p_added_zips) || ' territories.';
  END IF;

  -- Log a single bulk event for all changes
  IF array_length(p_removed_zips, 1) > 0 OR jsonb_array_length(p_updated_zips) > 0 OR jsonb_array_length(p_added_zips) > 0 THEN
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
  END IF;

  -- Unset the session-local variable
  PERFORM set_config('my_app.bulk_op_in_progress', 'false', true);
END;
$$;