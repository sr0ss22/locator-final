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

    // The duplicate check has been removed. All records from the chunk will be inserted.
    const dataToInsert = records;

    if (dataToInsert.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('canadian_postal_codes')
        .insert(dataToInsert);

      if (insertError) {
        throw new Error(`Error inserting records: ${insertError.message}`);
      }
    }

    return new Response(JSON.stringify({ 
      message: `Processed and inserted ${dataToInsert.length} new records.`,
      inserted: dataToInsert.length,
      duplicates: 0, // Duplicate check is removed, so this is now 0.
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