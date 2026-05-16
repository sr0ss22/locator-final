import React from "react";
import { COVERAGE_COLORS, COVERAGE_PATTERN_IDS } from "@/lib/coverageStyle";

/**
 * Hidden SVG <defs> mounted once per CoverageOverlay. Browsers resolve
 * `fill="url(#id)"` against any <defs> in the same document, so the
 * Leaflet SVG renderer can reference these patterns even though they live
 * in a separate inline SVG. Mirrors the FsaFillPatternDefs pattern in
 * TerritoryMap.tsx but with a clearer "majority + minority diagonal"
 * encoding for the public-facing overlay.
 *
 * Pattern recipe:
 *   * Solid base of the majority color at very-opaque alpha.
 *   * A second diagonal line in the minority color so the polygon still
 *     reads as the majority status at a glance, but conveys "we have some
 *     of the other kind too".
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
      <pattern
        id={COVERAGE_PATTERN_IDS.freeMajority}
        patternUnits="userSpaceOnUse"
        width="10"
        height="10"
        patternTransform="rotate(45)"
      >
        <rect width="10" height="10" fill={COVERAGE_COLORS.free.fill} fillOpacity={0.15} />
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="10"
          stroke={COVERAGE_COLORS.paid.fill}
          strokeWidth={3}
          strokeOpacity={0.25}
        />
      </pattern>
      <pattern
        id={COVERAGE_PATTERN_IDS.paidMajority}
        patternUnits="userSpaceOnUse"
        width="10"
        height="10"
        patternTransform="rotate(45)"
      >
        <rect width="10" height="10" fill={COVERAGE_COLORS.paid.fill} fillOpacity={0.15} />
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="10"
          stroke={COVERAGE_COLORS.free.fill}
          strokeWidth={3}
          strokeOpacity={0.25}
        />
      </pattern>

      {/* Partial-coverage variants: transparent base + colored
          diagonal stripes. Reads as "we're only here in some of this
          FSA's postal codes" vs the solid look of fully-covered ones.
          Stripe opacity is intentionally a hair higher than the
          full-coverage patterns so partial polygons stay legible
          against the basemap when they're surrounded by solid ones. */}
      <pattern
        id={COVERAGE_PATTERN_IDS.partialFree}
        patternUnits="userSpaceOnUse"
        width="10"
        height="10"
        patternTransform="rotate(45)"
      >
        <rect width="10" height="10" fill="#ffffff" fillOpacity={0.0} />
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="10"
          stroke={COVERAGE_COLORS.free.fill}
          strokeWidth={4}
          strokeOpacity={0.45}
        />
      </pattern>
      <pattern
        id={COVERAGE_PATTERN_IDS.partialPaid}
        patternUnits="userSpaceOnUse"
        width="10"
        height="10"
        patternTransform="rotate(45)"
      >
        <rect width="10" height="10" fill="#ffffff" fillOpacity={0.0} />
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="10"
          stroke={COVERAGE_COLORS.paid.fill}
          strokeWidth={4}
          strokeOpacity={0.45}
        />
      </pattern>
      <pattern
        id={COVERAGE_PATTERN_IDS.partialMixed}
        patternUnits="userSpaceOnUse"
        width="10"
        height="10"
        patternTransform="rotate(45)"
      >
        <rect width="10" height="10" fill="#ffffff" fillOpacity={0.0} />
        {/* Two stripes per cycle: green + orange, alternating, so the
            partial-AND-mixed case reads as both "partial" and
            "mixed status" at a glance. */}
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="10"
          stroke={COVERAGE_COLORS.free.fill}
          strokeWidth={3}
          strokeOpacity={0.45}
        />
        <line
          x1="5"
          y1="0"
          x2="5"
          y2="10"
          stroke={COVERAGE_COLORS.paid.fill}
          strokeWidth={3}
          strokeOpacity={0.45}
        />
      </pattern>
    </defs>
  </svg>
);
