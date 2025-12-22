CREATE OR REPLACE FUNCTION public.batch_delete_specific_installer_territories(p_installer_id text, p_zip_codes text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  _user_id UUID;
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

  -- Log a single bulk delete event for this chunk.
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
    'bulk_delete_specific',
    _user_id,
    'Bulk deletion of ' || array_length(p_zip_codes, 1) || ' territories for installer ' || p_installer_id
  );

  -- Perform the bulk delete for the entire chunk passed in.
  DELETE FROM public.installer_zip_codes 
  WHERE installer_id = p_installer_id AND zip_code = ANY(p_zip_codes);

  -- Unset the session-local variable
  PERFORM set_config('my_app.bulk_op_in_progress', 'false', true);
END;
$$;