import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * GeoJSON FeatureCollection of US zip polygons backing the coverage
 * overlay. Pulled from the SECURITY DEFINER
 * `get_public_zip_geometries_in_radius` RPC so anonymous public-locator
 * visitors can render the overlay without an API key.
 *
 * Two modes:
 *   1. Targeted (preferred): caller passes `zipCodes` — the exact list
 *      coming back from the coverage aggregate. The RPC short-circuits
 *      and fetches only those polygons. This is what the overlay uses
 *      in steady state; it avoids the 5000-row cap that the radius
 *      mode falls back to.
 *   2. Radius-only fallback: when `zipCodes` is empty/undefined, the
 *      RPC returns every polygon within `radiusMiles * 1.1` of
 *      `center`, capped at 5000. Used as a safe bootstrap before the
 *      aggregate is ready (though the overlay actually waits, so this
 *      is mostly a defensive default).
 *
 * Cached per (lat,lng,radius,zipCodes) tuple so panning/zooming over
 * the same search doesn't refetch.
 */
export interface ZipGeometryFeature {
  type: "Feature";
  properties: {
    zip_code: string;
    state_province: string | null;
  };
  geometry: GeoJSON.Geometry;
}

export interface ZipGeometryFeatureCollection {
  type: "FeatureCollection";
  features: ZipGeometryFeature[];
}

interface UseUsZipGeometriesArgs {
  enabled: boolean;
  center: { lat: number | null; lng: number | null };
  radiusMiles: number;
  // Targeted zip list (from the aggregate response). When provided the
  // RPC ignores the radius args and fetches only those polygons.
  zipCodes?: string[] | null;
}

export function useUsZipGeometries({
  enabled,
  center,
  radiusMiles,
  zipCodes,
}: UseUsZipGeometriesArgs) {
  const hasZipList = !!(zipCodes && zipCodes.length > 0);
  // Sort + cap the cache-key shape so identical sets share a cache entry
  // regardless of ordering, and we don't blow the key length out on
  // very large aggregates (the RPC still receives the full list).
  const zipKey = hasZipList
    ? [...(zipCodes as string[])].sort().join(",").slice(0, 256) + `|${zipCodes!.length}`
    : null;
  return useQuery<ZipGeometryFeatureCollection>({
    queryKey: ["usZipGeometries", center.lat, center.lng, radiusMiles, zipKey],
    // Targeted mode: only needs zipCodes (lat/lng/radius unused server-side).
    // Radius mode: needs a valid center + radius.
    enabled: enabled && (hasZipList || (center.lat != null && center.lng != null && radiusMiles > 0)),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_zip_geometries_in_radius", {
        p_lat: center.lat ?? 0,
        p_lng: center.lng ?? 0,
        // Match the aggregate RPC's 1.1x pad so polygon set ⊇ aggregate set
        // (only relevant in the radius-fallback path).
        p_radius_miles: radiusMiles * 1.1,
        p_zip_codes: hasZipList ? zipCodes : null,
      });
      if (error) throw error;
      return (data as ZipGeometryFeatureCollection) ?? { type: "FeatureCollection", features: [] };
    },
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });
}
