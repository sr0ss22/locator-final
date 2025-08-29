import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { updates } = await req.json();
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      throw new Error('An array of update objects must be provided.');
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    // Use upsert to update existing zip codes based on the zip_code primary key
    const { error } = await supabaseAdmin
      .from('zip_code_geometries')
      .upsert(updates, { onConflict: 'zip_code' });

    if (error) {
      console.error('Supabase upsert error:', error);
      throw error;
    }

    return new Response(JSON.stringify({ message: `Successfully processed ${updates.length} records.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Update state codes function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})