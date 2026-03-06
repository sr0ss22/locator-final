import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Get the API key from environment variables
    const requiredApiKey = Deno.env.get('EXTERNAL_API_KEY')
    if (!requiredApiKey) {
      console.error('[get-zip-geometries] Server configuration error: EXTERNAL_API_KEY is not set.');
      return new Response(JSON.stringify({ error: 'API key not configured on server.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    // 2. Check for Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn('[get-zip-geometries] Unauthorized: Missing or malformed Authorization header.');
      return new Response(JSON.stringify({ error: 'Unauthorized: API key is required.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    // 3. Validate the API key
    const providedApiKey = authHeader.split(' ')[1]
    if (providedApiKey !== requiredApiKey) {
      console.warn('[get-zip-geometries] Unauthorized: Invalid API key provided.');
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid API key.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    // 4. Get zip codes from the request body
    const { zip_codes } = await req.json()
    if (!zip_codes || !Array.isArray(zip_codes) || zip_codes.length === 0) {
      return new Response(JSON.stringify({ error: 'A JSON array of "zip_codes" is required in the request body.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // 5. Create a Supabase client with the service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 6. Query the database for the geometries
    const { data, error } = await supabaseAdmin
      .from('zip_code_geometries')
      .select('zip_code, state_province, geometry')
      .in('zip_code', zip_codes)

    if (error) {
      console.error('[get-zip-geometries] Database query error:', error);
      throw error;
    }

    // 7. Return the data
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('[get-zip-geometries] An unexpected error occurred:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})