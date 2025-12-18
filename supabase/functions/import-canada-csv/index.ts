import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { records } = await req.json();

    if (!records || !Array.isArray(records)) {
      return new Response(JSON.stringify({ error: 'An array of records is required.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch existing postal codes from the incoming chunk to check for duplicates
    const incomingPostalCodes = records.map(r => r.POSTAL_CODE);
    const { data: existingCodesData, error: fetchError } = await supabaseAdmin
      .from('canadian_postal_codes')
      .select('POSTAL_CODE')
      .in('POSTAL_CODE', incomingPostalCodes);

    if (fetchError) {
      throw new Error(`Failed to check for existing postal codes: ${fetchError.message}`);
    }

    const existingCodes = new Set(existingCodesData.map(item => item.POSTAL_CODE));
    const dataToInsert = records.filter(row => !existingCodes.has(row.POSTAL_CODE));

    if (dataToInsert.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('canadian_postal_codes')
        .insert(dataToInsert);

      if (insertError) {
        throw new Error(`Error inserting records: ${insertError.message}`);
      }
    }

    return new Response(JSON.stringify({ 
      message: `Processed ${records.length} records. Inserted ${dataToInsert.length} new records.`,
      inserted: dataToInsert.length,
      duplicates: records.length - dataToInsert.length,
    }), {
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