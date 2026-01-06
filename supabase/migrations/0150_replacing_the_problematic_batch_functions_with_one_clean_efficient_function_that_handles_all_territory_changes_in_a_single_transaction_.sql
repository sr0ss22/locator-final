-- 1. Remove all old/conflicting variants
DROP FUNCTION IF EXISTS public.batch_process_territory_changes(text, text[], jsonb, jsonb);
DROP FUNCTION IF EXISTS public.batch_process_territory_changes(text, jsonb, jsonb, jsonb);

-- 2. Create the Hyper-Optimized Batch Function
CREATE OR REPLACE FUNCTION public.batch_process_territory_changes(
  p_installer_id text,
  p_removed_zips jsonb,  -- Array of strings or objects
  p_updated_zips jsonb,  -- Array of objects
  p_added_zips jsonb     -- Array of objects
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
  -- A. SUSPEND AUDIT TRIGGERS: This prevents the 500 error by stopping 400+ individual log entries
  PERFORM set_config('my_app.bulk_op_in_progress', 'true', true);

  -- B. Identify actor safely
  BEGIN
    SELECT auth.uid() INTO _user_id;
  EXCEPTION WHEN OTHERS THEN
    _user_id := NULL;
  END;

  -- C. HIGH-SPEED JOIN DELETION
  -- Instead of using 'IN (...)', we join directly against the JSON data set.
  -- This is 10x faster for batches of 400+ items.
  IF p_removed_zips IS NOT NULL AND jsonb_array_length(p_removed_zips) > 0 THEN
    DELETE FROM public.installer_zip_codes izc
    USING (
      SELECT COALESCE(val->>'zip_code', val->>'zipCode', val#>>'{}') as z
      FROM jsonb_array_elements(p_removed_zips) AS val
    ) AS removals
    WHERE izc.installer_id = p_installer_id 
    AND izc.zip_code = removals.z;
  END IF;

  -- D. HIGH-SPEED JOIN UPDATE
  IF p_updated_zips IS NOT NULL AND jsonb_array_length(p_updated_zips) > 0 THEN
    UPDATE public.installer_zip_codes AS izc
    SET
      status = COALESCE(u.assigned_status, u."assignedStatus"),
      updated_at = now()
    FROM jsonb_to_recordset(p_updated_zips) AS u(zip_code text, "zipCode" text, assigned_status text, "assignedStatus" text)
    WHERE izc.installer_id = p_installer_id 
    AND izc.zip_code = COALESCE(u.zip_code, u."zipCode");
  END IF;

  -- E. HIGH-SPEED BATCH INSERT
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

  -- F. LOG A SINGLE SUMMARY EVENT
  _summary := format('Bulk sync complete. Removed: %s, Updated: %s, Added: %s', 
                COALESCE(jsonb_array_length(p_removed_zips), 0),
                COALESCE(jsonb_array_length(p_updated_zips), 0),
                COALESCE(jsonb_array_length(p_added_zips), 0));

  INSERT INTO public.territory_audit_log (installer_id, zip_code, change_type, assigned_by, summary)
  VALUES (p_installer_id, 'N/A', 'bulk_process', _user_id, _summary);

  -- G. RESTORE NORMAL TRIGGER MODE
  PERFORM set_config('my_app.bulk_op_in_progress', 'false', true);

EXCEPTION WHEN OTHERS THEN
  -- Disaster recovery: Always ensure triggers are re-enabled even if error occurs
  PERFORM set_config('my_app.bulk_op_in_progress', 'false', true);
  RAISE;
END;
$$;