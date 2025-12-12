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
    const { installerId, token, zipCodes } = await req.json()

    if (!installerId || !token || !Array.isArray(zipCodes)) {
      return new Response(JSON.stringify({ error: 'Installer ID, token, and a zipCodes array are required.' }), {
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
      .select('id, territory_access_token')
      .eq('id', installerId)
      .single()

    if (installerError || !installer || installer.territory_access_token !== token) {
      return new Response(JSON.stringify({ error: 'Invalid installer ID or token.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    // Proceed with territory update
    // 1. Delete existing territories for this installer
    const { error: deleteError } = await supabaseAdmin
      .from('installer_zip_codes')
      .delete()
      .eq('installer_id', installerId)

    if (deleteError) {
      throw deleteError
    }

    // 2. Insert new territories if any
    if (zipCodes.length > 0) {
      const zipsToInsert = zipCodes.map((item: any) => ({
        installer_id: installerId,
        zip_code: item.zipCode,
        state_province: item.stateProvince,
        status: item.assignedStatus,
      }));

      const { error: insertError } = await supabaseAdmin
        .from('installer_zip_codes')
        .insert(zipsToInsert)

      if (insertError) {
        throw insertError
      }
    }

    return new Response(JSON.stringify({ message: 'Territories updated successfully.' }), {
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