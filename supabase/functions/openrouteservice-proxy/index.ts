import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { locations } = await req.json()
    const OPENROUTESERVICE_API_KEY = Deno.env.get('OPENROUTESERVICE_API_KEY')

    if (!OPENROUTESERVICE_API_KEY) {
      console.error('OPENROUTESERVICE_API_KEY not set in environment variables.');
      return new Response(JSON.stringify({ error: 'Server configuration error: Missing API key.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    if (!locations || !Array.isArray(locations) || locations.length < 2) {
        return new Response(JSON.stringify({ error: 'Invalid "locations" payload. It must be an array with at least two coordinate pairs.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }

    const destinationsIndices = Array.from({ length: locations.length - 1 }, (_, i) => i + 1);

    const response = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', {
      method: 'POST',
      headers: {
        'Authorization': OPENROUTESERVICE_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
      },
      body: JSON.stringify({
        locations,
        sources: [0],
        destinations: destinationsIndices,
        metrics: ['distance'],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenRouteService API error: ${response.status} - ${errorText}`);
      return new Response(JSON.stringify({ error: `Failed to fetch data from routing service. Status: ${response.status}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: response.status,
      });
    }

    const data = await response.json()

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})