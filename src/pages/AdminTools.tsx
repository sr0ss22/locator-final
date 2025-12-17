import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Database, LogOut, MapPin, RefreshCw, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Papa from 'papaparse';

const AdminToolsPage: React.FC = () => {
  const [processingTerritories, setProcessingTerritories] = useState(false);
  const [processingStates, setProcessingStates] = useState(false);
  const [isImportingCanada, setIsImportingCanada] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [canadaCsvFile, setCanadaCsvFile] = useState<File | null>(null);
  const [radius, setRadius] = useState<number>(50);
  const navigate = useNavigate();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Logout failed: " + error.message);
    } else {
      toast.success("You have been logged out.");
      navigate('/login');
    }
  };

  const handleAssignTerritories = async () => {
    if (radius <= 0) {
      toast.error("Please enter a valid radius greater than 0.");
      return;
    }
    setProcessingTerritories(true);
    const loadingToastId = toast.loading(`Assigning territories for all US installers within a ${radius}-mile radius...`);
    
    const { data, error } = await supabase.rpc('assign_territories_for_all_us_installers', {
      radius_miles: radius
    });

    if (error) {
      console.error("Error assigning territories:", error);
      toast.error(`Failed to assign territories: ${error.message}`, { id: loadingToastId });
    } else {
      toast.success(data || "Territory assignment process completed.", { id: loadingToastId });
    }
    setProcessingTerritories(false);
  };

  const handleUpdateStates = async () => {
    setProcessingStates(true);
    const loadingToastId = toast.loading("Updating state/province for all territory records...");

    const { data, error } = await supabase.rpc('update_zip_code_states');

    if (error) {
      console.error("Error updating states:", error);
      toast.error(`Failed to update states: ${error.message}`, { id: loadingToastId });
    } else {
      toast.success(data || "State update process completed.", { id: loadingToastId });
    }
    setProcessingStates(false);
  };

  const handleCanadaImport = async () => {
    if (!canadaCsvFile) {
      toast.error("Please select the Canadian postal code CSV file.");
      return;
    }

    setIsImportingCanada(true);
    setImportProgress(0);
    const loadingToastId = toast.loading("Starting Canadian postal code import...");

    try {
      // 1. Clear the table first using the secure RPC call
      toast.info("Clearing existing Canadian postal code data...", { id: loadingToastId });
      const { error: truncateError } = await supabase.rpc('truncate_canadian_postal_codes');
      if (truncateError) throw new Error(`Failed to clear table: ${truncateError.message}`);

      // 2. Parse and upload in chunks
      let totalChunks = 0;
      let chunksProcessed = 0;

      Papa.parse(canadaCsvFile, {
        header: true,
        skipEmptyLines: true,
        chunkSize: 500, // Process 500 rows at a time
        chunk: async (results, parser) => {
          parser.pause(); // Pause parsing to wait for the upload
          totalChunks++;
          const chunkData = results.data.map((row: any) => ({
            "POSTAL_CODE": row.POSTAL_CODE,
            "CITY": row.CITY,
            "PROVINCE_ABBR": row.PROVINCE_ABBR,
            "TIME_ZONE": row.TIME_ZONE,
            "LATITUDE": parseFloat(row.LATITUDE),
            "LONGITUDE": parseFloat(row.LONGITUDE),
          })).filter(row => !isNaN(row.LATITUDE) && !isNaN(row.LONGITUDE));

          const { error } = await supabase.from('canadian_postal_codes').insert(chunkData);

          if (error) {
            parser.abort();
            throw new Error(`Error inserting chunk: ${error.message}`);
          }

          chunksProcessed++;
          const progress = Math.round((chunksProcessed / totalChunks) * 100);
          setImportProgress(progress);
          toast.info(`Processing... ${progress}% complete.`, { id: loadingToastId });
          parser.resume();
        },
        complete: () => {
          toast.success("Successfully imported all Canadian postal codes!", { id: loadingToastId });
          setIsImportingCanada(false);
        },
        error: (error) => {
          throw new Error(`CSV Parsing Error: ${error.message}`);
        }
      });

    } catch (err: any) {
      console.error("Import failed:", err);
      toast.error(`Import failed: ${err.message}`, { id: loadingToastId });
      setIsImportingCanada(false);
    }
  };

  const anyProcessRunning = processingTerritories || processingStates || isImportingCanada;

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate("/installers")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-gray-700">Admin Tools</h1>
        </div>
        <Button variant="outline" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" /> Log Out
        </Button>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        
        <Card>
          <CardHeader>
            <CardTitle>Import Canadian Postal Codes</CardTitle>
            <CardDescription>
              Upload the `CanadianPostalCodes202403.csv` file here. This tool will clear existing data and import the new file in chunks to prevent timeouts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="canada-csv">CSV File</Label>
              <Input 
                id="canada-csv" 
                type="file" 
                accept=".csv"
                onChange={(e) => setCanadaCsvFile(e.target.files ? e.target.files[0] : null)}
                disabled={anyProcessRunning}
              />
            </div>
            {isImportingCanada && <Progress value={importProgress} className="w-full" />}
          </CardContent>
          <CardFooter>
            <Button onClick={handleCanadaImport} disabled={anyProcessRunning || !canadaCsvFile}>
              {isImportingCanada ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Start Import
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assign Territories by Radius</CardTitle>
            <CardDescription>
              For every US installer with coordinates, assign all US ZIP codes within a specified radius. This can take a long time to run.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Label htmlFor="radius-input" className="whitespace-nowrap">Radius (miles):</Label>
              <Input 
                id="radius-input"
                type="number" 
                value={radius} 
                onChange={(e) => setRadius(Number(e.target.value))}
                min="1"
                disabled={anyProcessRunning}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleAssignTerritories} disabled={anyProcessRunning}>
              {processingTerritories ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2 h-4 w-4" />}
              Run Assignment
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Update Territory States</CardTitle>
            <CardDescription>
              Run a script to update the `state_province` field for all US territory assignments based on their ZIP code.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              This is useful for correcting any missing or incorrect state data in the `installer_zip_codes` table.
            </p>
          </CardContent>
          <CardFooter>
            <Button onClick={handleUpdateStates} disabled={anyProcessRunning}>
              {processingStates ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Update States
            </Button>
          </CardFooter>
        </Card>

      </div>
    </div>
  );
};

export default AdminToolsPage;