import 'dotenv/config'; // Load environment variables from .env
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import * as turf from '@turf/turf'; // Corrected import statement

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = "https://ggczjdgtzkfapkfjwrid.supabase.co";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Error: Supabase URL or Service Role Key is missing. Ensure SUPABASE_SERVICE_ROLE_KEY is set in your .env file.');
  process.exit(1);
}

// Initialize Supabase client with the service role key
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
  },
});

// --- IMPORTANT ---
// Please ensure this path points to your Canadian GeoJSON file.
const geoJsonFilePath = path.resolve(__dirname, './src/data/canada-postal-codes.json');

// Helper function for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function migrateCanadaGeoJson() {
  try {
    console.log(`Attempting to read Canadian GeoJSON file from: ${geoJsonFilePath}`);
    const rawData = fs.readFileSync(geoJsonFilePath, 'utf8');
    const geoJson = JSON.parse(rawData);

    if (!geoJson.features || !Array.isArray(geoJson.features)) {
      console.error('Invalid GeoJSON file: "features" array not found or is not an array.');
      return;
    }

    console.log(`Starting migration of ${geoJson.features.length} Canadian FSA geometries...`);

    let successCount = 0;
    let errorCount = 0;

    for (const feature of geoJson.features) {
      const { properties, geometry } = feature;
      
      // Use Canadian property keys
      const fsa = properties.CFSAUID;
      const province = properties.PRNAME;

      if (!fsa) {
        console.warn(`Skipping feature due to missing FSA code: ${JSON.stringify(properties)}`);
        errorCount++;
        continue;
      }

      // Calculate centroid manually using Turf.js
      const centroid = turf.centroid(feature);
      const [longitude, latitude] = centroid.geometry.coordinates;

      const geometryJsonString = geometry ? JSON.stringify(geometry) : null;

      // Call the same RPC function with the Canadian data
      const { error } = await supabase.rpc('upsert_zip_geometry', {
          _zip_code: fsa,
          _state_province: province,
          _geometry_geojson_string: geometryJsonString,
          _centroid_latitude: latitude,
          _centroid_longitude: longitude,
      });

      if (error) {
        console.error(`Error upserting FSA ${fsa}:`, error.message);
        errorCount++;
      } else {
        successCount++;
        console.log(`Successfully processed FSA: ${fsa}`);
      }

      await delay(50); // Small delay to avoid hitting rate limits
    }

    console.log('Canadian migration complete.');
    console.log(`Successfully processed: ${successCount}`);
    console.log(`Failed/Skipped: ${errorCount}`);

  } catch (error) {
    console.error('An unexpected error occurred during migration:', error);
  }
}

migrateCanadaGeoJson();