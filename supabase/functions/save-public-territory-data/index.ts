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
    const payload = await req.json();
    const { installerId, token, addedZips, updatedZips, removedZips } = payload;

    if (!installerId) {
      return new Response(JSON.stringify({ error: 'Installer ID is required.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Authorization: Validate via Auth Header (Internal) or Share Token (Public)
    const authHeader = req.headers.get('Authorization');
    let authorized = false;
    
    if (authHeader) {
      const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
      if (user) authorized = true;
    } else if (token) {
      const { data } = await supabaseAdmin.from('installers').select('territory_access_token').eq('id', installerId).single();
      if (data?.territory_access_token === token) authorized = true;
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized Access.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    console.log(`[save-public-territory-data] Syncing ${installerId}. Removals: ${removedZips?.length || 0}`);

    // Call the hyper-optimized database command
    const { error: rpcError } = await supabaseAdmin.rpc('batch_process_territory_changes', {
      p_installer_id: installerId,
      p_removed_zips: removedZips || [],
      p_updated_zips: updatedZips || [],
      p_added_zips: addedZips || [],
    });

    if (rpcError) {
      console.error(`[save-public-territory-data] RPC Error: ${rpcError.message}`);
      throw rpcError;
    }

    return new Response(JSON.stringify({ status: 'success' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('[save-public-territory-data] Fatal Exception:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})