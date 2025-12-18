import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parse } from 'https://deno.land/std@0.177.0/csv/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const csvContent = await req.text();

    if (!csvContent) {
      return new Response(JSON.stringify({ error: 'No CSV content provided.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Truncate the table to ensure no duplicates
    const { error: truncateError } = await supabaseAdmin
      .from('canadian_postal_codes')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // A safe way to delete all rows

    if (truncateError) {
      throw new Error(`Failed to clear table: ${truncateError.message}`);
    }

    // 2. Parse the CSV content
    const records = parse(csvContent, {
      skipFirstRow: true,
      columns: ["POSTAL_CODE", "CITY", "PROVINCE_ABBR", "TIME_ZONE", "LATITUDE", "LONGITUDE"],
    });

    const dataToInsert = records.map((row: any) => ({
      "POSTAL_CODE": row.POSTAL_CODE,
      "CITY": row.CITY,
      "PROVINCE_ABBR": row.PROVINCE_ABBR,
      "TIME_ZONE": row.TIME_ZONE,
      "LATITUDE": parseFloat(row.LATITUDE),
      "LONGITUDE": parseFloat(row.LONGITUDE),
    })).filter(row => !isNaN(row.LATITUDE) && !isNaN(row.LONGITUDE));

    // 3. Insert data in batches
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

    return new Response(JSON.stringify({ message: `Successfully imported ${dataToInsert.length} records.` }), {
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