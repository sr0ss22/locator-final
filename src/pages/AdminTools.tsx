import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Database } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Progress } from '@/components/ui/progress';

// Import the local GeoJSON files
import usGeoJson from '@/data/us-zip-codes.json' with { type: 'json' };
import canadaGeoJson from '@/data/canada-postal-codes.json' with { type: 'json' };

// We need these for Canadian coordinate reprojection
import * as turf from '@turf/turf';
import proj4 from 'proj4';

// Define projections
proj4.defs("EPSG:3857", "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs");
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

const AdminToolsPage: React.FC = () => {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const navigate = useNavigate();

  const handleProcessGeoJson = async (country: 'USA' | 'Canada') => {
    setProcessing(true);
    setProgress(0);
    const loadingToastId = toast.loading(`Starting to process ${country} GeoJSON data... This may take a while.`);

    const isCanada = country === 'Canada';
    const geoJson = isCanada ? canadaGeoJson : usGeoJson;
    const features = geoJson.features;
    setTotal(features.length);

    const batchSize = 100;
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < features.length; i += batchSize) {
      const batch = features.slice(i, i + batchSize);
      
      const rpcCalls = batch.map(feature => {
        const { properties, geometry } = feature;
        const zipCode = isCanada ? properties.CFSAUID : properties.ZCTA5CE20;
        const stateProvince = isCanada ? properties.PRNAME : (properties.STUSPS || 'Unknown');
        
        let centroidLatitude: number | null = null;
        let centroidLongitude: number | null = null;

        if (isCanada) {
          const centroid = turf.centroid(feature);
          const [projectedLng, projectedLat] = centroid.geometry.coordinates;
          const [geographicLng, geographicLat] = proj4("EPSG:3857", "EPSG:4326", [projectedLng, projectedLat]);
          centroidLatitude = geographicLat;
          centroidLongitude = geographicLng;
        } else {
          centroidLatitude = parseFloat(properties.INTPTLAT20);
          centroidLongitude = parseFloat(properties.INTPTLON20);
        }

        const geometryJsonString = geometry ? JSON.stringify(geometry) : null;

        return supabase.rpc('upsert_zip_geometry', {
          _zip_code: zipCode,
          _state_province: stateProvince,
          _geometry_geojson_string: geometryJsonString,
          _centroid_latitude: isNaN(centroidLatitude!) ? null : centroidLatitude,
          _centroid_longitude: isNaN(centroidLongitude!) ? null : centroidLongitude,
          _is_canada: isCanada,
        });
      });

      const results = await Promise.allSettled(rpcCalls);

      results.forEach(result => {
        if (result.status === 'fulfilled' && !result.value.error) {
          successCount++;
        } else {
          errorCount++;
          console.error("Error in batch:", result.status === 'rejected' ? result.reason : result.value.error);
        }
      });

      setProgress(i + batch.length);
      toast.loading(`Processing ${country}... ${i + batch.length} of ${features.length}`, { id: loadingToastId });
    }

    toast.success(`Processing complete for ${country}. Success: ${successCount}, Failed: ${errorCount}`, { id: loadingToastId, duration: 8000 });
    setProcessing(false);
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="outline" size="sm" onClick={() => navigate("/installers")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold text-gray-700">Admin Tools</h1>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Populate Geometries from Local Files</CardTitle>
            <CardDescription>
              Process the local GeoJSON files (US and Canada) and upsert the data into your database. This runs in your browser.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              This process can take several minutes. Please keep this browser tab open until it completes.
            </p>
            {processing && (
              <div>
                <Progress value={(progress / total) * 100} className="w-full" />
                <p className="text-sm text-center mt-2">{progress} / {total} records processed</p>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex gap-4">
            <Button onClick={() => handleProcessGeoJson('USA')} disabled={processing}>
              {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
              Process US Data
            </Button>
            <Button onClick={() => handleProcessGeoJson('Canada')} disabled={processing}>
              {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
              Process Canada Data
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default AdminToolsPage;