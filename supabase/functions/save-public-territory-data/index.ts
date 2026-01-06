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
    const { installerId, token, addedZips = [], updatedZips = [], removedZips = [] } = payload;

    console.log("[save-public-territory-data] Received save request:", { 
      installerId, 
      addedCount: addedZips.length, 
      updatedCount: updatedZips.length, 
      removedCount: removedZips.length 
    });

    if (!installerId) {
      console.error("[save-public-territory-data] Error: Missing installerId");
      return new Response(JSON.stringify({ error: 'Installer ID is required.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Authorization logic
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
      console.warn("[save-public-territory-data] Unauthorized access attempt for installer:", installerId);
      return new Response(JSON.stringify({ error: 'Unauthorized.' }), { headers: corsHeaders, status: 401 });
    }

    // Call the high-performance RPC
    console.log("[save-public-territory-data] Executing batch_process_territory_changes...");
    const { error: rpcError } = await supabaseAdmin.rpc('batch_process_territory_changes', {
      p_installer_id: installerId,
      p_removed_zips: removedZips, 
      p_updated_zips: updatedZips,
      p_added_zips: addedZips,
    });

    if (rpcError) {
      console.error("[save-public-territory-data] RPC Error encountered:", rpcError);
      return new Response(JSON.stringify({ error: rpcError.message, details: rpcError.details }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    console.log("[save-public-territory-data] Successfully updated territories.");
    return new Response(JSON.stringify({ status: 'success' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('[save-public-territory-data] Unexpected system error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})