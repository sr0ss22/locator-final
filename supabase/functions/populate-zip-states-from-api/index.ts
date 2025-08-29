import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_BASE_URL = "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/georef-united-states-of-america-zc-point@public/records";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    let allRecords: any[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    console.log("Starting to fetch data from OpenDataSoft API...");

    while (hasMore) {
      // Corrected the select parameter to include a space after the comma (%2C%20)
      const apiUrl = `${API_BASE_URL}?select=stusps_code%2C%20zip_code&limit=${limit}&offset=${offset}`;
      
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (!response.ok) {
        // Added more detailed error logging to see the response body
        const errorBody = await response.text();
        console.error(`API request failed with status ${response.status}. URL: ${apiUrl}. Body: ${errorBody}`);
        throw new Error(`API request failed with status ${response.status}`);
      }
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        allRecords = allRecords.concat(data.results);
        offset += data.results.length;
        console.log(`Fetched ${data.results.length} records. Total: ${allRecords.length}`);
      } else {
        hasMore = false;
      }
    }

    console.log(`Total records fetched: ${allRecords.length}. Preparing for database update.`);

    const updates = allRecords.map(record => ({
      zip_code: record.zip_code,
      state_province: record.stusps_code,
    })).filter(item => item.zip_code && item.state_province);

    if (updates.length === 0) {
      return new Response(JSON.stringify({ message: "No valid records found from the API to update." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const batchSize = 500;
    let successCount = 0;

    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      console.log(`Upserting batch ${Math.floor(i / batchSize) + 1}...`);
      const { error } = await supabaseAdmin
        .from('zip_code_geometries')
        .upsert(batch, { onConflict: 'zip_code' });

      if (error) {
        throw new Error(`Error processing batch: ${error.message}`);
      }
      successCount += batch.length;
    }

    return new Response(JSON.stringify({ message: `Data population complete. Successfully processed: ${successCount} records.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});