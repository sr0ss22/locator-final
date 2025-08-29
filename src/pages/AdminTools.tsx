import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const AdminToolsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="outline" size="sm" onClick={() => navigate("/installers")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold text-gray-700">Admin Tools</h1>
      </div>
      <div className="grid gap-6 md:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Data Management</CardTitle>
            <CardDescription>
              Data migration and enrichment scripts can be run from the command line.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>There are currently no UI-based admin tools available.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminToolsPage;