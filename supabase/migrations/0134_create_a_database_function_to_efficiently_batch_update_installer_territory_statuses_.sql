CREATE OR REPLACE FUNCTION public.batch_update_installer_territories(p_installer_id text, p_updates jsonb)
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

  -- Log a single bulk update event
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
    'bulk_update',
    _user_id,
    'Bulk update of ' || jsonb_array_length(p_updates) || ' territories for installer ' || p_installer_id
  );

  -- Temporarily disable the per-row audit trigger for updates
  ALTER TABLE public.installer_zip_codes DISABLE TRIGGER on_installer_zip_code_update;

  -- Perform the bulk update
  UPDATE public.installer_zip_codes AS izc
  SET 
    status = u."assignedStatus",
    updated_at = now()
  FROM jsonb_to_recordset(p_updates) AS u("zipCode" text, "assignedStatus" text)
  WHERE izc.installer_id = p_installer_id AND izc.zip_code = u."zipCode";

  -- Re-enable the audit trigger
  ALTER TABLE public.installer_zip_codes ENABLE TRIGGER on_installer_zip_code_update;
END;
$$;