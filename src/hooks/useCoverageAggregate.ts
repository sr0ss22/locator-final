import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  InstallerBrand,
  InstallerCertification,
  InstallerSkill,
} from "@/types/installer";
import type { CoverageCounts } from "@/lib/coverageStyle";

/**
 * One zip / FSA's coverage aggregate, as returned by the
 * `get_zip_coverage_aggregate` Postgres RPC.
 *
 * For US results `zip` is the 5-digit ZCTA. For Canada it's the 3-char
 * FSA prefix (uppercase, no spaces).
 */
export interface CoverageAggregateItem extends CoverageCounts {
  zip: string;
  state_province: string | null;
  centroid_lat: number;
  centroid_lng: number;
  // Distinct postal codes covered, split by status. For US ZIPs each
  // polygon IS one postal code so these are effectively 0/1 and the
  // overlay ignores them. For Canadian FSAs (which contain many
  // postal codes), these power the partial-coverage visualization.
  // Optional so the type is forward-compatible with any RPC version
  // that predates migration 0177.
  free_postal_codes?: number;
  paid_postal_codes?: number;
}

export interface CoverageAggregateResponse {
  country: "USA" | "Canada";
  items: CoverageAggregateItem[];
}

interface UseCoverageAggregateArgs {
  enabled: boolean;
  country: "USA" | "Canada";
  center: { lat: number | null; lng: number | null };
  radiusMiles: number;
  brands: InstallerBrand[];
  skills: InstallerSkill[];
  certifications: InstallerCertification[];
  acceptsShipments: boolean;
  // Restricts the aggregate to specific installers. Tri-state:
  //   * undefined / null → no installer restriction (return all
  //     matching installers — the legacy default).
  //   * []               → explicitly NO installers (returns an
  //     empty coverage set; useful when the visible list is empty).
  //   * ["a", "b"]       → only those installers.
  // Today the locator pages always pass a concrete array (either the
  // visible-pin list, or [singleId] for the per-card "View coverage"
  // icon) so the polygons match the pins; the null fallback is kept
  // for safety / future callers.
  installerIds?: string[] | null;
}

/**
 * Empty arrays (no filters applied) are normalized to `null` before being
 * sent to the RPC so the SQL takes the cheaper IS NULL fast-path instead
 * of evaluating a no-op AND for every installer.
 */
function nullIfEmpty<T extends string>(values: T[]): T[] | null {
  return values.length > 0 ? values : null;
}

export function useCoverageAggregate({
  enabled,
  country,
  center,
  radiusMiles,
  brands,
  skills,
  certifications,
  acceptsShipments,
  installerIds,
}: UseCoverageAggregateArgs) {
  // IMPORTANT: don't coerce [] → null here. The RPC treats them
  // differently (null = no restriction, [] = match nothing), and the
  // locator wants the latter when the visible installer list is
  // empty so the overlay clears instead of falling back to "all".
  const installerIdsPassthrough = installerIds === undefined ? null : installerIds;
  // Empty array yields a coverage hit-rate of zero — skip the network
  // round trip entirely and return an empty payload synchronously.
  const skipBecauseEmpty = Array.isArray(installerIdsPassthrough) && installerIdsPassthrough.length === 0;
  return useQuery<CoverageAggregateResponse>({
    queryKey: [
      "coverageAggregate",
      country,
      center.lat,
      center.lng,
      radiusMiles,
      [...brands].sort().join(","),
      [...skills].sort().join(","),
      [...certifications].sort().join(","),
      acceptsShipments,
      installerIdsPassthrough === null
        ? null
        : [...installerIdsPassthrough].sort().join(","),
    ],
    enabled:
      enabled &&
      center.lat != null &&
      center.lng != null &&
      radiusMiles > 0 &&
      !skipBecauseEmpty,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_zip_coverage_aggregate", {
        p_country: country,
        p_lat: center.lat!,
        p_lng: center.lng!,
        // Pad the lookup radius slightly so polygons whose centroid sits
        // just outside the user's search circle (but whose visible body
        // intersects it) still render in the overlay.
        p_radius_miles: radiusMiles * 1.1,
        p_brands: nullIfEmpty(brands),
        p_skills: nullIfEmpty(skills),
        p_certifications: nullIfEmpty(certifications),
        p_accepts_shipments: acceptsShipments ? true : null,
        p_installer_ids: installerIdsPassthrough,
      });
      if (error) throw error;
      return (data as CoverageAggregateResponse) ?? { country, items: [] };
    },
    placeholderData: skipBecauseEmpty ? { country, items: [] } : undefined,
    // Coverage data is comparatively static (driven by territory
    // assignments that rarely change mid-session); a generous stale time
    // keeps repeated zoom/pan from refetching.
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });
}
