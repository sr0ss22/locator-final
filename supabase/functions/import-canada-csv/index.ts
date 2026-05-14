import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Require a valid admin JWT. Service-role mutations behind this function
    // can pollute reference data, so we gate it to authenticated admins only.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing bearer token.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const jwt = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid session.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      console.warn('[import-canada-csv] Non-admin access attempt by user:', userData.user.id);
      return new Response(JSON.stringify({ error: 'Forbidden: Admin role required.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    const { records } = await req.json();

    if (!records || !Array.isArray(records)) {
      return new Response(JSON.stringify({ error: 'An array of records is required.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const dataToInsert = records;

    if (dataToInsert.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('canadian_postal_codes')
        .insert(dataToInsert);

      if (insertError) {
        throw new Error(`Error inserting records: ${insertError.message}`);
      }
    }

    return new Response(JSON.stringify({ 
      message: `Processed and inserted ${dataToInsert.length} new records.`,
      inserted: dataToInsert.length,
      duplicates: 0,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
