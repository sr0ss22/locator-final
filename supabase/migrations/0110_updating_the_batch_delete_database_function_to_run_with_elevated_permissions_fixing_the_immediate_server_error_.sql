CREATE OR REPLACE FUNCTION public.delete_installer_territories_in_batches(_installer_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    batch_size INTEGER := 5000;
    deleted_count INTEGER;
BEGIN
    LOOP
        -- Find a batch of primary keys to delete
        WITH rows_to_delete AS (
            SELECT id FROM public.installer_zip_codes
            WHERE installer_id = _installer_id
            LIMIT batch_size
        )
        -- Delete the found rows
        DELETE FROM public.installer_zip_codes
        WHERE id IN (SELECT id FROM rows_to_delete);

        -- Get the number of rows deleted in this batch
        GET DIAGNOSTICS deleted_count = ROW_COUNT;

        -- Exit the loop if no more rows were deleted
        EXIT WHEN deleted_count = 0;
    END LOOP;
END;
$$;