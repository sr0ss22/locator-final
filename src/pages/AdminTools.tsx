import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Progress } from "@/components/ui/progress";
import stateUpdateData from '@/data/georef-united-states-of-america-zc-point@public.json' with { type: 'json' };

const AdminToolsPage: React.FC = () => {
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState(0);
  const [enrichProgressMessage, setEnrichProgressMessage] = useState("");
  
  const [stateUpdateLoading, setStateUpdateLoading] = useState(false);
  const [stateUpdateProgress, setStateUpdateProgress] = useState(0);
  const [stateUpdateProgressMessage, setStateUpdateProgressMessage] = useState("");

  const navigate = useNavigate();

  const handleEnrichZips = async () => {
    setEnrichLoading(true);
    setEnrichProgress(0);
    setEnrichProgressMessage("Fetching list of ZIP codes to enrich...");
    toast.info('Starting ZIP code enrichment process...');

    try {
      const { data: allZips, error: fetchError } = await supabase
        .from('zip_code_geometries')
        .select('zip_code, centroid_latitude, centroid_longitude, state_province')
        .or('state_province.eq.Unknown,state_province.is.null');

      if (fetchError) throw fetchError;

      if (!allZips || allZips.length === 0) {
        toast.success('No ZIP codes needed enrichment.');
        setEnrichProgressMessage("All ZIP codes are up to date.");
        setEnrichLoading(false);
        return;
      }
      
      const zipsToProcess = allZips.filter(zip => zip.zip_code && /^\d{5}$/.test(zip.zip_code));

      if (zipsToProcess.length === 0) {
        toast.success('No US ZIP codes needed enrichment.');
        setEnrichProgressMessage("All US ZIP codes are up to date.");
        setEnrichLoading(false);
        return;
      }

      const totalZips = zipsToProcess.length;
      setEnrichProgressMessage(`Found ${totalZips} US ZIP codes to process.`);

      const batchSize = 10;

      for (let i = 0; i < totalZips; i += batchSize) {
        const batch = zipsToProcess.slice(i, i + batchSize);
        const currentProgress = i + batch.length;
        setEnrichProgressMessage(`Processing batch ${Math.ceil(currentProgress / batchSize)} of ${Math.ceil(totalZips / batchSize)}... (${currentProgress}/${totalZips})`);
        
        const { error } = await supabase.functions.invoke('enrich-zip-codes', {
          body: { zipsToProcess: batch },
        });

        if (error) {
          let detailedError = error.message;
          if (error.context && typeof error.context.json === 'function') {
            try {
              const errorJson = await error.context.json();
              if (errorJson.error) detailedError = errorJson.error;
            } catch (e) {
              console.error("Could not parse JSON from function error response", e);
            }
          }
          throw new Error(`Error processing batch: ${detailedError}`);
        }
        
        setEnrichProgress((currentProgress / totalZips) * 100);
      }

      setEnrichProgress(100);
      setEnrichProgressMessage(`Enrichment complete. Processed ${totalZips} ZIP codes.`);
      toast.success('Enrichment process completed successfully!');

    } catch (error: any) {
      console.error('Error during enrichment process:', error);
      setEnrichProgressMessage(`Error: ${error.message}`);
      toast.error(`Enrichment failed: ${error.message}`);
    } finally {
      setEnrichLoading(false);
    }
  };

  const handleUpdateStates = async () => {
    setStateUpdateLoading(true);
    setStateUpdateProgress(0);
    setStateUpdateProgressMessage("Preparing to update state codes...");
    toast.info('Starting state code update process...');

    try {
      const updates = stateUpdateData.map((record: any) => ({
        zip_code: record.fields.zip_code,
        state_province: record.fields.stusps_code,
      })).filter(item => item.zip_code && item.state_province);

      if (updates.length === 0) {
        toast.info("No valid records found in the provided file.");
        setStateUpdateLoading(false);
        return;
      }

      const totalUpdates = updates.length;
      setStateUpdateProgressMessage(`Found ${totalUpdates} records to process.`);
      
      const batchSize = 500;
      for (let i = 0; i < totalUpdates; i += batchSize) {
        const batch = updates.slice(i, i + batchSize);
        const currentProgress = i + batch.length;
        setStateUpdateProgressMessage(`Processing batch ${Math.ceil(currentProgress / batchSize)} of ${Math.ceil(totalUpdates / batchSize)}... (${currentProgress}/${totalUpdates})`);

        const { error } = await supabase.functions.invoke('update-state-codes', {
          body: { updates: batch },
        });

        if (error) {
          let detailedError = error.message;
          if (error.context && typeof error.context.json === 'function') {
            try {
              const errorJson = await error.context.json();
              if (errorJson.error) detailedError = errorJson.error;
            } catch (e) {
              console.error("Could not parse JSON from function error response", e);
            }
          }
          throw new Error(`Error processing batch: ${detailedError}`);
        }

        setStateUpdateProgress((currentProgress / totalUpdates) * 100);
      }

      setStateUpdateProgress(100);
      setStateUpdateProgressMessage(`Update complete. Processed ${totalUpdates} records.`);
      toast.success('State code update completed successfully!');

    } catch (error: any) {
      console.error('Error during state update process:', error);
      setStateUpdateProgressMessage(`Error: ${error.message}`);
      toast.error(`State update failed: ${error.message}`);
    } finally {
      setStateUpdateLoading(false);
    }
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
            <CardTitle>Update State Codes from File</CardTitle>
            <CardDescription>
              Update the `state_province` for all US ZIP codes using the `georef-united-states-of-america-zc-point@public.json` file. This will process all records from the file in batches.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stateUpdateLoading && (
              <div className="space-y-2">
                <Progress value={stateUpdateProgress} className="w-full" />
                <p className="text-sm text-muted-foreground">{stateUpdateProgressMessage}</p>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button onClick={handleUpdateStates} disabled={stateUpdateLoading}>
              {stateUpdateLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Start State Update
            </Button>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Enrich ZIP Code Data</CardTitle>
            <CardDescription>
              This tool will scan US ZIP codes with missing state info and use a geocoding service to fill them in. This process can be slow due to API rate limits.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {enrichLoading && (
              <div className="space-y-2">
                <Progress value={enrichProgress} className="w-full" />
                <p className="text-sm text-muted-foreground">{enrichProgressMessage}</p>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button onClick={handleEnrichZips} disabled={enrichLoading}>
              {enrichLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Start Enrichment
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default AdminToolsPage;