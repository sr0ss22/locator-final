import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      toast.error("Please select the JSON data file first.");
      return;
    }

    setUpdateStateLoading(true);
    const loadingToastId = toast.loading('Uploading data file...');

    try {
      const filePath = `zip-data.json`;
      const { error: uploadError } = await supabase.storage
        .from('migrations')
        .upload(filePath, selectedFile, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Failed to upload file: ${uploadError.message}`);
      }
      toast.success('File uploaded successfully. Starting update process...', { id: loadingToastId });

      const { data, error: invokeError } = await supabase.functions.invoke('update-zip-state');

      if (invokeError) {
        throw invokeError;
      }

      toast.success(data.message || 'State codes updated successfully!', { id: loadingToastId });
    } catch (error: any) {
      console.error('Error during update process:', error);
      toast.error(`Update failed: ${error.message}`, { id: loadingToastId });
    } finally {
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
              Upload the `georef-united-states-of-america-zc-point@public.json` file to update the `state_province` for all US ZIP codes. This is a one-time operation to fix data inconsistencies.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="zip-file-upload">ZIP Code Data File (.json)</Label>
              <Input id="zip-file-upload" type="file" accept=".json" onChange={handleFileSelect} />
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