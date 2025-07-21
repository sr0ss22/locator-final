import 'dotenv/config'; // Load environment variables from .env
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url'; // Corrected import statement
import { createClient } from '@supabase/supabase-js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = "https://ggczjdgtzkfapkfjwrid.supabase.co";
// IMPORTANT: The Supabase Service Role Key should NEVER be hardcoded or exposed in client-side code.
// It is now read from an environment variable for security.
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Error: Supabase URL or Service Role Key is missing. Ensure SUPABASE_SERVICE_ROLE_KEY is set in your .env file.');
  process.exit(1);
}

// --- ADDED DEBUG LOGS ---
console.log("DEBUG: Using Supabase URL:", supabaseUrl);
console.log("DEBUG: Using Supabase Service Role Key (first 10 chars):", supabaseServiceRoleKey.substring(0, 10));
// --- END DEBUG LOGS ---

// Initialize Supabase client with the service role key
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false, // No need to persist session for a script
  },
});

// Use path.resolve to create an an absolute path to the GeoJSON file
const geoJsonFilePath = path.resolve(__dirname, './src/data/us-zip-codes.json');

// Helper function for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function migrateGeoJson() {
  try {
    console.log(`Attempting to read GeoJSON file from: ${geoJsonFilePath}`);
    const rawData = fs.readFileSync(geoJsonFilePath, 'utf8');
    const geoJson = JSON.parse(rawData);

    if (!geoJson.features || !Array.isArray(geoJson.features)) {
      console.error('Invalid GeoJSON file: "features" array not found or is not an array.');
      return;
    }

    console.log(`Starting migration of ${geoJson.features.length} ZIP code geometries...`);

    let successCount = 0;
    let errorCount = 0;

    for (const feature of geoJson.features) {
      const { properties, geometry } = feature;
      const zipCode = properties.ZCTA5CE20;
      const stateProvince = properties.STUSPS || 'Unknown'; 
      const centroidLatitude = parseFloat(properties.INTPTLAT20);
      const centroidLongitude = parseFloat(properties.INTPTLON20);

      if (!zipCode) {
        console.warn(`Skipping feature due to missing ZIP code: ${JSON.stringify(properties)}`);
        errorCount++;
        continue;
      }

      // Ensure geometry is not null before stringifying
      const geometryJsonString = geometry ? JSON.stringify(geometry) : null;

      // --- NEW LOGGING ADDED HERE ---
      console.log(`DEBUG: Processing ZIP ${zipCode}`);
      console.log(`DEBUG:   Original geometry object for ${zipCode}:`, geometry);
      console.log(`DEBUG:   Stringified geometry for ${zipCode} (first 200 chars):`, geometryJsonString ? geometryJsonString.substring(0, 200) + '...' : 'null');
      console.log(`DEBUG:   Centroid Lat/Lng for ${zipCode}: ${centroidLatitude}, ${centroidLongitude}`);
      // --- END NEW LOGGING ---

      // Call the new RPC function to upsert the data, passing _is_canada: false
      const { error } = await supabase.rpc('upsert_zip_geometry', {
          _zip_code: zipCode,
          _state_province: stateProvince,
          _geometry_geojson_string: geometryJsonString,
          _centroid_latitude: isNaN(centroidLatitude) ? null : centroidLatitude,
          _centroid_longitude: isNaN(centroidLongitude) ? null : centroidLongitude,
          _is_canada: false, // Indicate that this is US data
      });

      if (error) {
        console.error(`Error upserting ZIP code ${zipCode}:`, error.message);
        errorCount++;
      } else {
        successCount++;
      }

      await delay(50); // Small delay to avoid hitting rate limits
    }

    console.log('Migration complete.');
    console.log(`Successfully processed: ${successCount}`);
    console.log(`Failed/Skipped: ${errorCount}`);

  } catch (error) {
    console.error('An unexpected error occurred during migration:', error);
  } finally {
    // Cleanup
  }
}

migrateGeoJson();