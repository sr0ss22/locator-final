CREATE OR REPLACE FUNCTION public.delete_installer_territories_in_batches(_installer_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    deleted_count INTEGER;
    _user_id UUID;
BEGIN
    -- This function is called by an edge function which has its own authorization.
    -- The user context is lost when calling a SECURITY DEFINER function, so uid() will be null.
    -- This is expected and helps identify system-level bulk operations in the audit log.
    BEGIN
      SELECT uid() INTO _user_id;
    EXCEPTION
      WHEN OTHERS THEN
        _user_id := NULL;
    END;

    -- Get the number of rows that will be deleted for the summary audit log
    SELECT count(*) INTO deleted_count FROM public.installer_zip_codes WHERE installer_id = _installer_id;

    -- If there's nothing to delete, we're done.
    IF deleted_count = 0 THEN
        RETURN;
    END IF;

    -- Temporarily disable the trigger to avoid firing it for every single row
    ALTER TABLE public.installer_zip_codes DISABLE TRIGGER on_installer_zip_code_delete;

    -- Perform the bulk delete in a single, fast operation
    DELETE FROM public.installer_zip_codes WHERE installer_id = _installer_id;

    -- IMPORTANT: Always re-enable the trigger. The EXCEPTION block handles failures.
    ALTER TABLE public.installer_zip_codes ENABLE TRIGGER on_installer_zip_code_delete;

    -- Manually insert a single, summary audit log entry for the entire bulk operation
    INSERT INTO public.territory_audit_log (
        installer_id,
        change_type,
        assigned_by,
        summary
    ) VALUES (
        _installer_id,
        'assignment_bulk_deleted',
        _user_id, -- This will be NULL, indicating a system/bulk operation
        'Bulk deleted ' || deleted_count || ' territory assignments for installer ' || _installer_id || '.'
    );

EXCEPTION
    WHEN OTHERS THEN
        -- In case of any error during the DELETE, we MUST ensure the trigger is re-enabled
        ALTER TABLE public.installer_zip_codes ENABLE TRIGGER on_installer_zip_code_delete;
        -- Re-throw the original error to be caught by the calling function
        RAISE;
END;
$function$