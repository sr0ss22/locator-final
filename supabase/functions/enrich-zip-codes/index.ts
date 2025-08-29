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
    const { zipsToProcess } = await req.json();
    if (!zipsToProcess || !Array.isArray(zipsToProcess) || zipsToProcess.length === 0) {
      throw new Error('An array of zip code data must be provided in the request body.');
    }

    const OPENCAGE_API_KEY = Deno.env.get('OPENCAGE_API_KEY');
    if (!OPENCAGE_API_KEY) {
      throw new Error('OPENCAGE_API_KEY is not set in Supabase secrets.');
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    const updates = [];

    for (const zip of zipsToProcess) {
      if (zip.centroid_latitude && zip.centroid_longitude) {
        const url = `https://api.opencagedata.com/geocode/v1/json?q=${zip.centroid_latitude}+${zip.centroid_longitude}&key=${OPENCAGE_API_KEY}&no_annotations=1&language=en`;
        const response = await fetch(url);
        
        if (!response.ok) {
          console.warn(`OpenCage API returned status ${response.status} for ZIP ${zip.zip_code}`);
          continue; // Skip to the next zip code
        }

        const data = await response.json();

        if (data.results && data.results.length > 0) {
          const components = data.results[0].components;
          if (components.country_code && components.country_code.toLowerCase() === 'us' && components.state_code) {
            const stateAbbreviation = components.state_code.toUpperCase();
            if (stateAbbreviation !== zip.state_province) {
               updates.push({
                 zip_code: zip.zip_code,
                 state_province: stateAbbreviation,
               });
            }
          }
        }
      }
      // Delay to respect API rate limits (OpenCage free tier is 1/sec)
      await new Promise(resolve => setTimeout(resolve, 1100)); 
    }

    if (updates.length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('zip_code_geometries')
        .upsert(updates, { onConflict: 'zip_code' });

      if (updateError) {
        throw updateError;
      }
    }

    return new Response(JSON.stringify({ message: `Batch processed. Updated ${updates.length} zip codes.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Enrichment function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})