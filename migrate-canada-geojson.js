import 'dotenv/config'; // Load environment variables from .env
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import * as turf from '@turf/turf';
import proj4 from 'proj4'; // Import proj4

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

// Define the projection for EPSG:3857 (Web Mercator)
proj4.defs("EPSG:3857", "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs");
// Define the projection for EPSG:4326 (WGS84 Geographic)
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

// Helper to reproject a GeoJSON geometry object recursively
const reprojectGeoJSONGeometry = (geom: any, fromProj: string, toProj: string): any => {
  if (!geom || !geom.coordinates) return geom;

  const transformCoords = (coords: any[]): any[] => {
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      // This is a single coordinate pair [x, y]
      return proj4(fromProj, toProj, coords);
    }
    // This is an array of coordinates (e.g., LineString, Polygon ring, MultiPoint)
    // or an array of arrays of coordinates (e.g., MultiLineString, MultiPolygon)
    return coords.map(transformCoords);
  };

  // Deep copy the geometry to avoid modifying the original feature object
  const newGeom = JSON.parse(JSON.stringify(geom));
  newGeom.coordinates = transformCoords(newGeom.coordinates);
  return newGeom;
};

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

      // Reproject the entire geometry to WGS84 (EPSG:4326) before stringifying
      let reprojectedGeometry = null;
      if (geometry) {
        try {
          reprojectedGeometry = reprojectGeoJSONGeometry(geometry, "EPSG:3857", "EPSG:4326");
        } catch (e) {
          console.error("Error reprojecting Canadian geometry for FSA", fsa, ":", e);
          errorCount++;
          continue;
        }
      }

      // Calculate centroid from the *original* feature (EPSG:3857) and then transform it
      const centroid = turf.centroid(feature); // This centroid is in EPSG:3857
      const [projectedLng, projectedLat] = centroid.geometry.coordinates;
      const [geographicLng, geographicLat] = proj4("EPSG:3857", "EPSG:4326", [projectedLng, projectedLat]);

      const geometryJsonString = reprojectedGeometry ? JSON.stringify(reprojectedGeometry) : null;

      // Call the RPC function with the Canadian data and the new _is_canada flag
      const { error } = await supabase.rpc('upsert_zip_geometry', {
          _zip_code: fsa,
          _state_province: province,
          _geometry_geojson_string: geometryJsonString, // Now this is WGS84 GeoJSON string
          _centroid_latitude: geographicLat,
          _centroid_longitude: geographicLng,
          _is_canada: true, // Indicate that this is Canadian data
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