import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = "https://ggczjdgtzkfapkfjwrid.supabase.co";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Error: Supabase URL or Service Role Key is missing. Ensure SUPABASE_SERVICE_ROLE_KEY is set in your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
  },
});

const jsonFilePath = path.resolve(__dirname, './src/data/georef-united-states-of-america-zc-point@public.json');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function migrateStateCodes() {
  try {
    console.log(`Reading state code data from: ${jsonFilePath}`);
    const rawData = fs.readFileSync(jsonFilePath, 'utf8');
    const jsonData = JSON.parse(rawData);

    if (!Array.isArray(jsonData)) {
      console.error('Invalid JSON file: Expected an array of records.');
      return;
    }

    const updates = jsonData.map((record) => ({
      zip_code: record.fields.zip_code,
      state_province: record.fields.stusps_code,
    })).filter(item => item.zip_code && item.state_province);

    if (updates.length === 0) {
      console.log("No valid records to update.");
      return;
    }

    console.log(`Found ${updates.length} records to process.`);

    const batchSize = 500;
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.ceil((i + batch.length) / batchSize)} of ${Math.ceil(updates.length / batchSize)}...`);

      const { error } = await supabase
        .from('zip_code_geometries')
        .upsert(batch, { onConflict: 'zip_code' });

      if (error) {
        console.error(`Error processing batch:`, error.message);
        errorCount += batch.length;
      } else {
        successCount += batch.length;
      }
      await delay(100); // Small delay between batches
    }

    console.log('State code migration complete.');
    console.log(`Successfully processed: ${successCount}`);
    console.log(`Failed: ${errorCount}`);

  } catch (error) {
    console.error('An unexpected error occurred during migration:', error);
  }
}

migrateStateCodes();