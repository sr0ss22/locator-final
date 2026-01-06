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

    console.log(`[save-public-territory-data] Processing batch for installer: ${installerId}`);
    console.log(`[save-public-territory-data] Payload stats - Added: ${addedZips.length}, Updated: ${updatedZips.length}, Removed: ${removedZips.length}`);

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

    // Authorization
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
      console.warn(`[save-public-territory-data] Unauthorized attempt for installer: ${installerId}`);
      return new Response(JSON.stringify({ error: 'Unauthorized.' }), { headers: corsHeaders, status: 401 });
    }

    // Robustly handle removedZips. It can be a simple array of strings OR an array of objects.
    // The database RPC 'batch_process_territory_changes' expects a JSONB array.
    // We will normalize it to the most robust format the SQL expects.
    const normalizedRemoved = Array.isArray(removedZips) ? removedZips.map(item => {
      if (typeof item === 'string') return { zip_code: item };
      if (typeof item === 'object' && item !== null) {
        return { zip_code: item.zip_code || item.zipCode || item.zip };
      }
      return null;
    }).filter(Boolean) : [];

    // Process the provided batch immediately via the high-performance RPC
    const { error: rpcError } = await supabaseAdmin.rpc('batch_process_territory_changes', {
      p_installer_id: installerId,
      p_removed_zips: normalizedRemoved, 
      p_updated_zips: updatedZips,
      p_added_zips: addedZips,
    });

    if (rpcError) {
        console.error(`[save-public-territory-data] RPC Error:`, rpcError);
        throw rpcError;
    }

    console.log(`[save-public-territory-data] Success for installer: ${installerId}`);
    return new Response(JSON.stringify({ status: 'success' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('[save-public-territory-data] Internal Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})