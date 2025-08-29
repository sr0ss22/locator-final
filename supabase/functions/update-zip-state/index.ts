import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // 1. Get records from the request body
    const { records } = await req.json();

    if (!records || !Array.isArray(records) || records.length === 0) {
      throw new Error("No records provided in the request body.");
    }

    // 2. Upsert the batch of records
    const { error } = await supabaseAdmin
      .from('zip_code_geometries')
      .upsert(records, { onConflict: 'zip_code' });

    if (error) {
      throw new Error(`Error upserting batch: ${error.message}`);
    }

    // 3. Return a success response
    return new Response(JSON.stringify({ message: `Successfully processed ${records.length} records.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});