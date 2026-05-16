import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * GeoJSON FeatureCollection of US zip polygons within `radiusMiles` of
 * `center`. Pulled from the SECURITY DEFINER
 * `get_public_zip_geometries_in_radius` RPC so anonymous public-locator
 * visitors can render the overlay without an API key.
 *
 * The RPC enforces a 5000-feature cap; the hook caches per
 * (lat,lng,radius) tuple so panning/zooming around the same search
 * doesn't refetch.
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
}

export function useUsZipGeometries({ enabled, center, radiusMiles }: UseUsZipGeometriesArgs) {
  return useQuery<ZipGeometryFeatureCollection>({
    queryKey: ["usZipGeometries", center.lat, center.lng, radiusMiles],
    enabled: enabled && center.lat != null && center.lng != null && radiusMiles > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_zip_geometries_in_radius", {
        p_lat: center.lat!,
        p_lng: center.lng!,
        // Match the aggregate RPC's 1.1x pad so polygon set ⊇ aggregate set.
        p_radius_miles: radiusMiles * 1.1,
      });
      if (error) throw error;
      return (data as ZipGeometryFeatureCollection) ?? { type: "FeatureCollection", features: [] };
    },
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });
}
