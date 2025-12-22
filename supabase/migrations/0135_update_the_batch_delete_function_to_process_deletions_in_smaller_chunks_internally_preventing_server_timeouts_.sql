CREATE OR REPLACE FUNCTION public.batch_delete_specific_installer_territories(p_installer_id text, p_zip_codes text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  _user_id UUID;
  i integer;
  chunk_size integer := 500; -- Process in chunks of 500
  zip_chunk text[];
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
    'bulk_delete_specific',
    _user_id,
    'Bulk deletion of ' || array_length(p_zip_codes, 1) || ' territories for installer ' || p_installer_id
  );

  -- Temporarily disable the per-row audit trigger for deletes
  ALTER TABLE public.installer_zip_codes DISABLE TRIGGER on_installer_zip_code_delete;

  -- Perform the bulk delete in chunks
  FOR i IN 0..floor((array_length(p_zip_codes, 1) - 1) / chunk_size) LOOP
    zip_chunk := p_zip_codes[i*chunk_size + 1 : (i+1)*chunk_size];
    DELETE FROM public.installer_zip_codes 
    WHERE installer_id = p_installer_id AND zip_code = ANY(zip_chunk);
  END LOOP;

  -- Re-enable the audit trigger
  ALTER TABLE public.installer_zip_codes ENABLE TRIGGER on_installer_zip_code_delete;
END;
$$;