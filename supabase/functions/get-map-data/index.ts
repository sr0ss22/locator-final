import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { country, zoom, bounds } = await req.json()
    const { _northEast, _southWest } = bounds;

    if (!country || zoom === undefined || !bounds) {
      return new Response(JSON.stringify({ error: 'Missing required parameters: country, zoom, bounds' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    let rpcName = '';
    if (country === 'Canada') {
      rpcName = 'get_clustered_canadian_map_data';
    } else {
      // Placeholder for a future US clustering function if needed
      // For now, we can assume US data is handled differently or doesn't need this level of clustering
      return new Response(JSON.stringify({ data: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const { data, error } = await supabaseAdmin.rpc(rpcName, {
      zoom: zoom,
      min_lon: _southWest.lng,
      min_lat: _southWest.lat,
      max_lon: _northEast.lng,
      max_lat: _northEast.lat,
    });

    if (error) {
      console.error('RPC Error:', error);
      throw new Error(error.message);
    }

    return new Response(JSON.stringify({ data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})