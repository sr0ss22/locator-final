CREATE OR REPLACE FUNCTION public.batch_insert_installer_territories(p_installer_id text, territories jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  _user_id UUID;
  territory_record JSONB;
BEGIN
  -- Set a session-local variable to bypass the row-level audit trigger
  PERFORM set_config('my_app.bulk_op_in_progress', 'true', true);

  -- Get current user ID if available
  BEGIN
    SELECT auth.uid() INTO _user_id;
  EXCEPTION
    WHEN OTHERS THEN
      _user_id := NULL;
  END;

  -- Log a single bulk insert event
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
    'bulk_insert',
    _user_id,
    'Bulk insertion of ' || jsonb_array_length(territories) || ' territories for installer ' || p_installer_id
  );

  -- Insert the new territories from the JSONB array
  IF jsonb_array_length(territories) > 0 THEN
    INSERT INTO public.installer_zip_codes (installer_id, zip_code, state_province, status)
    SELECT
      p_installer_id,
      (value->>'zipCode')::TEXT,
      (value->>'stateProvince')::TEXT,
      (value->>'assignedStatus')::TEXT
    FROM jsonb_array_elements(territories);
  END IF;

  -- Unset the session-local variable
  PERFORM set_config('my_app.bulk_op_in_progress', 'false', true);
END;
$$;