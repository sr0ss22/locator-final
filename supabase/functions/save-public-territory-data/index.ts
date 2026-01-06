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
      return new Response(JSON.stringify({ error: 'Unauthorized.' }), { headers: corsHeaders, status: 401 });
    }

    console.log(`[save-public-territory-data] Bulk sync for ${installerId}. Add: ${addedZips.length}, Update: ${updatedZips.length}, Remove: ${removedZips.length}`);

    // CHUNKING LOGIC: Break the work into small, safe batches of 100
    const CHUNK_SIZE = 100;
    
    // Process removals in chunks
    for (let i = 0; i < removedZips.length; i += CHUNK_SIZE) {
      const chunk = removedZips.slice(i, i + CHUNK_SIZE);
      const { error } = await supabaseAdmin.rpc('batch_process_territory_changes', {
        p_installer_id: installerId,
        p_removed_zips: chunk,
        p_updated_zips: [],
        p_added_zips: [],
      });
      if (error) throw new Error(`Removal Chunk ${i}: ${error.message}`);
    }

    // Process updates in chunks
    for (let i = 0; i < updatedZips.length; i += CHUNK_SIZE) {
      const chunk = updatedZips.slice(i, i + CHUNK_SIZE);
      const { error } = await supabaseAdmin.rpc('batch_process_territory_changes', {
        p_installer_id: installerId,
        p_removed_zips: [],
        p_updated_zips: chunk,
        p_added_zips: [],
      });
      if (error) throw new Error(`Update Chunk ${i}: ${error.message}`);
    }

    // Process additions in chunks
    for (let i = 0; i < addedZips.length; i += CHUNK_SIZE) {
      const chunk = addedZips.slice(i, i + CHUNK_SIZE);
      const { error } = await supabaseAdmin.rpc('batch_process_territory_changes', {
        p_installer_id: installerId,
        p_removed_zips: [],
        p_updated_zips: [],
        p_added_zips: chunk,
      });
      if (error) throw new Error(`Addition Chunk ${i}: ${error.message}`);
    }

    return new Response(JSON.stringify({ status: 'success' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('[save-public-territory-data] Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})