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

    // 1. Get the total count first
    const { data: count, error: countError } = await supabaseAdmin.rpc('get_canadian_points_in_radius_count', {
      center_lat,
      center_lng,
      radius_meters,
    });

    if (countError) {
      throw new Error(`Failed to get count of points: ${countError.message}`);
    }

    if (count === 0) {
      return new Response(JSON.stringify({ data: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // 2. Create parallel requests for all pages
    const PAGE_SIZE = 1000; // This is typically the max limit
    const totalPages = Math.ceil(count / PAGE_SIZE);
    const promises = [];

    for (let page = 0; page < totalPages; page++) {
      const promise = supabaseAdmin
        .rpc('get_canadian_fsa_in_radius', {
          center_lat,
          center_lng,
          radius_meters,
        })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      promises.push(promise);
    }

    // 3. Execute all requests in parallel
    const results = await Promise.all(promises);

    // 4. Combine results and check for errors
    let allPoints: any[] = [];
    for (const result of results) {
      if (result.error) {
        throw new Error(`Error fetching a page of results: ${result.error.message}`);
      }
      if (result.data) {
        allPoints = allPoints.concat(result.data);
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