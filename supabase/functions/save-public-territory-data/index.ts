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

    // 1. Get ALL current territories from DB using pagination
    let allCurrentZipsData: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: currentZipsData, error: fetchError } = await supabaseAdmin
        .from('installer_zip_codes')
        .select('zip_code')
        .eq('installer_id', installerId)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (fetchError) {
        throw new Error(`Failed to fetch current territories: ${fetchError.message}`);
      }

      if (currentZipsData) {
        allCurrentZipsData = allCurrentZipsData.concat(currentZipsData);
      }

      if (!currentZipsData || currentZipsData.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }

    const currentZipSet = new Set((allCurrentZipsData || []).map(z => z.zip_code));
    const finalZipSet = new Set(zipCodes.map((z: any) => z.zipCode));

    // If the final set is empty, we need to delete all existing territories for this installer.
    if (finalZipSet.size === 0 && currentZipSet.size > 0) {
      let hasMoreToDelete = true;
      const CHUNK_SIZE = 500; // Define chunk size for deletion
      while (hasMoreToDelete) {
        // Find a chunk of records to delete
        const { data: idsToDelete, error: fetchIdsError } = await supabaseAdmin
          .from('installer_zip_codes')
          .select('id')
          .eq('installer_id', installerId)
          .limit(CHUNK_SIZE);

        if (fetchIdsError) {
          throw new Error(`Failed to fetch territories for deletion: ${fetchIdsError.message}`);
        }

        if (idsToDelete && idsToDelete.length > 0) {
          const idList = idsToDelete.map(item => item.id);
          const { error: deleteError } = await supabaseAdmin
            .from('installer_zip_codes')
            .delete()
            .in('id', idList);

          if (deleteError) {
            throw new Error(`Failed to delete a chunk of territories: ${deleteError.message}`);
          }
        } else {
          // No more records to delete
          hasMoreToDelete = false;
        }
      }
    } else {
      // 2. Determine which zips to delete
      const zipsToDelete = Array.from(currentZipSet).filter(zip => !finalZipSet.has(zip));

      // 3. Determine which zips to upsert (all final zips)
      const zipsToUpsert = zipCodes.map((item: any) => ({
        installer_id: installerId,
        zip_code: item.zipCode,
        state_province: item.stateProvince,
        status: item.assignedStatus,
      }));

      const CHUNK_SIZE = 500;

      // 4. Perform DELETE operation for removed territories
      if (zipsToDelete.length > 0) {
        for (let i = 0; i < zipsToDelete.length; i += CHUNK_SIZE) {
          const chunk = zipsToDelete.slice(i, i + CHUNK_SIZE);
          const { error: deleteError } = await supabaseAdmin
            .from('installer_zip_codes')
            .delete()
            .eq('installer_id', installerId)
            .in('zip_code', chunk);

          if (deleteError) {
            throw new Error(`Failed to delete territories (chunk ${Math.floor(i / CHUNK_SIZE) + 1}): ${deleteError.message}`);
          }
        }
      }

      // 5. Perform UPSERT operation for added or modified territories
      if (zipsToUpsert.length > 0) {
        for (let i = 0; i < zipsToUpsert.length; i += CHUNK_SIZE) {
          const chunk = zipsToUpsert.slice(i, i + CHUNK_SIZE);
          const { error: upsertError } = await supabaseAdmin
            .from('installer_zip_codes')
            .upsert(chunk, { onConflict: 'installer_id,zip_code' });

          if (upsertError) {
            throw new Error(`Failed to upsert territories (chunk ${Math.floor(i / CHUNK_SIZE) + 1}): ${upsertError.message}`);
          }
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