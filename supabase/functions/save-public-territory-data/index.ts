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

    if (!installerId || !token || !Array.isArray(zipCodes)) {
      return new Response(JSON.stringify({ error: 'Installer ID, token, and a zipCodes array are required.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Validate token
    const { data: installer, error: installerError } = await supabaseAdmin
      .from('installers')
      .select('id, territory_access_token')
      .eq('id', installerId)
      .single()

    if (installerError || !installer || installer.territory_access_token !== token) {
      return new Response(JSON.stringify({ error: 'Invalid installer ID or token.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    // 1. Get current territories from DB
    const { data: currentZipsData, error: fetchError } = await supabaseAdmin
      .from('installer_zip_codes')
      .select('zip_code')
      .eq('installer_id', installerId);

    if (fetchError) {
      throw new Error(`Failed to fetch current territories: ${fetchError.message}`);
    }

    const currentZipSet = new Set((currentZipsData || []).map(z => z.zip_code));
    const finalZipSet = new Set(zipCodes.map((z: any) => z.zipCode));

    // 2. Determine which zips to delete
    const zipsToDelete = Array.from(currentZipSet).filter(zip => !finalZipSet.has(zip));

    // 3. Determine which zips to upsert (all final zips)
    const zipsToUpsert = zipCodes.map((item: any) => ({
      installer_id: installerId,
      zip_code: item.zipCode,
      state_province: item.stateProvince,
      status: item.assignedStatus,
    }));

    // 4. Perform DELETE operation for removed territories
    if (zipsToDelete.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from('installer_zip_codes')
        .delete()
        .eq('installer_id', installerId)
        .in('zip_code', zipsToDelete);

      if (deleteError) {
        throw new Error(`Failed to delete territories: ${deleteError.message}`);
      }
    }

    // 5. Perform UPSERT operation for added or modified territories
    if (zipsToUpsert.length > 0) {
      const { error: upsertError } = await supabaseAdmin
        .from('installer_zip_codes')
        .upsert(zipsToUpsert, { onConflict: 'installer_id,zip_code' });

      if (upsertError) {
        throw new Error(`Failed to upsert territories: ${upsertError.message}`);
      }
    } else if (zipsToDelete.length > 0) {
      // This is a valid case where all territories are removed.
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