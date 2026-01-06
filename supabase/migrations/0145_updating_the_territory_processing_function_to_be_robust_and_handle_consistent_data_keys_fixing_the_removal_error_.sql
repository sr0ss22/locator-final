-- Drop the old versions to ensure a clean slate
DROP FUNCTION IF EXISTS public.batch_process_territory_changes(text, text[], jsonb, jsonb);

-- Create a simplified, high-performance function
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
  -- 1. Disable audit triggers for performance
  PERFORM set_config('my_app.bulk_op_in_progress', 'true', true);

  -- 2. Get user ID
  BEGIN
    SELECT auth.uid() INTO _user_id;
  EXCEPTION WHEN OTHERS THEN
    _user_id := NULL;
  END;

  -- 3. Efficient Deletions
  IF p_removed_zips IS NOT NULL AND array_length(p_removed_zips, 1) > 0 THEN
    DELETE FROM public.installer_zip_codes
    WHERE installer_id = p_installer_id 
    AND zip_code = ANY(p_removed_zips);
  END IF;

  -- 4. Efficient Updates (handling both snake and camel case keys for safety)
  IF p_updated_zips IS NOT NULL AND jsonb_array_length(p_updated_zips) > 0 THEN
    UPDATE public.installer_zip_codes AS izc
    SET
      status = COALESCE(u.assigned_status, u."assignedStatus"),
      updated_at = now()
    FROM jsonb_to_recordset(p_updated_zips) AS u(zip_code text, "zipCode" text, assigned_status text, "assignedStatus" text)
    WHERE izc.installer_id = p_installer_id 
    AND izc.zip_code = COALESCE(u.zip_code, u."zipCode");
  END IF;

  -- 5. Efficient Additions
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

  -- 6. Log a single entry
  _summary := 'Bulk update: Removed ' || COALESCE(array_length(p_removed_zips, 1), 0) || 
              ', Updated ' || COALESCE(jsonb_array_length(p_updated_zips), 0) || 
              ', Added ' || COALESCE(jsonb_array_length(p_added_zips), 0);

  INSERT INTO public.territory_audit_log (installer_id, zip_code, change_type, assigned_by, summary)
  VALUES (p_installer_id, 'N/A', 'bulk_process', _user_id, _summary);

  -- 7. Re-enable triggers
  PERFORM set_config('my_app.bulk_op_in_progress', 'false', true);
END;
$$;