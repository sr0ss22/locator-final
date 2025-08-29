import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AdminToolsPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleEnrichZips = async () => {
    setLoading(true);
    const loadingToastId = toast.loading('Starting ZIP code enrichment process... This may take a while.');

    try {
      const { data, error } = await supabase.functions.invoke('enrich-zip-codes');

      if (error) {
        throw error;
      }

      toast.success(data.message || 'Enrichment process completed successfully!', { id: loadingToastId, duration: 10000 });
    } catch (error: any) {
      console.error('Error invoking enrich-zip-codes function:', error);
      toast.error(`Enrichment failed: ${error.message}`, { id: loadingToastId, duration: 10000 });
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