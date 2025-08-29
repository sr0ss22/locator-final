import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Database } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AdminToolsPage: React.FC = () => {
  const [populateLoading, setPopulateLoading] = useState(false);
  const navigate = useNavigate();

  const handlePopulateFromApi = async () => {
    setPopulateLoading(true);
    const loadingToastId = toast.loading('Starting data population from API... This may take a few minutes.');

    try {
      const { data, error } = await supabase.functions.invoke('populate-zip-states-from-api');

      if (error) {
        let detailedError = error.message;
        // Try to get a more specific error message from the function's response
        if (error.context && typeof error.context.json === 'function') {
            try {
                const errorJson = await error.context.json();
                if (errorJson.error) detailedError = errorJson.error;
            } catch (e) {
                console.error("Could not parse JSON from function error response", e);
            }
        }
        throw new Error(detailedError);
      }

      toast.success(data.message || 'Data populated successfully!', { id: loadingToastId, duration: 8000 });
    } catch (error: any) {
      console.error('Error during API population process:', error);
      toast.error(`Population failed: ${error.message}`, { id: loadingToastId, duration: 8000 });
    } finally {
      setPopulateLoading(false);
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
            <CardTitle>Populate ZIP/State Data from API</CardTitle>
            <CardDescription>
              Fetch the latest ZIP code and state code data from the public OpenDataSoft API and update the database. This will overwrite existing state codes for matching ZIPs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              This process can take several minutes as it fetches and processes over 33,000 records. Please do not navigate away from the page while it's running.
            </p>
          </CardContent>
          <CardFooter>
            <Button onClick={handlePopulateFromApi} disabled={populateLoading}>
              {populateLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
              Start Population
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default AdminToolsPage;