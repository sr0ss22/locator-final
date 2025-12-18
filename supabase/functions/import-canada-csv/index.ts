import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parse } from 'https://deno.land/std@0.190.0/csv/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { csvContent, importMode } = await req.json();

    if (!csvContent || !importMode) {
      return new Response(JSON.stringify({ error: 'CSV content and importMode are required.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse the CSV content first
    const records = parse(csvContent, {
      skipFirstRow: true,
      columns: ["POSTAL_CODE", "CITY", "PROVINCE_ABBR", "TIME_ZONE", "LATITUDE", "LONGITUDE"],
    });

    const parsedRecords = records.map((row: any) => ({
      "POSTAL_CODE": row.POSTAL_CODE,
      "CITY": row.CITY,
      "PROVINCE_ABBR": row.PROVINCE_ABBR,
      "TIME_ZONE": row.TIME_ZONE,
      "LATITUDE": parseFloat(row.LATITUDE),
      "LONGITUDE": parseFloat(row.LONGITUDE),
    })).filter(row => row.POSTAL_CODE && !isNaN(row.LATITUDE) && !isNaN(row.LONGITUDE));

    let dataToInsert = [];
    let message = "";

    if (importMode === 'overwrite') {
      // Truncate the table
      const { error: truncateError } = await supabaseAdmin
        .from('canadian_postal_codes')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (truncateError) {
        throw new Error(`Failed to clear table: ${truncateError.message}`);
      }
      dataToInsert = parsedRecords;
      message = `Successfully cleared table and imported ${dataToInsert.length} new records.`;

    } else { // Append mode
      // Fetch all existing postal codes
      const { data: existingCodesData, error: fetchError } = await supabaseAdmin
        .from('canadian_postal_codes')
        .select('POSTAL_CODE');

      if (fetchError) {
        throw new Error(`Failed to fetch existing postal codes: ${fetchError.message}`);
      }

      const existingCodes = new Set(existingCodesData.map(item => item.POSTAL_CODE));
      
      dataToInsert = parsedRecords.filter(row => !existingCodes.has(row.POSTAL_CODE));
      
      if (dataToInsert.length === 0) {
        return new Response(JSON.stringify({ message: `No new records to import. All ${parsedRecords.length} postal codes in the file already exist.` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
      }
      message = `Successfully imported ${dataToInsert.length} new records. ${parsedRecords.length - dataToInsert.length} duplicates were ignored.`;
    }

    // Insert data in batches
    const batchSize = 1000;
    for (let i = 0; i < dataToInsert.length; i += batchSize) {
      const batch = dataToInsert.slice(i, i + batchSize);
      const { error: insertError } = await supabaseAdmin
        .from('canadian_postal_codes')
        .insert(batch);

      if (insertError) {
        throw new Error(`Error inserting chunk: ${insertError.message}`);
      }
    }

    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});