import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import jsonData from './georef-united-states-of-america-zc-point@public.json' assert { type: 'json' };

// Standard CORS headers for Supabase Edge Functions
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle the preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize the Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Prepare the data for upserting from the imported JSON file
    if (!Array.isArray(jsonData)) {
      throw new Error('Invalid JSON data format: Expected an array of records.');
    }

    const updates = jsonData.map((record: any) => ({
      zip_code: record.fields.zip_code,
      state_province: record.fields.stusps_code,
    })).filter(item => item.zip_code && item.state_province);

    if (updates.length === 0) {
      return new Response(JSON.stringify({ message: "No valid records to update." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Process in batches to avoid overwhelming the database
    const batchSize = 500;
    let successCount = 0;

    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      const { error } = await supabaseAdmin
        .from('zip_code_geometries')
        .upsert(batch, { onConflict: 'zip_code' });

      if (error) {
        throw new Error(`Error processing batch: ${error.message}`);
      }
      successCount += batch.length;
    }

    // Return a success response
    return new Response(JSON.stringify({ message: `State code migration complete. Successfully processed: ${successCount}` }), {
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