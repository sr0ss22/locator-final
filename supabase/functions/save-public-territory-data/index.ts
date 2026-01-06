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
    const { installerId, addedZips, updatedZips, removedZips } = payload;

    console.log(`[save-public-territory-data] Syncing changes for installer: ${installerId}`);
    console.log(`[save-public-territory-data] Added: ${addedZips?.length}, Updated: ${updatedZips?.length}, Removed: ${removedZips?.length}`);

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

    // Authorization: Verify the request is coming from an authenticated user or has a valid token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader && !payload.token) {
      return new Response(JSON.stringify({ error: 'Unauthorized.' }), { headers: corsHeaders, status: 401 });
    }

    // Call the database function
    const { error: rpcError } = await supabaseAdmin.rpc('batch_process_territory_changes', {
      p_installer_id: installerId,
      p_removed_zips: removedZips || [],
      p_updated_zips: updatedZips || [],
      p_added_zips: addedZips || [],
    });

    if (rpcError) {
      console.error(`[save-public-territory-data] Database Error:`, rpcError);
      throw new Error(`Database Error: ${rpcError.message}`);
    }

    return new Response(JSON.stringify({ message: 'Sync complete' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('[save-public-territory-data] Fatal Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})