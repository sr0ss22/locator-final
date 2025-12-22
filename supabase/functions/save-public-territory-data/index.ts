import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CHUNK_SIZE = 500; // Process up to 500 records at a time

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { installerId, token, addedZips, updatedZips, removedZips } = await req.json()

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

    // --- Authorization Logic ---
    const authHeader = req.headers.get('Authorization');
    let isAuthorized = false;

    if (authHeader) {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await supabaseClient.auth.getUser();

      if (user) {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        
        if (profile?.role === 'admin') {
          isAuthorized = true;
        } else if (profile?.role === 'installer') {
          const { data: installerProfile } = await supabaseAdmin
            .from('installers')
            .select('id')
            .eq('account_id', user.id)
            .single();
          if (installerProfile?.id === installerId) {
            isAuthorized = true;
          }
        }
      }
    } else if (token) {
      const { data: installer } = await supabaseAdmin
        .from('installers')
        .select('territory_access_token')
        .eq('id', installerId)
        .single();
      if (installer && installer.territory_access_token === token) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }
    // --- End Authorization Logic ---

    // Handle deletions in chunks
    if (removedZips && Array.isArray(removedZips) && removedZips.length > 0) {
      for (let i = 0; i < removedZips.length; i += CHUNK_SIZE) {
        const chunk = removedZips.slice(i, i + CHUNK_SIZE);
        const { error: deleteError } = await supabaseAdmin.rpc('batch_delete_specific_installer_territories', {
          p_installer_id: installerId,
          p_zip_codes: chunk.map(z => z.zipCode),
        });
        if (deleteError) throw new Error(`Failed to delete territories chunk: ${deleteError.message}`);
      }
    }

    // Handle updates in chunks
    if (updatedZips && Array.isArray(updatedZips) && updatedZips.length > 0) {
      for (let i = 0; i < updatedZips.length; i += CHUNK_SIZE) {
        const chunk = updatedZips.slice(i, i + CHUNK_SIZE);
        const { error: updateError } = await supabaseAdmin.rpc('batch_update_installer_territories', {
          p_installer_id: installerId,
          p_updates: chunk,
        });
        if (updateError) throw new Error(`Failed to update territories chunk: ${updateError.message}`);
      }
    }

    // Handle additions in chunks
    if (addedZips && Array.isArray(addedZips) && addedZips.length > 0) {
      for (let i = 0; i < addedZips.length; i += CHUNK_SIZE) {
        const chunk = addedZips.slice(i, i + CHUNK_SIZE);
        const { error: insertError } = await supabaseAdmin.rpc('batch_insert_installer_territories', {
          p_installer_id: installerId,
          territories: chunk,
        });
        if (insertError) throw new Error(`Failed to insert territories chunk: ${insertError.message}`);
      }
    }

    return new Response(JSON.stringify({ message: 'Territory changes saved successfully.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Edge function error:', error);
    const errorResponse = {
      message: error.message,
      stack: error.stack,
      details: (error as any).details,
      code: (error as any).code,
      hint: (error as any).hint,
    };
    return new Response(JSON.stringify({ error: 'Edge function failed.', details: errorResponse }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})