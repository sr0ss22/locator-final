import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

const DebugPostalCodeChecker = () => {
  const [postalCode, setPostalCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = async () => {
    if (!postalCode) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('canadian_postal_codes')
        .select('*')
        .like('POSTAL_CODE', `${postalCode.toUpperCase()}%`);

      if (error) {
        throw error;
      }

      if (data && data.length > 0) {
        setResult(data);
      } else {
        setError('No records found for this postal code.');
      }
    } catch (e: any) {
      setError(`An error occurred: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mt-6 border-yellow-500">
      <CardHeader>
        <CardTitle className="text-lg text-yellow-700">Debug: Postal Code Checker</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600 mb-4">
          Enter a full Canadian Postal Code or the first 3 characters (FSA) to check if it exists in the database and has valid geography data.
        </p>
        <div className="flex items-center gap-2">
          <Input
            placeholder="e.g., T0M 0N0 or T0M"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleCheck()}
          />
          <Button onClick={handleCheck} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check'}
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {result && (
          <div className="mt-4 space-y-2">
            <h4 className="font-semibold">{result.length} Record(s) Found:</h4>
            <pre className="bg-gray-100 p-2 rounded-md text-xs overflow-auto max-h-60">
              {JSON.stringify(result, null, 2)}
            </pre>
            <p className="text-xs text-gray-500">
              Check if the `geog` field has a value. If it's `null`, the point won't appear on the map.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DebugPostalCodeChecker;