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
    const { country, center, radius } = await req.json();

    if (country !== 'Canada' || !center || center.lat === undefined || center.lng === undefined || radius === undefined) {
      return new Response(JSON.stringify({ error: '`country`, `center` object with `lat` and `lng`, and `radius` are required.' }), {
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
      center_lat: center.lat,
      center_lng: center.lng,
      radius_meters: radius,
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

    // 2. Fetch all pages in controlled parallel chunks
    const PAGE_SIZE = 1000;
    const totalPages = Math.ceil(count / PAGE_SIZE);
    const CONCURRENCY_LIMIT = 10; // Process 10 pages in parallel at a time
    let allPoints: any[] = [];

    for (let i = 0; i < totalPages; i += CONCURRENCY_LIMIT) {
      const promises = [];
      const chunkEnd = Math.min(i + CONCURRENCY_LIMIT, totalPages);
      
      for (let j = i; j < chunkEnd; j++) {
        const page = j + 1;
        const promise = supabaseAdmin
          .rpc('get_all_canadian_points_in_radius', {
            center_lat: center.lat,
            center_lng: center.lng,
            radius_meters: radius,
            page_size: PAGE_SIZE,
            page_number: page,
          });
        promises.push(promise);
      }

      const results = await Promise.all(promises);

      for (const result of results) {
        if (result.error) {
          // Log the error but continue, so we get as much data as possible
          console.error(`Error fetching a page of results: ${result.error.message}`);
        }
        if (result.data) {
          allPoints = allPoints.concat(result.data);
        }
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