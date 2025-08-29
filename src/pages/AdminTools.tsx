import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Papa from 'papaparse';

const AdminToolsPage: React.FC = () => {
  const [updateStateLoading, setUpdateStateLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const navigate = useNavigate();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setSelectedFile(event.target.files[0]);
    } else {
      setSelectedFile(null);
    }
  };

  const handleUpdateStateCodes = async () => {
    if (!selectedFile) {
      toast.error("Please select the CSV data file first.");
      return;
    }

    setUpdateStateLoading(true);
    const loadingToastId = toast.loading('Parsing CSV file...');

    try {
      Papa.parse(selectedFile, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          toast.info(`CSV parsed. Found ${results.data.length} records. Starting update process...`, { id: loadingToastId });

          const updates = (results.data as any[])
            .map((record: any) => ({
              zip_code: record.zip_code,
              state_province: record.stusps_code,
            }))
            .filter(item => item.zip_code && item.state_province);

          if (updates.length === 0) {
            toast.error("No valid records with 'zip_code' and 'stusps_code' found in the file.", { id: loadingToastId });
            setUpdateStateLoading(false);
            return;
          }

          const batchSize = 500;
          let successCount = 0;
          let errorCount = 0;

          for (let i = 0; i < updates.length; i += batchSize) {
            const batch = updates.slice(i, i + batchSize);
            toast.info(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(updates.length / batchSize)}...`, { id: loadingToastId });

            const { error: invokeError } = await supabase.functions.invoke('update-zip-state', {
              body: { records: batch },
            });

            if (invokeError) {
              errorCount += batch.length;
              console.error(`Error processing batch ${i / batchSize + 1}:`, invokeError);
              // Stop on first error to avoid cascading failures
              throw new Error(`Error processing batch: ${invokeError.message}`);
            } else {
              successCount += batch.length;
            }
          }

          toast.success(`Update complete! Successfully processed: ${successCount}. Failed: ${errorCount}`, { id: loadingToastId });
          setUpdateStateLoading(false);
        },
        error: (error: any) => {
          console.error('CSV parsing error:', error);
          toast.error(`Failed to parse CSV file: ${error.message}`, { id: loadingToastId });
          setUpdateStateLoading(false);
        }
      });
    } catch (error: any) {
      console.error('Error during update process:', error);
      toast.error(`Update failed: ${error.message}`, { id: loadingToastId });
      setUpdateStateLoading(false);
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
              Upload a CSV file to update the `state_province` for all US ZIP codes. The CSV must contain headers: <code className="bg-gray-100 p-1 rounded">zip_code</code> and <code className="bg-gray-100 p-1 rounded">stusps_code</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="zip-file-upload">ZIP Code Data File (.csv)</Label>
              <Input id="zip-file-upload" type="file" accept=".csv" onChange={handleFileSelect} />
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleUpdateStateCodes} disabled={updateStateLoading || !selectedFile}>
              {updateStateLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Upload and Run Update
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default AdminToolsPage;