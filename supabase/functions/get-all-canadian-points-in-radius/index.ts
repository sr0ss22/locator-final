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
    const { center_lat, center_lng, radius_meters } = await req.json();

    if (center_lat === undefined || center_lng === undefined || radius_meters === undefined) {
      return new Response(JSON.stringify({ error: 'center_lat, center_lng, and radius_meters are required.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data, error } = await supabaseAdmin.rpc('get_all_canadian_points_in_radius_as_json', {
      center_lat,
      center_lng,
      radius_meters,
    });

    if (error) {
      throw new Error(`Failed to fetch points: ${error.message}`);
    }

    // The RPC returns a single JSON object which is the array of points.
    // If no points are found, it might return null.
    const points = data || [];

    return new Response(JSON.stringify({ data: points }), {
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