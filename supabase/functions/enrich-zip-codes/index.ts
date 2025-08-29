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
    const OPENCAGE_API_KEY = Deno.env.get('OPENCAGE_API_KEY');
    if (!OPENCAGE_API_KEY) {
      throw new Error('OPENCAGE_API_KEY is not set in Supabase secrets.');
    }

    // Create a Supabase client with the service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    // Fetch US zip codes that need enrichment (numeric zip codes)
    // where state is 'Unknown' or null.
    const { data: zips, error: fetchError } = await supabaseAdmin
      .from('zip_code_geometries')
      .select('zip_code, centroid_latitude, centroid_longitude, state_province')
      .or('state_province.eq.Unknown,state_province.is.null')
      .filter('zip_code', 'not.ilike', '%[A-Z]%'); // Exclude non-numeric (Canadian) postal codes

    if (fetchError) {
      throw fetchError
    }

    if (!zips || zips.length === 0) {
      return new Response(JSON.stringify({ message: 'No US zip codes to enrich.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const updates = [];

    for (const zip of zips) {
      if (zip.centroid_latitude && zip.centroid_longitude) {
        const url = `https://api.opencagedata.com/geocode/v1/json?q=${zip.centroid_latitude}+${zip.centroid_longitude}&key=${OPENCAGE_API_KEY}&no_annotations=1&language=en`;
        const response = await fetch(url);
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

    return new Response(JSON.stringify({ message: `Enrichment complete. Updated ${updates.length} of ${zips.length} zip codes.` }), {
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