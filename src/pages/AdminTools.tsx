import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Database, LogOut, MapPin, RefreshCw, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const AdminToolsPage: React.FC = () => {
  const [processingTerritories, setProcessingTerritories] = useState(false);
  const [processingStates, setProcessingStates] = useState(false);
  const [isImportingCanada, setIsImportingCanada] = useState(false);
  const [canadaCsvFile, setCanadaCsvFile] = useState<File | null>(null);
  const [canadaImportMode, setCanadaImportMode] = useState<'overwrite' | 'append'>('append');
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
    const loadingToastId = toast.loading(`Uploading and processing file in '${canadaImportMode}' mode... This may take several minutes.`);

    try {
      const fileContent = await canadaCsvFile.text();
      
      const { data, error } = await supabase.functions.invoke('import-canada-csv', {
        body: {
          csvContent: fileContent,
          importMode: canadaImportMode,
        },
      });

      if (error) {
        throw new Error(error.message);
      }
      
      if (data.error) {
        throw new Error(data.error);
      }

      toast.success(data.message || "Successfully imported Canadian postal codes!", { id: loadingToastId });

    } catch (err: any) {
      console.error("Import failed:", err);
      toast.error(`Import failed: ${err.message}`, { id: loadingToastId });
    } finally {
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
              Upload the `CanadianPostalCodes202403.csv` file. This process can take several minutes.
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
            <div>
              <Label>Import Mode</Label>
              <RadioGroup
                value={canadaImportMode}
                onValueChange={(value: 'overwrite' | 'append') => setCanadaImportMode(value)}
                className="mt-2 space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="append" id="append" />
                  <Label htmlFor="append">Append (ignore duplicates)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="overwrite" id="overwrite" />
                  <Label htmlFor="overwrite">Overwrite (replace all)</Label>
                </div>
              </RadioGroup>
            </div>
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