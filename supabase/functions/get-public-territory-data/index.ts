import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
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
    const { installerId, token } = await req.json()

    if (!installerId || !token) {
      return new Response(JSON.stringify({ error: 'Installer ID and token are required.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Validate token
    const { data: installer, error: installerError } = await supabaseAdmin
      .from('installers')
      .select('*, territory_access_token')
      .eq('id', installerId)
      .single()

    if (installerError || !installer || installer.territory_access_token !== token) {
      return new Response(JSON.stringify({ error: 'Invalid installer ID or token.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    // Fetch assigned zip codes
    const { data: zipCodes, error: zipError } = await supabaseAdmin
      .from('installer_zip_codes')
      .select('zip_code, status, state_province')
      .eq('installer_id', installerId)

    if (zipError) {
      throw zipError
    }
    
    // Explicitly map the status to a mileage tier so external apps don't have to guess
    const enrichedZipCodes = zipCodes.map((zip) => ({
      zip_code: zip.zip_code,
      status: zip.status,
      state_province: zip.state_province,
      mileage_tier: zip.status === 'Approved' ? 'Free_Mileage' : 'Paid_Mileage'
    }))

    // Don't send the token back to the client
    delete installer.territory_access_token;

    return new Response(JSON.stringify({ installer, zipCodes: enrichedZipCodes }), {
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