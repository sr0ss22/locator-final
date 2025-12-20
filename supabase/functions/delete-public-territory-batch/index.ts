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

    // --- Authorization Logic ---
    const { data: installer, error: installerError } = await supabaseAdmin
      .from('installers')
      .select('territory_access_token')
      .eq('id', installerId)
      .single()

    if (installerError || !installer || installer.territory_access_token !== token) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid installer ID or token.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }
    // --- End Authorization Logic ---

    // Call the batch delete RPC function once
    const { data: deletedCount, error: rpcError } = await supabaseAdmin.rpc('delete_territories_by_installer_batch', {
      _installer_id: installerId,
      batch_size: 500 // A safe, fixed batch size
    });

    if (rpcError) {
      throw new Error(`Database RPC error: ${rpcError.message}`);
    }

    return new Response(JSON.stringify({ deletedCount }), {
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