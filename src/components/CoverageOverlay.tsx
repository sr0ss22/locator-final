import React, { useEffect, useMemo, useState } from "react";
import { GeoJSON, Pane, useMap } from "react-leaflet";
import L from "leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";

import { CoverageFillPatternDefs } from "@/components/CoverageFillPatternDefs";
import {
  classifyCoverage,
  type CoverageCounts,
  styleForCoverageState,
} from "@/lib/coverageStyle";
import {
  useCoverageAggregate,
  type CoverageAggregateItem,
} from "@/hooks/useCoverageAggregate";
import { useUsZipGeometries } from "@/hooks/useUsZipGeometries";
import { useCanadaFsaGeometries } from "@/hooks/useCanadaFsaGeometries";
import type {
  InstallerBrand,
  InstallerCertification,
  InstallerSkill,
} from "@/types/installer";

/**
 * CoverageOverlay paints zip-code (US) or FSA (Canada) polygons on top
 * of an existing react-leaflet `<MapContainer>` to show how much free vs
 * paid installer coverage exists in a given area.
 *
 * Render rules (per product spec):
 *   * All free       → solid green (very opaque)
 *   * All paid       → solid orange (very opaque)
 *   * Mixed, free≥paid → green base + orange diagonal stripes
 *   * Mixed, paid>free → orange base + green diagonal stripes
 *   * No coverage    → not rendered (transparent gap)
 *
 * The overlay only mounts at zoom >= MIN_ZOOM so we never try to paint
 * thousands of zip polygons at country-level zoom.
 *
 * For interactivity:
 *   * Hover always shows a Leaflet tooltip with zip + free/paid counts.
 *   * `onZipClick` is optional. When provided (internal locator), the
 *     polygon is interactive and forwards `(zip, counts)` on click. When
 *     omitted (public locator), polygons are pointer-transparent so they
 *     don't intercept marker clicks behind them.
 */

interface CoverageOverlayProps {
  country: "USA" | "Canada";
  center: { lat: number | null; lng: number | null };
  radiusMiles: number;
  brands: InstallerBrand[];
  skills: InstallerSkill[];
  certifications: InstallerCertification[];
  acceptsShipments: boolean;
  enabled: boolean;
  // When non-null/non-empty, restricts the aggregate to JUST these
  // installers. Powers the per-card "View coverage" mode on the
  // internal locator.
  installerIds?: string[] | null;
  onZipClick?: (zip: string, counts: CoverageCounts) => void;
  // Optional callback so the parent can surface a "loading coverage"
  // indicator next to its existing search/loading state.
  onLoadingChange?: (isLoading: boolean) => void;
}

// Below this zoom the overlay paints way too many polygons to be
// useful (and tanks the renderer at country-level zoom). Tuned to
// "regional" — roughly state-level for USA, province-level for Canada.
const MIN_ZOOM = 6;

// Custom Leaflet pane sits between the basemap tiles (zIndex 200) and
// the marker layer (zIndex 600) so coverage shows under installer
// pins.
const COVERAGE_PANE = "hdis-coverage-pane";
const COVERAGE_PANE_Z_INDEX = 380;

/** Helper: read the zip / FSA key off a US or CA feature. */
function getFeatureZip(feature: Feature, country: "USA" | "Canada"): string | null {
  if (!feature?.properties) return null;
  if (country === "USA") {
    const z = (feature.properties as any).zip_code;
    return typeof z === "string" ? z : null;
  }
  const fsa = (feature.properties as any).fsa;
  return typeof fsa === "string" ? fsa : null;
}

/**
 * Inner component that owns the live Leaflet hooks (useMap). Split out
 * so the parent can early-return based on `enabled` without violating
 * the rules of hooks.
 */
const CoverageOverlayInner: React.FC<CoverageOverlayProps> = ({
  country,
  center,
  radiusMiles,
  brands,
  skills,
  certifications,
  acceptsShipments,
  installerIds,
  onZipClick,
  onLoadingChange,
}) => {
  const map = useMap();
  const [zoom, setZoom] = useState<number>(map.getZoom());

  useEffect(() => {
    const update = () => setZoom(map.getZoom());
    map.on("zoomend", update);
    return () => {
      map.off("zoomend", update);
    };
  }, [map]);

  const aggregate = useCoverageAggregate({
    enabled: true,
    country,
    center,
    radiusMiles,
    brands,
    skills,
    certifications,
    acceptsShipments,
    installerIds,
  });

  // Feed the aggregate's zip list into the geometry RPC so it only
  // returns polygons we'll actually render. This bypasses the radius-
  // based 5000-row cap that was silently dropping outer ZIPs at large
  // radii (e.g. 500 miles from a central-US city), AND keeps the
  // payload tightly bounded by the number of populated ZIPs rather
  // than every ZIP inside the circle.
  const targetZipCodes = useMemo<string[] | null>(() => {
    if (country !== "USA") return null;
    if (!aggregate.data) return null;
    return aggregate.data.items.map((i) => i.zip);
  }, [country, aggregate.data]);

  const usGeo = useUsZipGeometries({
    enabled: country === "USA" && aggregate.data != null,
    center,
    radiusMiles,
    zipCodes: targetZipCodes,
  });

  const caGeo = useCanadaFsaGeometries({
    enabled: country === "Canada",
  });

  const isLoading =
    aggregate.isLoading ||
    (country === "USA" ? usGeo.isLoading : caGeo.isLoading);

  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  // Build a fast lookup of coverage counts keyed by zip / FSA so the
  // GeoJSON style/onEachFeature callbacks are O(1) per polygon.
  const coverageByZip = useMemo(() => {
    const lookup = new Map<string, CoverageAggregateItem>();
    if (!aggregate.data) return lookup;
    for (const item of aggregate.data.items) {
      lookup.set(item.zip, item);
    }
    return lookup;
  }, [aggregate.data]);

  // Drop polygons that have no coverage data so the overlay renders the
  // smallest possible feature set. The "no coverage" case is then a
  // visual gap, exactly what the spec asks for ("see through").
  const visibleGeoJson = useMemo<FeatureCollection<Geometry, any> | null>(() => {
    if (zoom < MIN_ZOOM) return null;
    if (coverageByZip.size === 0) return null;
    const source: FeatureCollection<Geometry, any> | null =
      country === "USA"
        ? (usGeo.data as FeatureCollection<Geometry, any> | undefined) ?? null
        : (caGeo.data as FeatureCollection<Geometry, any> | undefined) ?? null;
    if (!source) return null;
    const features = source.features.filter((f) => {
      const zip = getFeatureZip(f, country);
      return zip != null && coverageByZip.has(zip);
    });
    return { type: "FeatureCollection", features };
  }, [coverageByZip, country, usGeo.data, caGeo.data, zoom]);

  const interactive = typeof onZipClick === "function";

  // Force GeoJSON re-mount whenever the input feature set changes; the
  // react-leaflet GeoJSON layer otherwise caches the first batch of
  // features and ignores prop updates.
  const geoJsonKey = useMemo(() => {
    if (!visibleGeoJson) return "empty";
    return `${country}:${visibleGeoJson.features.length}:${[...coverageByZip.keys()].sort().join(",").slice(0, 200)}`;
  }, [visibleGeoJson, country, coverageByZip]);

  if (zoom < MIN_ZOOM || !visibleGeoJson || visibleGeoJson.features.length === 0) {
    return (
      <>
        <CoverageFillPatternDefs />
        <Pane name={COVERAGE_PANE} style={{ zIndex: COVERAGE_PANE_Z_INDEX }} />
      </>
    );
  }

  return (
    <>
      <CoverageFillPatternDefs />
      <Pane name={COVERAGE_PANE} style={{ zIndex: COVERAGE_PANE_Z_INDEX }}>
        <GeoJSON
          key={geoJsonKey}
          data={visibleGeoJson}
          interactive={interactive}
          style={(feature) => {
            const zip = feature ? getFeatureZip(feature, country) : null;
            const counts = zip ? coverageByZip.get(zip) : undefined;
            if (!counts) {
              return styleForCoverageState("none");
            }
            return styleForCoverageState(classifyCoverage(counts));
          }}
          onEachFeature={(feature, layer) => {
            const zip = getFeatureZip(feature, country);
            if (!zip) return;
            const counts = coverageByZip.get(zip);
            if (!counts) return;
            const total = counts.free + counts.paid;
            const label = country === "USA" ? `ZIP ${zip}` : `FSA ${zip}`;
            const tooltipHtml = `
              <div class="text-xs leading-snug">
                <div class="font-semibold mb-0.5">${label}</div>
                <div><span class="font-medium">${counts.free}</span> free · <span class="font-medium">${counts.paid}</span> paid</div>
                <div class="text-[10px] text-gray-500 mt-0.5">${total} installer${total === 1 ? "" : "s"}</div>
              </div>
            `;
            layer.bindTooltip(tooltipHtml, {
              sticky: true,
              direction: "top",
              opacity: 1,
              className: "hdis-coverage-tooltip",
            });
            if (interactive) {
              layer.on("click", () => {
                onZipClick?.(zip, { free: counts.free, paid: counts.paid });
              });
            }
            (layer as L.Path).on?.("mouseover", () => {
              (layer as L.Path).setStyle?.({ weight: 2 });
            });
            (layer as L.Path).on?.("mouseout", () => {
              (layer as L.Path).setStyle?.({ weight: 1 });
            });
          }}
        />
      </Pane>
    </>
  );
};

const CoverageOverlay: React.FC<CoverageOverlayProps> = (props) => {
  if (!props.enabled) return null;
  return <CoverageOverlayInner {...props} />;
};

export default CoverageOverlay;
