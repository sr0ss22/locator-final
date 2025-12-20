CREATE OR REPLACE FUNCTION public.delete_territories_by_installer_batch(_installer_id text, batch_size integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    deleted_ids UUID[];
    deleted_count INTEGER;
BEGIN
    -- Temporarily disable triggers for this transaction to avoid a trigger storm
    SET session_replication_role = 'replica';

    -- Find a batch of IDs to delete
    SELECT ARRAY(
        SELECT id FROM public.installer_zip_codes
        WHERE installer_id = _installer_id
        LIMIT batch_size
    ) INTO deleted_ids;

    -- If there's nothing to delete, return 0
    IF array_length(deleted_ids, 1) IS NULL THEN
        -- Re-enable triggers before exiting
        SET session_replication_role = 'origin';
        RETURN 0;
    END IF;

    -- Perform the delete on the batch
    DELETE FROM public.installer_zip_codes
    WHERE id = ANY(deleted_ids);

    -- Get the actual number of rows deleted
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    -- IMPORTANT: Always re-enable triggers for the session
    SET session_replication_role = 'origin';

    -- Return the number of rows that were deleted
    RETURN deleted_count;

EXCEPTION
    WHEN OTHERS THEN
        -- In case of any error, we MUST ensure triggers are re-enabled
        SET session_replication_role = 'origin';
        -- Re-throw the original error
        RAISE;
END;
$function$