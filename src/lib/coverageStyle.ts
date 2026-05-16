import type { PathOptions } from "leaflet";

/**
 * Per-zip / per-FSA coverage counts as returned by the
 * `get_zip_coverage_aggregate` Postgres RPC (see
 * supabase/migrations/0174_* and 0177_*).
 *
 * For US ZIPs each polygon IS one postal code, so the postal-code
 * counts are 0/1 and the classifier ignores them. For Canadian FSAs
 * (which contain dozens of postal codes each), the postal-code
 * counts paired with the FSA's total-postal count let us paint a
 * "partial coverage" pattern instead of a solid polygon when only
 * part of the FSA is covered.
 */
export interface CoverageCounts {
  free: number;
  paid: number;
}

export interface FsaCoverageCounts extends CoverageCounts {
  // Distinct postal codes inside the FSA that the matching-installer
  // set covers, split by status. Set by the Canada path of the RPC.
  freePostalCodes: number;
  paidPostalCodes: number;
  // Total postal codes that exist in this FSA across all of Canada.
  // Pulled from `useCanadianFsaPostalCounts` on the client; left
  // null until that lazy query resolves.
  totalPostalCodes: number | null;
}

/**
 * The coverage states the overlay paints. `all-*` and `mixed-*` mean
 * the area is FULLY covered (every postal code has an installer);
 * `partial-*` means only some of the postal codes are covered. The
 * latter only fires for Canadian FSAs — US ZIPs are atomic so they're
 * always one of the full-coverage states.
 */
export type CoverageState =
  | "all-free"
  | "all-paid"
  | "mixed-free-majority"
  | "mixed-paid-majority"
  | "partial-free"
  | "partial-paid"
  | "partial-mixed"
  | "none";

/**
 * Tiebreaker rule (per product spec): at exactly 50/50 free wins, so the
 * "free majority" pattern is used for any zip where free >= paid (and both
 * are non-zero). This favors the better customer experience.
 */
export function classifyCoverage({ free, paid }: CoverageCounts): CoverageState {
  if (free <= 0 && paid <= 0) return "none";
  if (paid <= 0) return "all-free";
  if (free <= 0) return "all-paid";
  return free >= paid ? "mixed-free-majority" : "mixed-paid-majority";
}

// Allow a 1% miss to absorb residual format quirks in canadian_postal_codes
// (the same tolerance TerritoryMap uses). 99% covered with all-uniform
// status reads as fully covered.
const FSA_FULL_COVERAGE_THRESHOLD = 0.99;

/**
 * Canada-only classifier. Takes both the installer-level counts (used
 * for the free-vs-paid distinction) AND the per-postal counts (used
 * for partial-vs-full distinction). When `totalPostalCodes` is null
 * we don't yet know how big the FSA is, so we fall back to the
 * cheaper installer-only classifier — same data the US path uses.
 */
export function classifyFsaCoverage({
  free,
  paid,
  freePostalCodes,
  paidPostalCodes,
  totalPostalCodes,
}: FsaCoverageCounts): CoverageState {
  if (free <= 0 && paid <= 0) return "none";
  if (totalPostalCodes == null || totalPostalCodes <= 0) {
    // Total not loaded yet — best-effort classify on installer counts
    // (matches TerritoryMap's optimistic-rendering approach).
    return classifyCoverage({ free, paid });
  }
  const assigned = freePostalCodes + paidPostalCodes;
  const ratio = assigned / totalPostalCodes;
  const isFullyCovered = ratio >= FSA_FULL_COVERAGE_THRESHOLD;
  const hasFree = freePostalCodes > 0;
  const hasPaid = paidPostalCodes > 0;
  if (isFullyCovered) {
    if (hasFree && hasPaid) return free >= paid ? "mixed-free-majority" : "mixed-paid-majority";
    return hasFree ? "all-free" : "all-paid";
  }
  if (hasFree && hasPaid) return "partial-mixed";
  return hasFree ? "partial-free" : "partial-paid";
}

// Color tokens kept in one place so the legend, patterns, and Leaflet
// styles can't drift. Picked to match the existing TerritoryMap palette
// (green = #16A34A / #166534, orange = #F97316 / #9A3412) but at the
// higher opacity the spec calls for ("very opaque").
export const COVERAGE_COLORS = {
  free: {
    fill: "#16A34A",
    stroke: "#166534",
  },
  paid: {
    fill: "#F97316",
    stroke: "#9A3412",
  },
} as const;

// Opacity tuned to be visible-at-a-glance without overwhelming the
// underlying basemap labels/roads. 15% is the product-tuned value; if
// you change this, also bump the matching values in
// CoverageFillPatternDefs and CoverageLegend so the striped variants
// and the legend swatches stay in sync.
const FILL_OPACITY = 0.15;
const STROKE_OPACITY = 0.35;

/**
 * SVG <pattern> ids referenced via fill="url(#...)" for mixed-/partial-
 * state polygons. Mounted once per overlay by
 * `<CoverageFillPatternDefs>`.
 */
export const COVERAGE_PATTERN_IDS = {
  freeMajority: "coverage-free-majority-stripes",
  paidMajority: "coverage-paid-majority-stripes",
  // Partial-coverage variants: white background + colored diagonal
  // stripes so the polygon clearly reads as "only some postal codes
  // here are covered" vs the solid "all covered" look.
  partialFree: "coverage-partial-free-stripes",
  partialPaid: "coverage-partial-paid-stripes",
  // Partial AND mixed status: green + orange stripes on white.
  partialMixed: "coverage-partial-mixed-stripes",
} as const;

/**
 * Map a coverage state to Leaflet PathOptions. `none` returns a fully
 * transparent style; the overlay layer skips rendering those features
 * entirely (cheaper than painting invisible polygons), so this branch
 * exists mostly for completeness / safety.
 */
export function styleForCoverageState(state: CoverageState): PathOptions {
  switch (state) {
    case "all-free":
      return {
        fillColor: COVERAGE_COLORS.free.fill,
        fillOpacity: FILL_OPACITY,
        color: COVERAGE_COLORS.free.stroke,
        weight: 1,
        opacity: STROKE_OPACITY,
      };
    case "all-paid":
      return {
        fillColor: COVERAGE_COLORS.paid.fill,
        fillOpacity: FILL_OPACITY,
        color: COVERAGE_COLORS.paid.stroke,
        weight: 1,
        opacity: STROKE_OPACITY,
      };
    case "mixed-free-majority":
      return {
        fillColor: `url(#${COVERAGE_PATTERN_IDS.freeMajority})`,
        // Pattern fills carry their own opacity in the <rect>/<line>; keep
        // the layer fillOpacity at 1 so we don't double-attenuate it.
        fillOpacity: 1,
        color: COVERAGE_COLORS.free.stroke,
        weight: 1,
        opacity: STROKE_OPACITY,
      };
    case "mixed-paid-majority":
      return {
        fillColor: `url(#${COVERAGE_PATTERN_IDS.paidMajority})`,
        fillOpacity: 1,
        color: COVERAGE_COLORS.paid.stroke,
        weight: 1,
        opacity: STROKE_OPACITY,
      };
    case "partial-free":
      return {
        fillColor: `url(#${COVERAGE_PATTERN_IDS.partialFree})`,
        fillOpacity: 1,
        color: COVERAGE_COLORS.free.stroke,
        weight: 1,
        opacity: STROKE_OPACITY,
      };
    case "partial-paid":
      return {
        fillColor: `url(#${COVERAGE_PATTERN_IDS.partialPaid})`,
        fillOpacity: 1,
        color: COVERAGE_COLORS.paid.stroke,
        weight: 1,
        opacity: STROKE_OPACITY,
      };
    case "partial-mixed":
      return {
        fillColor: `url(#${COVERAGE_PATTERN_IDS.partialMixed})`,
        fillOpacity: 1,
        color: COVERAGE_COLORS.paid.stroke,
        weight: 1,
        opacity: STROKE_OPACITY,
      };
    case "none":
      return {
        fillOpacity: 0,
        opacity: 0,
        weight: 0,
      };
  }
}

export function styleForCoverage(counts: CoverageCounts): PathOptions {
  return styleForCoverageState(classifyCoverage(counts));
}
