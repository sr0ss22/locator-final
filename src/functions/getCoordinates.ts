import { supabase } from "@/integrations/supabase/client";

// Geocodes a search string (zip code or freeform address) by invoking the
// `geocode-address` Supabase edge function. The OpenCage API key lives only
// in Supabase secrets and is never sent to the browser.
export async function run({ searchText }: { searchText: string }): Promise<{
  lat: number | null;
  lng: number | null;
  zipCode: string | null;
}> {
  try {
    const { data, error } = await supabase.functions.invoke('geocode-address', {
      body: { searchText },
    });

    if (error) {
      console.error("Error invoking geocode-address:", error);
      return { lat: null, lng: null, zipCode: null };
    }

    if (!data || data.lat === null || data.lat === undefined) {
      return { lat: null, lng: null, zipCode: null };
    }

    return {
      lat: data.lat,
      lng: data.lng,
      zipCode: data.zipCode ?? null,
    };
  } catch (error) {
    console.error("Error fetching coordinates:", error);
    return { lat: null, lng: null, zipCode: null };
  }
}
