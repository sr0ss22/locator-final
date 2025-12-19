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
    const { country, zoom, bounds, center, radius, getCount, pageSize, pageNumber } = await req.json()

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Handle count request for Canada radius search
    if (country === 'Canada' && getCount && center?.lat && center?.lng && radius) {
      const { data, error } = await supabaseAdmin.rpc('get_canadian_points_in_radius_count', {
        center_lat: center.lat,
        center_lng: center.lng,
        radius_meters: radius,
      });

      if (error) {
        console.error('RPC Count Error:', error);
        throw new Error(error.message);
      }

      return new Response(JSON.stringify({ count: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Handle main data request
    if (!country || zoom === undefined || !bounds) {
      return new Response(JSON.stringify({ error: 'Missing required parameters: country, zoom, bounds' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }
    
    const { _northEast, _southWest } = bounds;
    let rpcName = '';
    let params: any = {
      zoom: zoom,
      min_lon: _southWest.lng,
      min_lat: _southWest.lat,
      max_lon: _northEast.lng,
      max_lat: _northEast.lat,
    };

    if (country === 'Canada') {
      rpcName = 'get_clustered_canadian_map_data';
      
      if (center && center.lat && center.lng && radius) {
        params.center_lat = center.lat;
        params.center_lng = center.lng;
        params.radius_meters = radius;
        params.page_size = pageSize || 1000;
        params.page_number = pageNumber || 1;
      }
    } else {
      // Placeholder for US or other countries
      return new Response(JSON.stringify({ data: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const { data, error } = await supabaseAdmin.rpc(rpcName, params);

    if (error) {
      console.error('RPC Data Error:', error);
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