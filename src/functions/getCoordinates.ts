import { supabase } from "@/integrations/supabase/client";

export interface GeocodeResult {
  lat: number | null;
  lng: number | null;
  zipCode: string | null;
  // ISO-3166-1 alpha-2 lowercase from OpenCage (e.g. "us", "ca").
  // Null when the geocode succeeded but the provider didn't include
  // a country code, or when geocoding failed entirely. Public
  // locator uses it to auto-flip between USA/Canada modes without
  // exposing a country toggle to end users.
  countryCode: string | null;
}

// Geocodes a search string (zip code or freeform address) by invoking the
// `geocode-address` Supabase edge function. The OpenCage API key lives only
// in Supabase secrets and is never sent to the browser.
export async function run({ searchText }: { searchText: string }): Promise<GeocodeResult> {
  try {
    const { data, error } = await supabase.functions.invoke('geocode-address', {
      body: { searchText },
    });

    if (error) {
      console.error("Error invoking geocode-address:", error);
      return { lat: null, lng: null, zipCode: null, countryCode: null };
    }

    if (!data || data.lat === null || data.lat === undefined) {
      return { lat: null, lng: null, zipCode: null, countryCode: null };
    }

    return {
      lat: data.lat,
      lng: data.lng,
      zipCode: data.zipCode ?? null,
      countryCode: typeof data.countryCode === 'string' ? data.countryCode : null,
    };
  } catch (error) {
    console.error("Error fetching coordinates:", error);
    return { lat: null, lng: null, zipCode: null, countryCode: null };
  }
}
