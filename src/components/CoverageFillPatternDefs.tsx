import React from "react";
import {
  COVERAGE_COLORS,
  COVERAGE_PATTERN_IDS,
  PARTIAL_DENSITIES,
  DENSITY_STROKE_WIDTH,
  type PartialDensity,
} from "@/lib/coverageStyle";

/**
 * Hidden SVG <defs> mounted once per CoverageOverlay. Browsers resolve
 * `fill="url(#id)"` against any <defs> in the same document, so the
 * Leaflet SVG renderer can reference these patterns even though they
 * live in a separate inline SVG.
 *
 * Partial-coverage patterns come in four density buckets (5/10/15/20%)
 * so the stripe spacing visually encodes the coverage percentage:
 *   1–25%   → very sparse  (5%)
 *   26–50%  → sparse       (10%)
 *   51–74%  → medium       (15%)
 *   75–99%  → dense        (20%)
 * All use a 20-unit-wide pattern; strokeWidth = density/5 gives the
 * correct coverage ratio (e.g. strokeWidth=2 in width=20 → 10%).
 */
export const CoverageFillPatternDefs: React.FC = () => (
  <svg
    width="0"
    height="0"
    style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      {/* ── Fully-covered mixed patterns (unchanged) ─────────────── */}
      <pattern
        id={COVERAGE_PATTERN_IDS.freeMajority}
        patternUnits="userSpaceOnUse"
        width="10"
        height="10"
        patternTransform="rotate(45)"
      >
        <rect width="10" height="10" fill={COVERAGE_COLORS.free.fill} fillOpacity={0.15} />
        <line x1="0" y1="0" x2="0" y2="10"
          stroke={COVERAGE_COLORS.paid.fill} strokeWidth={3} strokeOpacity={0.25} />
      </pattern>
      <pattern
        id={COVERAGE_PATTERN_IDS.paidMajority}
        patternUnits="userSpaceOnUse"
        width="10"
        height="10"
        patternTransform="rotate(45)"
      >
        <rect width="10" height="10" fill={COVERAGE_COLORS.paid.fill} fillOpacity={0.15} />
        <line x1="0" y1="0" x2="0" y2="10"
          stroke={COVERAGE_COLORS.free.fill} strokeWidth={3} strokeOpacity={0.25} />
      </pattern>

      {/* ── Partial-coverage variants, one per density bucket ────── */}
      {PARTIAL_DENSITIES.map((d: PartialDensity) => {
        const sw = DENSITY_STROKE_WIDTH[d];
        return (
          <React.Fragment key={d}>
            {/* partial-free: transparent base + green diagonal */}
            <pattern
              id={COVERAGE_PATTERN_IDS.partialFree(d)}
              patternUnits="userSpaceOnUse"
              width="20"
              height="20"
              patternTransform="rotate(45)"
            >
              <rect width="20" height="20" fill="#ffffff" fillOpacity={0} />
              <line x1="0" y1="0" x2="0" y2="20"
                stroke={COVERAGE_COLORS.free.fill}
                strokeWidth={sw}
                strokeOpacity={0.55} />
            </pattern>

            {/* partial-paid: transparent base + orange diagonal */}
            <pattern
              id={COVERAGE_PATTERN_IDS.partialPaid(d)}
              patternUnits="userSpaceOnUse"
              width="20"
              height="20"
              patternTransform="rotate(45)"
            >
              <rect width="20" height="20" fill="#ffffff" fillOpacity={0} />
              <line x1="0" y1="0" x2="0" y2="20"
                stroke={COVERAGE_COLORS.paid.fill}
                strokeWidth={sw}
                strokeOpacity={0.55} />
            </pattern>

            {/* partial-mixed: transparent base + alternating green/orange */}
            <pattern
              id={COVERAGE_PATTERN_IDS.partialMixed(d)}
              patternUnits="userSpaceOnUse"
              width="20"
              height="20"
              patternTransform="rotate(45)"
            >
              <rect width="20" height="20" fill="#ffffff" fillOpacity={0} />
              <line x1="0" y1="0" x2="0" y2="20"
                stroke={COVERAGE_COLORS.free.fill}
                strokeWidth={sw}
                strokeOpacity={0.55} />
              <line x1="10" y1="0" x2="10" y2="20"
                stroke={COVERAGE_COLORS.paid.fill}
                strokeWidth={sw}
                strokeOpacity={0.55} />
            </pattern>
          </React.Fragment>
        );
      })}
    </defs>
  </svg>
);
