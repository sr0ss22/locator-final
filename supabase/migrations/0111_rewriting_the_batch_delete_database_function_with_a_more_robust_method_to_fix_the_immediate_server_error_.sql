CREATE OR REPLACE FUNCTION public.delete_installer_territories_in_batches(_installer_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    batch_size INTEGER := 1000;
    ids_to_delete UUID[];
BEGIN
    LOOP
        -- Select a batch of primary keys into an array
        SELECT ARRAY(
            SELECT id FROM public.installer_zip_codes
            WHERE installer_id = _installer_id
            LIMIT batch_size
        ) INTO ids_to_delete;

        -- If the array is empty or null, we're done, so exit the loop
        IF array_length(ids_to_delete, 1) IS NULL OR array_length(ids_to_delete, 1) = 0 THEN
            EXIT;
        END IF;

        -- Delete the rows using the array of IDs
        DELETE FROM public.installer_zip_codes
        WHERE id = ANY(ids_to_delete);
    END LOOP;
END;
$$;