DO $$
DECLARE
    batch_size INT := 25000; -- Process 25,000 records at a time
    updated_rows INT;
    total_updated_rows INT := 0;
BEGIN
    RAISE NOTICE 'Starting batched update of geog column...';
    LOOP
        -- Find a batch of rows that need updating
        WITH rows_to_update AS (
            SELECT id
            FROM public.canadian_postal_codes
            WHERE geog IS NULL
              AND "LONGITUDE" IS NOT NULL
              AND "LATITUDE" IS NOT NULL
            LIMIT batch_size
        )
        -- Update the found batch
        UPDATE public.canadian_postal_codes
        SET geog = ST_SetSRID(ST_MakePoint("LONGITUDE", "LATITUDE"), 4326)::geography
        WHERE id IN (SELECT id FROM rows_to_update);

        -- Get the number of rows updated in this batch
        GET DIAGNOSTICS updated_rows = ROW_COUNT;
        total_updated_rows := total_updated_rows + updated_rows;

        -- Exit the loop if no more rows were updated
        EXIT WHEN updated_rows = 0;

        -- Log progress
        RAISE NOTICE 'Updated % rows in this batch. Total updated: %', updated_rows, total_updated_rows;

    END LOOP;
    RAISE NOTICE 'Finished batched update. Total rows updated: %', total_updated_rows;
END $$;