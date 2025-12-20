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

    if (!installerId || !Array.isArray(zipCodes)) {
      return new Response(JSON.stringify({ error: 'Installer ID and a zipCodes array are required.' }), {
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
      // Authenticate with JWT for logged-in users
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
          isAuthorized = true; // Admin can edit any installer
        } else if (profile?.role === 'installer') {
          const { data: installerProfile } = await supabaseAdmin
            .from('installers')
            .select('id')
            .eq('account_id', user.id)
            .single();
          if (installerProfile?.id === installerId) {
            isAuthorized = true; // Installer can edit their own profile
          }
        }
      }
    } else if (token) {
      // Authenticate with token for public editor links
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

    // 1. Delete ALL existing territories for this installer in a single, efficient operation.
    const { error: deleteError } = await supabaseAdmin
      .from('installer_zip_codes')
      .delete()
      .eq('installer_id', installerId);

    if (deleteError) {
      throw new Error(`Failed to delete existing territories: ${deleteError.message}`);
    }

    // 2. If the incoming zipCodes array is not empty, insert the new territories in batches.
    if (zipCodes.length > 0) {
        const zipsToInsert = zipCodes.map((item: any) => ({
            installer_id: installerId,
            zip_code: item.zipCode,
            state_province: item.stateProvince,
            status: item.assignedStatus,
        }));

        const INSERT_CHUNK_SIZE = 500;
        for (let i = 0; i < zipsToInsert.length; i += INSERT_CHUNK_SIZE) {
            const chunk = zipsToInsert.slice(i, i + INSERT_CHUNK_SIZE);
            const { error: insertError } = await supabaseAdmin
                .from('installer_zip_codes')
                .insert(chunk);
            if (insertError) {
                throw new Error(`Failed to insert territories (chunk ${Math.floor(i / INSERT_CHUNK_SIZE) + 1}): ${insertError.message}`);
            }
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