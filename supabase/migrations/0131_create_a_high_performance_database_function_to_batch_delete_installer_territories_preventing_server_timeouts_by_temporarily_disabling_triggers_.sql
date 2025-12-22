CREATE OR REPLACE FUNCTION public.batch_delete_installer_territories(p_installer_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'auth'
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

  -- Log a single bulk delete event
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
    'bulk_delete',
    _user_id,
    'Bulk deletion of all territories for installer ' || p_installer_id
  );

  -- Temporarily disable the per-row audit trigger for deletes
  ALTER TABLE public.installer_zip_codes DISABLE TRIGGER on_installer_zip_code_delete;

  -- Perform the bulk delete
  DELETE FROM public.installer_zip_codes WHERE installer_id = p_installer_id;

  -- Re-enable the audit trigger
  ALTER TABLE public.installer_zip_codes ENABLE TRIGGER on_installer_zip_code_delete;
END;
$$;