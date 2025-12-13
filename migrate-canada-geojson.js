import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import * as turf from '@turf/turf';
import proj4 from 'proj4';

// Define projections for coordinate conversion
proj4.defs("EPSG:3857", "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs");
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = "https://ggczjdgtzkfapkfjwrid.supabase.co";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Error: Supabase URL or Service Role Key is missing. Ensure SUPABASE_SERVICE_ROLE_KEY is set in your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const geoJsonFilePath = path.resolve(__dirname, './src/data/canada-postal-codes.json');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function migrateCanadaGeoJson() {
  try {
    console.log(`Reading Canadian GeoJSON file from: ${geoJsonFilePath}`);
    const rawData = fs.readFileSync(geoJsonFilePath, 'utf8');
    const geoJson = JSON.parse(rawData);

    if (!geoJson.features || !Array.isArray(geoJson.features)) {
      console.error('Invalid GeoJSON file: "features" array not found.');
      return;
    }

    console.log(`Starting migration of ${geoJson.features.length} Canadian postal code geometries...`);

    let successCount = 0;
    let errorCount = 0;
    const batchSize = 50; // Process in smaller batches

    for (let i = 0; i < geoJson.features.length; i += batchSize) {
      const batch = geoJson.features.slice(i, i + batchSize);
      const rpcCalls = batch.map(feature => {
        const { properties } = feature;
        const postalCode = properties.CFSAUID;
        const province = properties.PRNAME;

        // The Canadian GeoJSON is already in EPSG:4326, so no reprojection is needed.
        const geometryJsonString = feature.geometry ? JSON.stringify(feature.geometry) : null;

        // Calculate centroid from the original geometry
        let centroidLatitude = null;
        let centroidLongitude = null;
        try {
          const centroid = turf.centroid(feature.geometry);
          if (centroid?.geometry?.coordinates) {
            centroidLongitude = centroid.geometry.coordinates[0];
            centroidLatitude = centroid.geometry.coordinates[1];
          }
        } catch (e) {
          console.warn(`Could not calculate centroid for ${postalCode}:`, e);
        }

        return supabase.rpc('upsert_zip_geometry', {
          _zip_code: postalCode,
          _state_province: province,
          _geometry_geojson_string: geometryJsonString,
          _centroid_latitude: isNaN(centroidLatitude) ? null : centroidLatitude,
          _centroid_longitude: isNaN(centroidLongitude) ? null : centroidLongitude,
          _is_canada: true,
        });
      });

      const results = await Promise.allSettled(rpcCalls);
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && !result.value.error) {
          successCount++;
        } else {
          errorCount++;
          const postalCode = batch[index].properties.CFSAUID;
          console.error(`Error upserting postal code ${postalCode}:`, result.status === 'rejected' ? result.reason : result.value.error);
        }
      });
      
      console.log(`Batch ${Math.floor(i / batchSize) + 1} processed. Total successful: ${successCount}, Failed: ${errorCount}`);
      await delay(100); // Small delay between batches
    }

    console.log('Migration complete.');
    console.log(`Successfully processed: ${successCount}`);
    console.log(`Failed/Skipped: ${errorCount}`);

  } catch (error) {
    console.error('An unexpected error occurred during migration:', error);
  }
}

migrateCanadaGeoJson();