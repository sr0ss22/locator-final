import type { PathOptions } from "leaflet";

/**
 * Per-zip / per-FSA coverage counts as returned by the
 * `get_zip_coverage_aggregate` Postgres RPC (see
 * supabase/migrations/0174_*).
 */
export interface CoverageCounts {
  free: number;
  paid: number;
}

/**
 * The five distinct coverage states the overlay paints. Used both by the
 * Leaflet style function and by the legend so they stay in lock-step.
 */
export type CoverageState =
  | "all-free"
  | "all-paid"
  | "mixed-free-majority"
  | "mixed-paid-majority"
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
 * SVG <pattern> ids referenced via fill="url(#...)" for mixed-state polygons.
 * Mounted once per overlay by `<CoverageFillPatternDefs>`.
 */
export const COVERAGE_PATTERN_IDS = {
  freeMajority: "coverage-free-majority-stripes",
  paidMajority: "coverage-paid-majority-stripes",
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
