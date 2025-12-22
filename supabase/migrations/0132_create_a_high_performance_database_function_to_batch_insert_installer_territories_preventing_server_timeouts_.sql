CREATE OR REPLACE FUNCTION public.batch_insert_installer_territories(p_installer_id TEXT, territories JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'auth'
AS $$
DECLARE
  _user_id UUID;
  territory_record JSONB;
BEGIN
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

  -- Temporarily disable the per-row audit trigger for inserts to improve performance
  ALTER TABLE public.installer_zip_codes DISABLE TRIGGER on_installer_zip_code_insert;

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

  -- Re-enable the audit trigger
  ALTER TABLE public.installer_zip_codes ENABLE TRIGGER on_installer_zip_code_insert;
END;
$$;