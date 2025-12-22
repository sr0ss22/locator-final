CREATE OR REPLACE FUNCTION public.batch_delete_specific_installer_territories(p_installer_id text, p_zip_codes text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  _user_id UUID;
BEGIN
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

  -- Temporarily disable the per-row audit trigger for deletes to speed up the process
  ALTER TABLE public.installer_zip_codes DISABLE TRIGGER on_installer_zip_code_delete;

  -- Perform the bulk delete for the entire chunk passed in. This is much more efficient.
  DELETE FROM public.installer_zip_codes 
  WHERE installer_id = p_installer_id AND zip_code = ANY(p_zip_codes);

  -- Re-enable the audit trigger
  ALTER TABLE public.installer_zip_codes ENABLE TRIGGER on_installer_zip_code_delete;
END;
$$;