import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

// This function proxies the OpenCage Geocoding API so the API key never ships
// in the browser bundle. JWT verification is enforced at the platform level
// (deploy WITHOUT --no-verify-jwt), so any caller — public or admin — must at
// minimum present a valid Supabase JWT (the anon key suffices for public
// users, since supabase-js attaches it automatically).
//
// Logs OpenCage's `rate.remaining` on every call so we can observe quota
// burn-down via the function logs and wire alerts later.

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('OPENCAGE_API_KEY');
    if (!apiKey) {
      console.error('[geocode-address] OPENCAGE_API_KEY is not set in environment.');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: geocoding key missing.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
      );
    }

    const { searchText } = await req.json();
    if (!searchText || typeof searchText !== 'string') {
      return new Response(
        JSON.stringify({ error: '`searchText` (string) is required.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    // If the searchText is purely numeric (likely a US zip), append ", USA"
    // for better OpenCage accuracy. Matches behavior of the prior client-side
    // function it's replacing.
    const query = /^\d+$/.test(searchText) ? `${searchText}, USA` : searchText;

    const url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(query)}&key=${apiKey}&countrycode=us,ca`;

    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[geocode-address] OpenCage HTTP ${response.status}: ${errorText}`);
      return new Response(
        JSON.stringify({ error: `Geocoding service error (HTTP ${response.status}).` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: response.status },
      );
    }

    const data = await response.json();

    if (data?.rate?.remaining !== undefined) {
      console.log(`[geocode-address] OpenCage quota remaining: ${data.rate.remaining}`);
    }

    if (!data.results || data.results.length === 0) {
      return new Response(
        JSON.stringify({ lat: null, lng: null, zipCode: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    const result = data.results[0];
    // `country_code` is OpenCage's ISO-3166-1 alpha-2 lowercase code
    // (e.g. "us", "ca"). Returned so the public locator can auto-
    // detect the country from the geocode result instead of asking
    // the end user to flip a US/CA toggle.
    const countryCode: string | null =
      typeof result.components?.country_code === 'string'
        ? String(result.components.country_code).toLowerCase()
        : null;
    const out = {
      lat: result.geometry.lat,
      lng: result.geometry.lng,
      zipCode: result.components.postcode || null,
      countryCode,
    };

    return new Response(JSON.stringify(out), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('[geocode-address] Edge function error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});
