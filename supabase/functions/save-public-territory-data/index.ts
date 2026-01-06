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
    const body = await req.json();
    const { installerId, token, addedZips, updatedZips, removedZips } = body;

    console.log(`[save-public-territory-data] Processing changes for installer ${installerId}`);

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

    // Map removed zips to a flat array of strings for the RPC
    const removedZipCodes = (removedZips || []).map((z: any) => z.zip_code || z.zipCode);

    // Call the single RPC function
    const { error: rpcError } = await supabaseAdmin.rpc('batch_process_territory_changes', {
      p_installer_id: installerId,
      p_removed_zips: removedZipCodes,
      p_updated_zips: updatedZips || [],
      p_added_zips: addedZips || [],
    });

    if (rpcError) {
      console.error(`[save-public-territory-data] RPC Error:`, rpcError);
      throw new Error(`Database Error: ${rpcError.message}`);
    }

    return new Response(JSON.stringify({ message: 'Territory changes saved successfully.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('[save-public-territory-data] Edge function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})