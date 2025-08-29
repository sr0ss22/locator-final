import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Progress } from "@/components/ui/progress";

const AdminToolsPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const navigate = useNavigate();

  const handleEnrichZips = async () => {
    setLoading(true);
    setProgress(0);
    setProgressMessage("Fetching list of ZIP codes to enrich...");
    toast.info('Starting ZIP code enrichment process...');

    try {
      // 1. Fetch all zips that need enrichment
      const { data: allZips, error: fetchError } = await supabase
        .from('zip_code_geometries')
        .select('zip_code, centroid_latitude, centroid_longitude, state_province')
        .or('state_province.eq.Unknown,state_province.is.null');

      if (fetchError) throw fetchError;

      if (!allZips || allZips.length === 0) {
        toast.success('No ZIP codes needed enrichment.');
        setProgressMessage("All ZIP codes are up to date.");
        setLoading(false);
        return;
      }
      
      // Filter for US zips in the client
      const zipsToProcess = allZips.filter(zip => zip.zip_code && /^\d{5}$/.test(zip.zip_code));

      if (zipsToProcess.length === 0) {
        toast.success('No US ZIP codes needed enrichment.');
        setProgressMessage("All US ZIP codes are up to date.");
        setLoading(false);
        return;
      }

      const totalZips = zipsToProcess.length;
      setProgressMessage(`Found ${totalZips} US ZIP codes to process.`);

      // 2. Process in batches
      const batchSize = 10;

      for (let i = 0; i < totalZips; i += batchSize) {
        const batch = zipsToProcess.slice(i, i + batchSize);
        const currentProgress = i + batch.length;
        setProgressMessage(`Processing batch ${Math.ceil(currentProgress / batchSize)} of ${Math.ceil(totalZips / batchSize)}... (${currentProgress}/${totalZips})`);
        
        const { data, error } = await supabase.functions.invoke('enrich-zip-codes', {
          body: { zipsToProcess: batch },
        });

        if (error) {
          let detailedError = error.message;
          // Attempt to parse a more specific error message from the function's response
          if (error.context && typeof error.context.json === 'function') {
            try {
              const errorJson = await error.context.json();
              if (errorJson.error) {
                detailedError = errorJson.error;
              }
            } catch (e) {
              // Ignore if parsing fails, stick with the original message
              console.error("Could not parse JSON from function error response", e);
            }
          }
          throw new Error(`Error processing batch: ${detailedError}`);
        }
        
        setProgress((currentProgress / totalZips) * 100);
      }

      setProgress(100);
      setProgressMessage(`Enrichment complete. Processed ${totalZips} ZIP codes.`);
      toast.success('Enrichment process completed successfully!');

    } catch (error: any) {
      console.error('Error during enrichment process:', error);
      setProgressMessage(`Error: ${error.message}`);
      toast.error(`Enrichment failed: ${error.message}`);
    } finally {
      setLoading(false);
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
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Enrich ZIP Code Data</CardTitle>
            <CardDescription>
              This tool will scan the US ZIP codes in the database and attempt to fill in missing state abbreviations using a reverse geocoding service. This is useful if the initial data import was missing state information. This process can take a long time depending on the number of ZIP codes that need updating.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="space-y-2">
                <Progress value={progress} className="w-full" />
                <p className="text-sm text-muted-foreground">{progressMessage}</p>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button onClick={handleEnrichZips} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Start Enrichment
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default AdminToolsPage;