import type { Feature, FeatureCollection, Geometry } from "geojson";

/**
 * Lazy loader for Canadian FSA polygon shapes.
 *
 * The raw `canada-postal-codes.json` asset is ~27 MB, projected in
 * EPSG:3347 (Statistics Canada Lambert), so we:
 *   1. Dynamic-import the JSON, proj4, and turf so they live in a
 *      separate code-split chunk that never enters the public locator
 *      bundle unless the coverage overlay is actually mounted.
 *   2. Reproject every feature once, caching the WGS-84 GeoJSON in a
 *      module-level promise. Subsequent callers await the same promise.
 *
 * The reprojection mirrors the same approach used by TerritoryMap.tsx,
 * extracted here so the public-locator overlay doesn't need to depend on
 * (or duplicate) that 1400-line admin component.
 *
 * Properties on each output feature:
 *   * fsa            uppercase 3-char prefix (e.g. "K1A") — matches the
 *                    shape returned by `get_zip_coverage_aggregate` for
 *                    Canada.
 *   * province_abbr  best-effort province code (PRABBR / PROVABBR / first
 *                    2 chars of PRENAME, depending on dataset variant).
 *   * centroid       { lat, lng } computed from the reprojected polygon.
 */
export interface CanadaFsaFeatureProperties {
  fsa: string;
  province_abbr: string | null;
  centroid: { lat: number; lng: number } | null;
}

export type CanadaFsaFeature = Feature<Geometry, CanadaFsaFeatureProperties>;
export type CanadaFsaFeatureCollection = FeatureCollection<Geometry, CanadaFsaFeatureProperties>;

let cachedPromise: Promise<CanadaFsaFeatureCollection> | null = null;

export function loadCanadaFsaGeometries(): Promise<CanadaFsaFeatureCollection> {
  if (cachedPromise) return cachedPromise;

  cachedPromise = (async () => {
    const [{ default: canadaGeoJson }, proj4Module, turfModule] = await Promise.all([
      import("@/data/canada-postal-codes.json"),
      import("proj4"),
      import("@turf/turf"),
    ]);

    const proj4 = (proj4Module as any).default ?? proj4Module;
    const turf = turfModule;

    proj4.defs(
      "EPSG:3347",
      "+proj=lcc +lat_1=49 +lat_2=77 +lat_0=63.390675 +lon_0=-91.86666666666666 +x_0=6200000 +y_0=3000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    );
    proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

    const transformer = proj4("EPSG:3347", "EPSG:4326");

    const features: CanadaFsaFeature[] = (canadaGeoJson as any).features
      .map((feature: any): CanadaFsaFeature | null => {
        if (!feature?.geometry) return null;
        try {
          const reprojected = turf.clone(feature.geometry);
          turf.coordEach(reprojected as Geometry, (coord: number[]) => {
            const [lon, lat] = transformer.forward(coord);
            coord[0] = lon;
            coord[1] = lat;
          });

          const fsaRaw =
            feature.properties?.CFSAUID ??
            feature.properties?.FSAUID ??
            feature.properties?.fsa ??
            "";
          const fsa = String(fsaRaw).trim().toUpperCase().slice(0, 3);
          if (fsa.length !== 3) return null;

          const provinceAbbr =
            feature.properties?.PRABBR ??
            feature.properties?.PROVABBR ??
            (typeof feature.properties?.PRNAME === "string"
              ? feature.properties.PRNAME.split("/")[0]?.trim()
              : null) ??
            null;

          let centroid: { lat: number; lng: number } | null = null;
          try {
            const c = turf.centroid({ type: "Feature", geometry: reprojected as Geometry, properties: {} });
            const coords = c?.geometry?.coordinates;
            if (Array.isArray(coords) && coords.length >= 2) {
              centroid = { lat: coords[1] as number, lng: coords[0] as number };
            }
          } catch {
            // Centroid is non-essential (only used as a fallback for
            // hover tooltips); swallow malformed-polygon errors here.
          }

          return {
            type: "Feature",
            geometry: reprojected as Geometry,
            properties: { fsa, province_abbr: provinceAbbr, centroid },
          };
        } catch (err) {
          console.error("[canadaFsaGeometries] failed to project feature", err);
          return null;
        }
      })
      .filter((f: CanadaFsaFeature | null): f is CanadaFsaFeature => f !== null);

    return { type: "FeatureCollection", features };
  })();

  // If the caller's promise rejects we want subsequent callers to be able
  // to retry, not be stuck with a permanently-rejected cached promise.
  cachedPromise.catch(() => {
    cachedPromise = null;
  });

  return cachedPromise;
}
