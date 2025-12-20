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

    // We need to paginate to get all results, as PostgREST has a default limit.
    const PAGE_SIZE = 1000;
    let allPoints: any[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabaseAdmin
        .rpc('get_canadian_fsa_in_radius', {
          center_lat,
          center_lng,
          radius_meters,
        })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) {
        throw error;
      }

      if (data) {
        allPoints = allPoints.concat(data);
      }

      if (!data || data.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return new Response(JSON.stringify({ data: allPoints }), {
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