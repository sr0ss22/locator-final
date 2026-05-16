import React, { useEffect, useState, useRef, useCallback, useMemo, memo, startTransition } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle, GeoJSON, Pane, Tooltip, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { cn } from '@/lib/utils';
import { Star, Loader2, Pencil, X } from 'lucide-react';
import { partialDensityFromRatio } from '@/lib/coverageStyle';
import { calculateDistance } from '@/utils/distance';
import { TerritoryStatus } from '@/types/territory';
import { toast } from 'sonner';
import * as turf from '@turf/turf';
import proj4 from 'proj4';
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import {
  fetchCanadianPostalsForFsa,
  type CanadianPostalForFsa,
} from "@/hooks/useInstallerData";
import usGeoJsonData from '@/data/us-zip-codes.json' with { type: 'json' };
import canadaGeoJsonData from '@/data/canada-postal-codes.json' with { type: 'json' };

// Fix for default Leaflet icons
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
  });
  
  proj4.defs("EPSG:3857", "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs");
  proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");
  proj4.defs("EPSG:3347", "+proj=lcc +lat_1=49 +lat_2=77 +lat_0=63.390675 +lon_0=-91.86666666666666 +x_0=6200000 +y_0=3000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
  
  interface TerritoryMapProps {
  onZipCodeClick: (zipCode: string, stateProvince: string) => void;
  centerLocation?: { lat: number | null; lng: number | null };
  isOpen?: boolean;
  territoryStatuses?: Map<string, TerritoryStatus>;
  selectedZipCodes?: Array<{ zipCode: string, assignedStatus: TerritoryStatus, stateProvince: string, centroid_latitude: number | null, centroid_longitude: number | null }>;
  currentDisplayRadius?: number | 'all';
  showRadiusCircles?: boolean;
  highlightedZipCodes: Map<string, 'green' | 'orange'>;
  isBulkSelecting?: boolean;
  onBulkSelectionComplete?: (selectedZips: Array<{ zipCode: string, stateProvince: string }>) => void;
  onBulkZipCodeUpdate?: (updates: Array<{ zipCode: string, stateProvince: string, newStatus: TerritoryStatus | null }>) => void;
  country?: 'USA' | 'Canada';
  refreshKey?: number;
  // When the map is rendered inside the public sharable territory editor, the
  // installer is not signed in. Pass the URL's installerId+token so child
  // edge function calls can authenticate as the public installer.
  publicAuth?: { installerId: string; token: string };
  /** When set, Canada FSA vs postal-code preference is stored separately (e.g. admin vs public). */
  canadaDisplayModeStorageKey?: string;
  /**
   * Total postal codes per Canadian FSA (3-char prefix). Used to colour FSAs
   * as "fully covered" (solid) vs. "partially covered" (striped). When
   * absent, FSAs colour based only on the assignments we know about
   * (best-effort fallback).
   */
  fsaTotalPostalCounts?: Map<string, number>;
  /**
   * True while the FSA totals query is in flight. Lets the map render the
   * optimistic "any-assigned → solid" colouring (and surface a small
   * "refining coverage" badge) instead of flashing every FSA as partial
   * coverage during the load.
   */
  fsaTotalPostalCountsLoading?: boolean;
  /**
   * If set, FSA polygon clicks (Canada, FSA mode) open a popup that lets
   * the user assign or remove every postal in that FSA in one shot. The
   * caller is responsible for fetching the FSA's postals (we keep it on
   * the page so the page already-knows how to update its own state).
   */
  onFsaBulkAction?: (
    fsa: string,
    action: 'free' | 'paid' | 'remove',
    stateProvince: string,
  ) => Promise<void>;
}

const DEFAULT_DISPLAY_RADIUS_MILES = 25;

const getPostalCode = (feature: any, isCanada: boolean): string => {
  if (!feature || !feature.properties) return '';
  return isCanada ? feature.properties.CFSAUID : feature.properties.ZCTA5CE20;
};

const getRegion = (feature: any, isCanada: boolean): string => {
  if (!feature || !feature.properties) return 'Unknown';
  return isCanada ? feature.properties.PRNAME : (feature.properties.STUSPS || 'Unknown');
};

const getCentroid = (feature: any): { lat: number | null, lng: number | null } => {
    if (feature && feature.properties && feature.properties.calculated_centroid) {
        return feature.properties.calculated_centroid;
    }
    return { lat: null, lng: null };
};

function isPointInCircle(pointLat: number, pointLng: number, circleCenterLat: number, circleCenterLng: number, circleRadiusMeters: number): boolean {
  const distanceMiles = calculateDistance(pointLat, pointLng, circleCenterLat, circleCenterLng);
  return (distanceMiles * 1609.34) <= circleRadiusMeters;
}

const createStarIcon = () => L.divIcon({
  html: `<div class="relative flex items-center justify-center" style="width: 40px; height: 40px;">
          <svg stroke="currentColor" fill="#3b82f6" stroke-width="0" viewBox="0 0 24 24" height="40px" width="40px" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.27l-6.18 3.25L7 14.14l-5-4.87 7.91-1.01L12 2z"></path>
          </svg>
        </div>`,
  className: 'custom-div-icon',
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -35],
});

function MapUpdater({ centerLocation, isOpen, country }: {
  centerLocation?: { lat: number | null; lng: number | null };
  isOpen: boolean;
  country: 'USA' | 'Canada';
}) {
  const map = useMap();

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => map.invalidateSize(), 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen, map]);

  useEffect(() => {
    if (centerLocation?.lat != null && centerLocation?.lng != null) {
      map.setView([centerLocation.lat, centerLocation.lng], 10);
    } else {
      if (country === 'Canada') {
        map.setView([56.1304, -106.3468], 4);
      } else {
        map.setView([39.8283, -98.5795], 4);
      }
    }
  }, [map, centerLocation, country]);

  return null;
}

// Fits the map to a target LatLngBoundsExpression whenever it changes
// AND fires once on the first non-null bounds. Used by the FSA edit
// mode to zoom into the focused FSA when the user opens it. The
// boundsKey lets the caller force a re-fit (e.g. re-clicking the same
// FSA from a different vantage point) without unmounting the
// component.
function MapBoundsFitter({
  bounds,
  boundsKey,
  padding,
}: {
  bounds: L.LatLngBoundsExpression | null;
  boundsKey: string | number;
  padding?: [number, number];
}) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    try {
      map.fitBounds(bounds, { padding: padding ?? [40, 40], animate: true });
    } catch {
      // Bounds may be degenerate (single-point FSA, missing geometry); ignore.
    }
  }, [map, bounds, boundsKey, padding]);
  return null;
}

function MapInteractionHandler({
  isBulkSelecting,
  geoJsonData,
  onBulkSelectionComplete,
  isCanada,
  publicAuth,
  fsaEditPostals,
}: {
  isBulkSelecting: boolean;
  geoJsonData: any;
  onBulkSelectionComplete: ((selectedZips: Array<{ zipCode: string, stateProvince: string }>) => void) | undefined;
  isCanada: boolean;
  publicAuth?: { installerId: string; token: string };
  // When set (FSA edit mode is active), the bulk-lasso intersects
  // against this in-memory list instead of calling the heavyweight
  // radius RPC. Lets the user lasso a subset of an FSA without
  // paying for a 160k-point radius scan.
  fsaEditPostals?: CanadianPostalForFsa[];
}) {
  const map = useMap();
  const isDrawingRef = useRef(false);
  const drawStartLatLngRef = useRef<L.LatLng | null>(null);
  const currentDrawCircleRef = useRef<L.Circle | null>(null);
  const onBulkSelectionCompleteRef = useRef(onBulkSelectionComplete);
  const fsaEditPostalsRef = useRef(fsaEditPostals);

  useEffect(() => {
    onBulkSelectionCompleteRef.current = onBulkSelectionComplete;
  }, [onBulkSelectionComplete]);
  useEffect(() => {
    fsaEditPostalsRef.current = fsaEditPostals;
  }, [fsaEditPostals]);

  useEffect(() => {
    const handleMouseDown = (e: L.LeafletMouseEvent) => {
      isDrawingRef.current = true;
      drawStartLatLngRef.current = e.latlng;
      if (currentDrawCircleRef.current) {
        map.removeLayer(currentDrawCircleRef.current);
        currentDrawCircleRef.current = null;
      }
    };

    const handleMouseMove = (e: L.LeafletMouseEvent) => {
      if (isDrawingRef.current && drawStartLatLngRef.current) {
        const distanceMeters = drawStartLatLngRef.current.distanceTo(e.latlng);
        if (currentDrawCircleRef.current) {
          currentDrawCircleRef.current.setRadius(distanceMeters);
        } else {
          currentDrawCircleRef.current = L.circle(drawStartLatLngRef.current, {
            radius: distanceMeters,
            color: '#1D4ED8',
            fillColor: '#BFDBFE',
            fillOpacity: 0.3,
            weight: 2,
            interactive: false,
          }).addTo(map);
        }
      }
    };

    const handleMouseUp = async () => {
      if (isDrawingRef.current && drawStartLatLngRef.current && currentDrawCircleRef.current && onBulkSelectionCompleteRef.current) {
        const finalCenter = drawStartLatLngRef.current;
        const finalRadiusMeters = currentDrawCircleRef.current.getRadius();

        // FSA edit mode fast path: we already have the FSA's ~50–200
        // postals in memory, so the lasso is just a point-in-circle
        // filter against that small array. Skips the radius RPC
        // entirely (which would also pull every other installer's
        // postals in the area).
        const fsaPostals = fsaEditPostalsRef.current;
        if (isCanada && fsaPostals && fsaPostals.length > 0) {
          const selectedZips = fsaPostals
            .filter(
              (p) =>
                p.latitude != null &&
                p.longitude != null &&
                isPointInCircle(
                  p.latitude,
                  p.longitude,
                  finalCenter.lat,
                  finalCenter.lng,
                  finalRadiusMeters,
                ),
            )
            .map((p) => ({
              zipCode: p.postal_code,
              stateProvince: p.province_abbr || 'Unknown',
            }));
          onBulkSelectionCompleteRef.current(selectedZips);
          if (currentDrawCircleRef.current) {
            map.removeLayer(currentDrawCircleRef.current);
            currentDrawCircleRef.current = null;
          }
          isDrawingRef.current = false;
          drawStartLatLngRef.current = null;
          return;
        }

        if (isCanada) {
          const loadingToastId = toast.loading("Fetching all postal codes in selected area...");
          try {
            const { data, error } = await supabase.functions.invoke('get-all-canadian-points-in-radius', {
              body: {
                center_lat: finalCenter.lat,
                center_lng: finalCenter.lng,
                radius_meters: finalRadiusMeters,
                ...(publicAuth ?? {}),
              }
            });
    
            if (error) {
              throw error;
            }
            if (data.error) {
              throw new Error(data.error);
            }
    
            const selectedZips = (data.data || []).map((p: any) => ({ zipCode: p.POSTAL_CODE, stateProvince: p.PROVINCE_ABBR }));
            onBulkSelectionCompleteRef.current(selectedZips);
            toast.success(`Found ${selectedZips.length} postal codes.`, { id: loadingToastId });
          } catch (err: any) {
            toast.error(`Failed to get postal codes for selection: ${err.message}`, { id: loadingToastId });
            console.error(err);
          }
        } else if (geoJsonData) {
          const selectedZips: Array<{ zipCode: string, stateProvince: string }> = [];
          geoJsonData.features.forEach((feature: any) => {
            if (feature.geometry) {
              const centroid = getCentroid(feature);
              if (centroid.lat && centroid.lng && isPointInCircle(centroid.lat, centroid.lng, finalCenter.lat, finalCenter.lng, finalRadiusMeters)) {
                selectedZips.push({ zipCode: getPostalCode(feature, isCanada), stateProvince: getRegion(feature, isCanada) });
              }
            }
          });
          onBulkSelectionCompleteRef.current(selectedZips);
        }
      }

      if (currentDrawCircleRef.current) {
        map.removeLayer(currentDrawCircleRef.current);
        currentDrawCircleRef.current = null;
      }
      isDrawingRef.current = false;
      drawStartLatLngRef.current = null;
    };

    if (isBulkSelecting) {
      map.on('mousedown', handleMouseDown);
      map.on('mousemove', handleMouseMove);
      map.on('mouseup', handleMouseUp);
      map.dragging.disable();
    } else {
      map.off('mousedown', handleMouseDown);
      map.off('mousemove', handleMouseMove);
      map.off('mouseup', handleMouseUp);
      if (map.dragging && !map.dragging.enabled()) map.dragging.enable();
    }

    return () => {
      map.off('mousedown', handleMouseDown);
      map.off('mousemove', handleMouseMove);
      map.off('mouseup', handleMouseUp);
      if (map.dragging && !map.dragging.enabled()) map.dragging.enable();
    };
  }, [map, isBulkSelecting, geoJsonData, isCanada]);

  return null;
}

const LoadingOverlay = ({
  progress,
  total,
  stage,
  footnote,
}: {
  progress: number;
  total: number;
  stage: 'counting' | 'fetching';
  /** Explains what the progress bar measures (e.g. map postal points vs installer assignments). */
  footnote?: string;
}) => (
  <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-[1000]">
    <div className="flex flex-col items-center text-gray-700 bg-white p-6 rounded-lg shadow-lg max-w-sm w-[min(100%,24rem)] px-5">
      <Loader2 className="h-8 w-8 animate-spin text-gray-500 mb-4" />
      <p className="font-semibold text-lg mb-2 text-center">
        {stage === 'counting' ? 'Calculating...' : 'Loading map postal codes...'}
      </p>
      {stage !== 'counting' && (
        <>
          <Progress value={total > 0 ? (progress / total) * 100 : 0} className="w-full" />
          <p className="text-sm text-gray-500 mt-2 tabular-nums">{progress.toLocaleString()} / {total.toLocaleString()}</p>
        </>
      )}
      {footnote ? (
        <p className="text-xs text-gray-500 mt-3 text-center leading-snug">{footnote}</p>
      ) : null}
    </div>
  </div>
);

// Density buckets (5/10/15/20%) for partial FSA coverage.
// Stroke width in a 20-unit pattern gives the target coverage ratio:
//   1/20 = 5%, 2/20 = 10%, 3/20 = 15%, 4/20 = 20%.
const FSA_PARTIAL_DENSITIES = ['5', '10', '15', '20'] as const;
const FSA_DENSITY_STROKE: Record<string, number> = { '5': 1, '10': 2, '15': 3, '20': 4 };

// Hidden SVG <defs> mounted once per TerritoryMap. Browsers resolve
// `fill="url(#id)"` against any <defs> in the same document, so the Leaflet
// SVG renderer can reference these patterns even though they live in a
// separate inline SVG element. Kept tiny and aria-hidden.
const FsaFillPatternDefs: React.FC = () => (
  <svg
    width="0"
    height="0"
    style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      {/* Mix of free + paid (FSA fully covered, but assignments differ). */}
      <pattern
        id="fsa-mixed-pattern"
        patternUnits="userSpaceOnUse"
        width="8"
        height="8"
        patternTransform="rotate(45)"
      >
        <rect width="8" height="8" fill="#F97316" fillOpacity={0.45} />
        <line x1="0" y1="0" x2="0" y2="8" stroke="#16A34A" strokeWidth={2.5} strokeOpacity={0.5} />
      </pattern>

      {/* Partial-coverage variants — 4 density buckets per color so
          stripe spacing encodes "how covered" the FSA is:
            1–25%  → 5% density (very sparse)
            26–50% → 10%
            51–74% → 15%
            75–99% → 20% */}
      {FSA_PARTIAL_DENSITIES.map((d) => {
        const sw = FSA_DENSITY_STROKE[d];
        return (
          <React.Fragment key={d}>
            <pattern
              id={`fsa-partial-free-pattern-${d}`}
              patternUnits="userSpaceOnUse"
              width="20"
              height="20"
              patternTransform="rotate(45)"
            >
              <rect width="20" height="20" fill="#FFFFFF" fillOpacity={0.85} />
              <line x1="0" y1="0" x2="0" y2="20" stroke="#16A34A" strokeWidth={sw} strokeOpacity={0.55} />
            </pattern>
            <pattern
              id={`fsa-partial-paid-pattern-${d}`}
              patternUnits="userSpaceOnUse"
              width="20"
              height="20"
              patternTransform="rotate(45)"
            >
              <rect width="20" height="20" fill="#FFFFFF" fillOpacity={0.85} />
              <line x1="0" y1="0" x2="0" y2="20" stroke="#F97316" strokeWidth={sw} strokeOpacity={0.55} />
            </pattern>
          </React.Fragment>
        );
      })}
    </defs>
  </svg>
);

// Inline UI for the FSA bulk-action popup. Shows the action-focused
// breakdown (missing / free / paid) and three buttons. Each button has a
// two-step confirmation so users don't accidentally overwrite a large
// FSA. The actual write happens in the parent (EditInstallerPage) via
// the onFsaBulkAction callback so all assignment edits flow through the
// same Save button.
const FsaBulkActionPopupContents: React.FC<{
  fsa: string;
  stateProvince: string;
  free: number;
  paid: number;
  total: number | undefined;
  onAction: (action: 'free' | 'paid' | 'remove') => Promise<void>;
  onClose: () => void;
  // Optional escape hatch into per-postal editing scoped to this FSA.
  // When set, surfaces an extra button below the bulk actions that
  // (a) closes the popup and (b) drops the map into "edit this FSA"
  // mode (TerritoryMap manages the actual state).
  onEnterEdit?: () => void;
}> = ({ fsa, stateProvince, free, paid, total, onAction, onClose, onEnterEdit }) => {
  const assigned = free + paid;
  const missing = total != null ? Math.max(0, total - assigned) : null;

  const [pending, setPending] = React.useState<'free' | 'paid' | 'remove' | null>(null);
  const [busy, setBusy] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  // Inside Leaflet popups, native click/scroll events bubble to the map
  // and can swallow React's button clicks. Stop Leaflet from handling
  // them so onClick handlers fire normally.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
  }, []);

  const totalDisplay = total != null ? total.toLocaleString() : '—';
  const targetCount = total ?? assigned;

  const confirmCopy = (() => {
    if (!pending) return null;
    if (pending === 'remove') {
      return assigned > 0
        ? `Remove all ${assigned.toLocaleString()} assignments from ${fsa}?`
        : `Nothing to remove in ${fsa}.`;
    }
    const label = pending === 'free' ? 'Free' : 'Paid';
    if (total != null) {
      return `Set all ${total.toLocaleString()} postals in ${fsa} as ${label}? Existing assignments in this FSA will be replaced.`;
    }
    return `Set every postal in ${fsa} as ${label}? Existing assignments in this FSA will be replaced.`;
  })();

  const runConfirmed = async () => {
    if (!pending) return;
    if (pending === 'remove' && assigned === 0) {
      setPending(null);
      return;
    }
    setBusy(true);
    try {
      await onAction(pending);
      onClose();
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <div ref={containerRef} className="text-sm w-[260px]">
      <div className="font-semibold text-gray-900">
        FSA: {fsa}
        {stateProvince && stateProvince !== 'Unknown' && (
          <span className="text-gray-500 font-normal"> ({stateProvince})</span>
        )}
      </div>

      <div className="mt-2 space-y-0.5">
        {missing != null && missing === 0 ? (
          <div className="text-emerald-700 font-medium">
            ✓ All {totalDisplay} postals assigned
          </div>
        ) : missing != null ? (
          <div>
            <span className="font-semibold text-gray-900">{missing.toLocaleString()} unassigned</span>
            <span className="text-gray-500"> of {totalDisplay}</span>
          </div>
        ) : (
          <div className="text-gray-500">{assigned.toLocaleString()} assigned</div>
        )}
        <div className="text-gray-600 text-xs">
          {free > 0 && <span>{free.toLocaleString()} free</span>}
          {free > 0 && paid > 0 && <span> · </span>}
          {paid > 0 && <span>{paid.toLocaleString()} paid</span>}
          {free === 0 && paid === 0 && <span>No assignments yet</span>}
        </div>
      </div>

      {pending ? (
        <div className="mt-3 border-t border-gray-200 pt-3">
          <div className="text-gray-800 text-xs leading-snug">{confirmCopy}</div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={runConfirmed}
              disabled={busy || (pending === 'remove' && assigned === 0)}
              className={
                'flex-1 px-2.5 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-50 ' +
                (pending === 'remove'
                  ? 'bg-red-600 hover:bg-red-700'
                  : pending === 'free'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-orange-600 hover:bg-orange-700')
              }
            >
              {busy ? 'Working…' : 'Confirm'}
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              disabled={busy}
              className="flex-1 px-2.5 py-1.5 rounded text-xs font-medium bg-gray-100 text-gray-800 hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 border-t border-gray-200 pt-3 space-y-1.5">
          <button
            type="button"
            onClick={() => setPending('free')}
            className="w-full px-2.5 py-1.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
          >
            Set all {targetCount > 0 ? targetCount.toLocaleString() : ''} to Free
          </button>
          <button
            type="button"
            onClick={() => setPending('paid')}
            className="w-full px-2.5 py-1.5 rounded text-xs font-semibold bg-orange-50 text-orange-800 border border-orange-200 hover:bg-orange-100"
          >
            Set all {targetCount > 0 ? targetCount.toLocaleString() : ''} to Paid
          </button>
          {/* Per-postal editor entry — only shown when the parent
              wired up onEnterEdit. Closes the popup and lets the
              parent take over (zoom to FSA, render postal dots, show
              focus banner). Useful when the FSA is mixed (some Free,
              some Paid) and bulk-overwriting would destroy that. */}
          {onEnterEdit && (
            <button
              type="button"
              onClick={() => {
                onEnterEdit();
                onClose();
              }}
              className="w-full px-2.5 py-1.5 rounded text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100 inline-flex items-center justify-center gap-1.5"
            >
              <Pencil className="h-3 w-3" aria-hidden="true" />
              Edit individual postals
            </button>
          )}
          <button
            type="button"
            onClick={() => setPending('remove')}
            disabled={assigned === 0}
            className="w-full px-2.5 py-1.5 rounded text-xs font-medium text-red-700 border border-red-200 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Remove all from FSA
          </button>
        </div>
      )}
    </div>
  );
};

// Module-level cache for Canadian postal-code fetches. Keyed by
// `${lat}-${lng}-${radius}`. Survives across:
//   * toggling FSA <-> Postal codes inside the same map instance
//   * navigating between installers (TerritoryMap mounts/unmounts)
//   * the public sharable territory editor reusing the same map component
//
// Bounded LRU so a long session moving between many installers in different
// cities can't grow memory unbounded. Each entry is the raw point array
// (~50 bytes/point JSON, ~7-10 MB for the busiest urban radii).
const CANADA_POINTS_CACHE_LIMIT = 8;
const canadaPointsCache = new Map<string, any[]>();

function readCanadaPointsCache(key: string): any[] | undefined {
  const value = canadaPointsCache.get(key);
  if (value !== undefined) {
    // Touch: re-insert so it becomes the most-recently-used entry.
    canadaPointsCache.delete(key);
    canadaPointsCache.set(key, value);
  }
  return value;
}

function writeCanadaPointsCache(key: string, value: any[]) {
  if (canadaPointsCache.has(key)) {
    canadaPointsCache.delete(key);
  }
  canadaPointsCache.set(key, value);
  while (canadaPointsCache.size > CANADA_POINTS_CACHE_LIMIT) {
    const oldest = canadaPointsCache.keys().next().value;
    if (oldest === undefined) break;
    canadaPointsCache.delete(oldest);
  }
}

// In-flight fetches keyed by `${lat}-${lng}-${radius}`. Prevents
// duplicate work when (a) the user is in postal-codes mode and a parallel
// FSA-mode prefetch is also running, or (b) two TerritoryMap instances
// open the same area at once.
const canadaPointsInFlight = new Map<string, Promise<any[]>>();

type CanadaPointsProgress = {
  onCount?: (count: number) => void;
  onProgress?: (loaded: number) => void;
};

// Shared fetcher used by both the live load and the background prefetch.
// On success, populates the module-level cache so any concurrent or
// subsequent caller can read it for free.
async function fetchCanadaPointsForKey(
  searchKey: string,
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  progress: CanadaPointsProgress = {},
): Promise<any[]> {
  const cached = canadaPointsCache.get(searchKey);
  if (cached) return cached;

  const inFlight = canadaPointsInFlight.get(searchKey);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const radiusMeters = radiusKm * 1000;
    const { data: count, error: countError } = await supabase.rpc(
      'get_canadian_points_in_radius_count',
      { center_lat: centerLat, center_lng: centerLng, radius_meters: radiusMeters },
    );
    if (countError) throw new Error(`Failed to get count: ${countError.message}`);
    progress.onCount?.(count ?? 0);
    if (!count) {
      writeCanadaPointsCache(searchKey, []);
      return [];
    }

    const PAGE_SIZE = 1000;
    const totalPages = Math.ceil(count / PAGE_SIZE);
    const CONCURRENCY_LIMIT = 20;
    let fetchedPoints: any[] = [];
    for (let i = 0; i < totalPages; i += CONCURRENCY_LIMIT) {
      const chunkEnd = Math.min(i + CONCURRENCY_LIMIT, totalPages);
      const promises = [];
      for (let j = i; j < chunkEnd; j++) {
        const page = j + 1;
        promises.push(
          supabase.rpc('get_all_canadian_points_in_radius', {
            center_lat: centerLat,
            center_lng: centerLng,
            radius_meters: radiusMeters,
            page_size: PAGE_SIZE,
            page_number: page,
          }),
        );
      }
      const results = await Promise.all(promises);
      for (const result of results) {
        if (result.data) fetchedPoints = fetchedPoints.concat(result.data);
      }
      progress.onProgress?.(fetchedPoints.length);
    }
    writeCanadaPointsCache(searchKey, fetchedPoints);
    return fetchedPoints;
  })();

  canadaPointsInFlight.set(searchKey, promise);
  try {
    return await promise;
  } finally {
    canadaPointsInFlight.delete(searchKey);
  }
}

// requestIdleCallback shim — falls back to setTimeout(0) on Safari where
// it isn't implemented yet. Used to schedule the FSA-mode prefetch so it
// never competes with synchronous render work.
function scheduleIdle(callback: () => void): () => void {
  const w = typeof window !== 'undefined' ? (window as any) : undefined;
  if (w?.requestIdleCallback) {
    const id = w.requestIdleCallback(callback, { timeout: 1500 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = setTimeout(callback, 250);
  return () => clearTimeout(id);
}

// Display modes for the Canadian map. FSA mode renders only the static
// 3-character FSA polygons; "postal-codes" additionally fetches and renders
// the ~6-character postal code dots from the database. Persisted in
// localStorage so the user's preference survives reloads.
type CanadaDisplayMode = 'fsa' | 'postal-codes';
const CANADA_DISPLAY_MODE_KEY = 'territory-map-canada-display-mode';

function readCanadaDisplayMode(storageKey: string): CanadaDisplayMode {
  if (typeof window === 'undefined') return 'fsa';
  const stored = window.localStorage.getItem(storageKey);
  return stored === 'postal-codes' ? 'postal-codes' : 'fsa';
}

const TerritoryMap: React.FC<TerritoryMapProps> = ({
  onZipCodeClick,
  centerLocation,
  isOpen = false,
  territoryStatuses = new Map(),
  selectedZipCodes = [],
  currentDisplayRadius = DEFAULT_DISPLAY_RADIUS_MILES,
  showRadiusCircles = false,
  highlightedZipCodes,
  isBulkSelecting = false,
  onBulkSelectionComplete,
  onBulkZipCodeUpdate,
  country = 'USA',
  refreshKey = 0,
  publicAuth,
  canadaDisplayModeStorageKey,
  fsaTotalPostalCounts,
  fsaTotalPostalCountsLoading = false,
  onFsaBulkAction,
}) => {
  const resolvedCanadaModeKey =
    canadaDisplayModeStorageKey && canadaDisplayModeStorageKey.length > 0
      ? canadaDisplayModeStorageKey
      : CANADA_DISPLAY_MODE_KEY;
  const [allGeoJsonData, setAllGeoJsonData] = useState<any>(null);
  const [allCanadaGeoJsonData, setAllCanadaGeoJsonData] = useState<any>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);

  const [allCanadaPoints, setAllCanadaPoints] = useState<any[]>([]);
  const [renderedCanadaPoints, setRenderedCanadaPoints] = useState<any[]>([]);
  const [loadingStage, setLoadingStage] = useState<'idle' | 'counting' | 'fetching' | 'complete'>('idle');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [totalPointsToLoad, setTotalPointsToLoad] = useState(0);
  const lastSearchKey = useRef<string | null>(null);

  const [canadaDisplayMode, setCanadaDisplayMode] = useState<CanadaDisplayMode>(() =>
    readCanadaDisplayMode(resolvedCanadaModeKey),
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(resolvedCanadaModeKey, canadaDisplayMode);
    } catch {
      // localStorage may be unavailable (private mode, quota); ignore.
    }
  }, [canadaDisplayMode, resolvedCanadaModeKey]);

  const isCanada = country === 'Canada';
  const isTerritoryManagementPage = !isOpen;

  // Stable SVG renderer for the Canadian FSA polygon layer. We need SVG (not
  // canvas) here because canvas cannot reference SVG patterns; the FSA "mixed"
  // fill (`url(#fsa-mixed-pattern)`) requires SVG paint servers. ~1,600 FSAs
  // is well within SVG's comfort zone — the heavy 160k postal-code dots stay
  // on the MapContainer's default canvas renderer.
  const svgPolygonRenderer = useMemo(() => L.svg({ pane: 'polygons' }), []);

  const onZipCodeClickRef = useRef(onZipCodeClick);
  useEffect(() => {
    onZipCodeClickRef.current = onZipCodeClick;
  }, [onZipCodeClick]);

  // FSA bulk-action popup. Opened when the user clicks an FSA polygon in
  // FSA mode and the parent provided an onFsaBulkAction callback. The
  // ref-indirection keeps the click handler attached to each Leaflet
  // layer (memoised across renders) able to call into the latest opener.
  const [fsaBulkPopup, setFsaBulkPopup] = useState<{
    fsa: string;
    stateProvince: string;
    latlng: L.LatLng;
  } | null>(null);
  const openFsaBulkPopupRef = useRef<
    ((fsa: string, stateProvince: string, latlng: L.LatLng | null) => void) | null
  >(null);
  useEffect(() => {
    openFsaBulkPopupRef.current = (fsa, stateProvince, latlng) => {
      if (!latlng) return;
      setFsaBulkPopup({ fsa, stateProvince, latlng });
    };
  }, []);

  // FSA edit mode — when the user picks "Edit individual postals" on
  // the bulk-action popup, we switch the map into a focused mode that
  // shows ONLY this FSA's postals as colored dots, dims the rest of
  // the country, and surfaces a banner with the per-status counts +
  // an exit affordance. Per-dot clicks reuse the normal
  // onZipCodeClick path so the Free → Paid → removed cycle and the
  // bottom Save button behave identically to the postal-codes view.
  const [fsaEditTarget, setFsaEditTarget] = useState<{
    fsa: string;
    stateProvince: string;
  } | null>(null);
  const [fsaEditPostals, setFsaEditPostals] = useState<CanadianPostalForFsa[]>([]);
  const [fsaEditLoading, setFsaEditLoading] = useState(false);
  // Bounds for the focused FSA polygon, derived from the GeoJSON
  // feature on entry. Drives MapBoundsFitter so the map snaps to the
  // FSA on entry.
  const [fsaEditBounds, setFsaEditBounds] = useState<L.LatLngBoundsExpression | null>(null);
  // GeoJSON feature for the focused FSA only — used to render an
  // emphasized outline while the dots take over the body of the map.
  const fsaEditFeature = useMemo(() => {
    if (!fsaEditTarget || !allCanadaGeoJsonData) return null;
    const target = fsaEditTarget.fsa.toUpperCase();
    return (allCanadaGeoJsonData.features || []).find(
      (f: any) => (f?.properties?.CFSAUID || '').toUpperCase() === target,
    ) || null;
  }, [fsaEditTarget, allCanadaGeoJsonData]);

  // Load this FSA's postals + bounds when entering edit mode. Caches
  // nothing on its own (fetchCanadianPostalsForFsa already hits an
  // RPC and is fast) but resets cleanly when the target changes or
  // is cleared.
  useEffect(() => {
    if (!fsaEditTarget) {
      setFsaEditPostals([]);
      setFsaEditBounds(null);
      setFsaEditLoading(false);
      return;
    }
    let cancelled = false;
    setFsaEditLoading(true);
    (async () => {
      try {
        const postals = await fetchCanadianPostalsForFsa(fsaEditTarget.fsa);
        if (cancelled) return;
        setFsaEditPostals(postals);
      } catch (err: any) {
        if (cancelled) return;
        console.error('Failed to load FSA postals for edit mode:', err);
        toast.error(`Could not load postals for ${fsaEditTarget.fsa}: ${err?.message ?? 'unknown error'}`);
        setFsaEditPostals([]);
      } finally {
        if (!cancelled) setFsaEditLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fsaEditTarget]);

  // Fit the map to the FSA polygon plus every postal coordinate so
  // edge postals (coords outside the StatsCan boundary) are in view.
  useEffect(() => {
    if (!fsaEditTarget) {
      setFsaEditBounds(null);
      return;
    }
    try {
      let bounds: L.LatLngBounds | null = null;
      if (fsaEditFeature) {
        const layer = L.geoJSON(fsaEditFeature);
        const polyBounds = layer.getBounds();
        if (polyBounds.isValid()) bounds = polyBounds;
      }
      for (const p of fsaEditPostals) {
        if (p.latitude == null || p.longitude == null) continue;
        const ll = L.latLng(p.latitude, p.longitude);
        if (bounds) bounds.extend(ll);
        else bounds = L.latLngBounds(ll, ll);
      }
      setFsaEditBounds(bounds?.isValid() ? bounds : null);
    } catch (err) {
      console.error('Failed to compute FSA edit bounds:', err);
      setFsaEditBounds(null);
    }
  }, [fsaEditTarget, fsaEditFeature, fsaEditPostals]);

  // Postals whose Canada Post coordinate sits outside the StatsCan FSA
  // polygon — still valid T3Z codes, drawn with a dashed ring so they
  // read as "edge" without hiding them.
  const fsaEditEdgePostalCodes = useMemo(() => {
    const edge = new Set<string>();
    if (!fsaEditTarget || fsaEditPostals.length === 0 || !fsaEditFeature?.geometry) {
      return edge;
    }
    try {
      const polygon = fsaEditFeature as any;
      for (const p of fsaEditPostals) {
        if (p.latitude == null || p.longitude == null) continue;
        const key = (p.postal_code ?? '').toUpperCase().replace(/\s+/g, '');
        if (!key) continue;
        const pt = turf.point([p.longitude, p.latitude]);
        try {
          if (!turf.booleanPointInPolygon(pt, polygon)) edge.add(key);
        } catch {
          edge.add(key);
        }
      }
    } catch (err) {
      console.error('Failed to classify edge FSA postals:', err);
    }
    return edge;
  }, [fsaEditTarget, fsaEditPostals, fsaEditFeature]);

  // Live aggregate of THIS FSA's currently-selected postals — drives
  // the count in the focus banner so it stays accurate as the user
  // clicks dots.
  const fsaEditCounts = useMemo(() => {
    if (!fsaEditTarget) return { free: 0, paid: 0, unassigned: 0, total: 0 };
    const target = fsaEditTarget.fsa.toUpperCase();
    let free = 0;
    let paid = 0;
    for (const sel of selectedZipCodes) {
      const z = (sel.zipCode ?? '').toUpperCase().replace(/\s+/g, '');
      if (!z.startsWith(target)) continue;
      if (sel.assignedStatus === 'Approved') free++;
      else if (sel.assignedStatus === 'Needs Approval') paid++;
    }
    const total = fsaEditPostals.length || fsaTotalPostalCounts?.get(target) || 0;
    const unassigned = Math.max(0, total - free - paid);
    return { free, paid, unassigned, total };
  }, [fsaEditTarget, fsaEditPostals, fsaTotalPostalCounts, selectedZipCodes]);

  // ESC closes FSA edit mode — matches the rest of the app's modal/
  // sheet conventions.
  useEffect(() => {
    if (!fsaEditTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFsaEditTarget(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fsaEditTarget]);

  // Process the static Canada FSA GeoJSON once. Used by both display modes,
  // so it runs independently of the postal-code DB fetch.
  useEffect(() => {
    if (!isCanada || allCanadaGeoJsonData || !canadaGeoJsonData) return;

    const processed = (canadaGeoJsonData as any).features.map((feature: any) => {
      const newFeature = JSON.parse(JSON.stringify(feature));
      try {
        const transformedGeometry = turf.clone(feature.geometry);
        turf.coordEach(transformedGeometry, (currentCoord) => {
          const [lon, lat] = proj4('EPSG:3347', 'EPSG:4326').forward(currentCoord);
          currentCoord[0] = lon;
          currentCoord[1] = lat;
        });
        const centroid = turf.centroid(transformedGeometry);
        if (centroid?.geometry?.coordinates) {
          newFeature.properties.calculated_centroid = {
            lat: centroid.geometry.coordinates[1],
            lng: centroid.geometry.coordinates[0],
          };
        }
        newFeature.geometry = transformedGeometry;
      } catch (e) {
        console.error('Error transforming Canada GeoJSON feature', e);
      }
      return newFeature;
    });
    setAllCanadaGeoJsonData({ type: 'FeatureCollection', features: processed });
  }, [isCanada, allCanadaGeoJsonData]);

  // Main data loading effect
  useEffect(() => {
    const loadAndRenderData = async () => {
      const searchKey = (isCanada && centerLocation?.lat && centerLocation.lng && currentDisplayRadius !== 'all')
        ? `${centerLocation.lat}-${centerLocation.lng}-${currentDisplayRadius}`
        : null;

      if (isCanada) {
        // FSA mode: just render the static polygons. We INTENTIONALLY do
        // not clear allCanadaPoints / renderedCanadaPoints here — the JSX
        // already gates rendering on `canadaDisplayMode === 'postal-codes'`,
        // and keeping the data in state means toggling back to Postal
        // codes for the same (lat, lng, radius) is instant.
        if (canadaDisplayMode === 'fsa') {
          if (loadingStage !== 'idle' && loadingStage !== 'complete') {
            setLoadingStage('complete');
          }
          return;
        }

        // No specific location/radius (e.g. /territories "all" view): nothing
        // to fetch, drop any postal-code state we may have inherited.
        if (!searchKey) {
          if (renderedCanadaPoints.length > 0) setRenderedCanadaPoints([]);
          if (allCanadaPoints.length > 0) setAllCanadaPoints([]);
          lastSearchKey.current = null;
          return;
        }

        // Already showing the right data for this search.
        if (searchKey === lastSearchKey.current) {
          return;
        }

        // Module-level cache hit. Skip the network entirely — covers the
        // case where the user navigated away (e.g. to a different installer
        // in the same city) and came back.
        const cached = readCanadaPointsCache(searchKey);
        if (cached) {
          lastSearchKey.current = searchKey;
          setAllCanadaPoints(cached);
          setRenderedCanadaPoints(cached);
          setTotalPointsToLoad(cached.length);
          setLoadingProgress(cached.length);
          setLoadingStage('complete');
          return;
        }

        lastSearchKey.current = searchKey;

        setAllCanadaPoints([]);
        setRenderedCanadaPoints([]);
        setLoadingProgress(0);
        setTotalPointsToLoad(0);
        setLoadingStage('counting');

        try {
          const fetchedPoints = await fetchCanadaPointsForKey(
            searchKey,
            centerLocation!.lat,
            centerLocation!.lng,
            currentDisplayRadius as number,
            {
              onCount: (count) => {
                setTotalPointsToLoad(count);
                if (count > 0) setLoadingStage('fetching');
              },
              onProgress: (loaded) => setLoadingProgress(loaded),
            },
          );

          if (fetchedPoints.length === 0) {
            setLoadingStage('complete');
            return;
          }

          setAllCanadaPoints(fetchedPoints);
          setLoadingProgress(fetchedPoints.length);
          // Incremental `setRenderedCanadaPoints(prev => [...prev, batch])` was
          // O(n²) in total work copying arrays and dominated render time (~30s
          // for ~160k points). One transition update is far cheaper.
          startTransition(() => {
            setRenderedCanadaPoints(fetchedPoints);
            setLoadingStage('complete');
          });
        } catch (err: any) {
          console.error("Error fetching Canadian postal codes:", err);
          toast.error(`Failed to load Canadian postal codes: ${err.message}`);
          setLoadingStage('idle');
        }
      } else {
        // USA logic
        if (allGeoJsonData) {
          setLoadingStage('complete');
          return;
        }
        
        setLoadingStage('fetching');
        try {
          const geoJson = usGeoJsonData;
          if (!geoJson || !geoJson.features) throw new Error("US GeoJSON is missing or invalid.");
          
          const processedFeatures = geoJson.features.map((feature: any) => {
            const newFeature = JSON.parse(JSON.stringify(feature));
            const lat = parseFloat(feature.properties.INTPTLAT20);
            const lng = parseFloat(feature.properties.INTPTLON20);
            newFeature.properties.calculated_centroid = { lat: isNaN(lat) ? null : lat, lng: isNaN(lng) ? null : lng };
            return newFeature;
          });
          setAllGeoJsonData({ type: 'FeatureCollection', features: processedFeatures });
        } catch (error: any) {
          setDataError(error.message);
        } finally {
          setLoadingStage('complete');
        }
      }
    };
    loadAndRenderData();
  }, [isCanada, centerLocation, currentDisplayRadius, allGeoJsonData, canadaDisplayMode]);

  // Background prefetch: while the user is in FSA mode, opportunistically
  // fetch the postal-code points for the current (lat, lng, radius) into
  // the module-level cache so flipping to "Postal codes" is instant.
  //
  // Carefully gated to avoid competing with the critical-path queries
  // that the page also makes on first load (FSA totals,
  // get_global_territory_statuses, the installer's own zip-codes RPC):
  //   * never fires while fsaTotalPostalCounts is still loading
  //   * waits a fixed 5s after gating clears so the initial render and
  //     map style passes settle first
  //   * scheduled via requestIdleCallback as a final back-off, so the
  //     fetch only kicks off when the browser is otherwise idle
  //
  // No React state is touched here — the live load effect above will
  // read straight from the module-level cache when the user toggles to
  // Postal codes mode.
  useEffect(() => {
    if (!isCanada) return;
    if (canadaDisplayMode !== 'fsa') return;
    if (fsaTotalPostalCountsLoading) return;
    if (!centerLocation?.lat || !centerLocation?.lng) return;
    if (currentDisplayRadius === 'all') return;

    const searchKey = `${centerLocation.lat}-${centerLocation.lng}-${currentDisplayRadius}`;
    if (canadaPointsCache.has(searchKey)) return;
    if (canadaPointsInFlight.has(searchKey)) return;

    let cancelled = false;
    let cancelIdle: (() => void) | null = null;
    const timer = setTimeout(() => {
      if (cancelled) return;
      cancelIdle = scheduleIdle(() => {
        if (cancelled) return;
        void fetchCanadaPointsForKey(
          searchKey,
          centerLocation.lat as number,
          centerLocation.lng as number,
          currentDisplayRadius as number,
        ).catch(() => {
          // Background prefetch — swallow errors. The live load will
          // surface the real error if/when the user toggles.
        });
      });
    }, 5000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      cancelIdle?.();
    };
  }, [
    isCanada,
    canadaDisplayMode,
    fsaTotalPostalCountsLoading,
    centerLocation,
    currentDisplayRadius,
  ]);

  const filteredGeoJsonData = useMemo(() => {
    const geoJsonToUse = isCanada ? allCanadaGeoJsonData : allGeoJsonData;
    
    if (!geoJsonToUse || !centerLocation?.lat || !centerLocation.lng || currentDisplayRadius === 'all') {
      return geoJsonToUse;
    }
    
    const radius = typeof currentDisplayRadius === 'number' ? currentDisplayRadius : DEFAULT_DISPLAY_RADIUS_MILES;
    const filteredFeatures = geoJsonToUse.features.filter((feature: any) => {
      let centroid = getCentroid(feature);
      
      if (centroid.lat && centroid.lng) {
        const distance = calculateDistance(centerLocation.lat!, centerLocation.lng!, centroid.lat, centroid.lng);
        // Use 150 miles as a generous buffer for GeoJSON filtering if it's the management page
        const bufferRadius = isTerritoryManagementPage ? 250 : radius;
        return distance <= bufferRadius;
      }
      return false;
    });
    return { ...geoJsonToUse, features: filteredFeatures };
  }, [allGeoJsonData, allCanadaGeoJsonData, isCanada, centerLocation, currentDisplayRadius, isTerritoryManagementPage]);

  // Per-FSA aggregates of THIS installer's selected postals. Lets us paint
  // each Canadian FSA based on whether all of its assigned postals are
  // free, all are paid, or it's a mix — and replaces the old O(N) scan that
  // ran inside getGeoJsonStyle for every FSA polygon, every restyle.
  const fsaSelectionAggregates = useMemo(() => {
    if (!isCanada) return null;
    const map = new Map<string, { free: number; paid: number }>();
    for (const sel of selectedZipCodes) {
      const fsa = sel.zipCode.substring(0, 3).toUpperCase();
      let entry = map.get(fsa);
      if (!entry) {
        entry = { free: 0, paid: 0 };
        map.set(fsa, entry);
      }
      if (sel.assignedStatus === 'Approved') entry.free++;
      else if (sel.assignedStatus === 'Needs Approval') entry.paid++;
    }
    return map;
  }, [isCanada, selectedZipCodes]);

  // Same shape, but for the global heatmap on /territories. Keyed off
  // territoryStatuses (which is global across all installers there).
  const fsaTerritoryAggregates = useMemo(() => {
    if (!isCanada || !isTerritoryManagementPage) return null;
    const map = new Map<string, { free: number; paid: number }>();
    territoryStatuses.forEach((status, postal) => {
      const fsa = postal.substring(0, 3).toUpperCase();
      let entry = map.get(fsa);
      if (!entry) {
        entry = { free: 0, paid: 0 };
        map.set(fsa, entry);
      }
      if (status === 'Approved') entry.free++;
      else if (status === 'Needs Approval') entry.paid++;
    });
    return map;
  }, [isCanada, isTerritoryManagementPage, territoryStatuses]);

  const getGeoJsonStyle = useCallback((zipCode: string): L.PathOptions => {
    // ---- Canada branch (FSA polygons) ---------------------------------------
    // Each FSA may contain dozens or hundreds of 6-character postal codes.
    // We have two pieces of information:
    //   * fsaSelectionAggregates  - how many of this installer's assignments
    //                               in this FSA are Free vs Paid.
    //   * fsaTotalPostalCounts    - the total postal codes that exist in
    //                               this FSA across the whole DB.
    //
    // From those we classify the FSA as one of:
    //   solid green  - assigned == total AND all free
    //   solid orange - assigned == total AND all paid
    //   stripe (orange/green) - fully covered but mixed Free/Paid
    //   stripe (white/green)  - partial coverage, all assigned Free
    //   stripe (white/orange) - partial coverage, all assigned Paid
    //   stripe (orange/green) - partial coverage AND mixed
    //
    // Falls back to the previous "any assigned -> solid" behaviour only if
    // we don't yet know the FSA total (data still loading).
    if (isCanada) {
      // While the FSA totals are still loading, treat any-assigned as solid
      // (best-effort optimistic colouring) so we don't flash every FSA into
      // the partial-coverage stripes for a few seconds before snapping back
      // to solid. The sticky tooltip + the small "refining coverage" badge
      // in the corner indicate that the breakdown is still being refined.
      const totalsKnown = !fsaTotalPostalCountsLoading;

      const sel = fsaSelectionAggregates?.get(zipCode);
      if (sel) {
        const total = fsaTotalPostalCounts?.get(zipCode);
        const assigned = sel.free + sel.paid;
        // Allow a 1% tolerance to absorb residual data quirks in
        // canadian_postal_codes (rare format variants the SQL normalizer
        // can't fully collapse, special-purpose codes the installer would
        // never service, etc.). 99% covered with all-uniform status reads
        // as fully covered.
        const isFullyCovered =
          !totalsKnown ||
          (total != null && (assigned >= total || assigned / total >= 0.99));
        const isMixed = sel.free > 0 && sel.paid > 0;

        if (isFullyCovered && !isMixed) {
          if (sel.free > 0) {
            return { fillColor: '#22C55E', fillOpacity: 0.45, color: '#166534', weight: 1.5, opacity: 0.75, interactive: true };
          }
          return { fillColor: '#F97316', fillOpacity: 0.45, color: '#9A3412', weight: 1.5, opacity: 0.75, interactive: true };
        }

        // Anything else is a "miss" of some kind: partial coverage and/or
        // mixed statuses. Pattern conveys the kind.
        const partialRatio = total != null && total > 0 ? assigned / total : 0.5;
        const pd = partialDensityFromRatio(partialRatio);
        if (isMixed) {
          return { fillColor: 'url(#fsa-mixed-pattern)', fillOpacity: 1, color: '#9A3412', weight: 1.5, opacity: 0.85, interactive: true };
        }
        if (sel.free > 0) {
          return { fillColor: `url(#fsa-partial-free-pattern-${pd})`, fillOpacity: 1, color: '#166534', weight: 1.5, opacity: 0.75, interactive: true };
        }
        return { fillColor: `url(#fsa-partial-paid-pattern-${pd})`, fillOpacity: 1, color: '#9A3412', weight: 1.5, opacity: 0.75, interactive: true };
      }

      if (isTerritoryManagementPage) {
        const t = fsaTerritoryAggregates?.get(zipCode);
        if (t) {
          const total = fsaTotalPostalCounts?.get(zipCode);
          const assigned = t.free + t.paid;
          const isFullyCovered =
            !totalsKnown ||
            (total != null && (assigned >= total || assigned / total >= 0.99));
          const isMixed = t.free > 0 && t.paid > 0;

          if (isFullyCovered && !isMixed) {
            if (t.free > 0) return { fillColor: '#D4EDDA', fillOpacity: 0.5, color: '#166534', weight: 1, opacity: 0.5, interactive: true };
            return { fillColor: '#FFF3CD', fillOpacity: 0.5, color: '#9A3412', weight: 1, opacity: 0.5, interactive: true };
          }
          const tPartialRatio = total != null && total > 0 ? assigned / total : 0.5;
          const tpd = partialDensityFromRatio(tPartialRatio);
          if (isMixed) return { fillColor: 'url(#fsa-mixed-pattern)', fillOpacity: 0.55, color: '#9A3412', weight: 1, opacity: 0.5, interactive: true };
          if (t.free > 0) return { fillColor: `url(#fsa-partial-free-pattern-${tpd})`, fillOpacity: 0.7, color: '#166534', weight: 1, opacity: 0.5, interactive: true };
          return { fillColor: `url(#fsa-partial-paid-pattern-${tpd})`, fillOpacity: 0.7, color: '#9A3412', weight: 1, opacity: 0.5, interactive: true };
        }
      }

      return { fillColor: '#F0F0F0', weight: 1, opacity: 0.15, color: '#94a3b8', fillOpacity: 0, interactive: true };
    }

    // ---- US branch (ZCTA polygons) ------------------------------------------
    // Each ZCTA is one zip code, so per-postal lookups are exact, no aggregation.
    const isHighlighted = highlightedZipCodes.get(zipCode);
    const selectedMatch = selectedZipCodes.find(z => z.zipCode === zipCode);
    const isSelected = !!selectedMatch;
    const status = isSelected ? selectedMatch?.assignedStatus : territoryStatuses.get(zipCode);

    let fillColor = '#F0F0F0';
    let color = '#94a3b8';
    let fillOpacity = 0;
    let weight = 1;
    let opacity = 0.15;

    if (isHighlighted === 'green' || (isSelected && status === 'Approved')) {
      fillColor = '#22C55E';
      fillOpacity = 0.3;
      color = '#166534';
      weight = 2;
      opacity = 0.6;
    } else if (isHighlighted === 'orange' || (isSelected && status === 'Needs Approval')) {
      fillColor = '#F97316';
      fillOpacity = 0.3;
      color = '#9A3412';
      weight = 2;
      opacity = 0.6;
    } else if (isTerritoryManagementPage) {
      if (status === 'Approved') {
        fillColor = '#D4EDDA';
        fillOpacity = 0.5;
        color = '#166534';
        opacity = 0.5;
      } else if (status === 'Needs Approval') {
        fillColor = '#FFF3CD';
        fillOpacity = 0.5;
        color = '#9A3412';
        opacity = 0.5;
      }
    }
    return { fillColor, weight, opacity, color, fillOpacity, interactive: true };
  }, [
    isCanada,
    isTerritoryManagementPage,
    fsaSelectionAggregates,
    fsaTerritoryAggregates,
    fsaTotalPostalCounts,
    fsaTotalPostalCountsLoading,
    highlightedZipCodes,
    selectedZipCodes,
    territoryStatuses,
  ]);

  const onEachFeature = (feature: any, layer: L.Layer) => {
    const zipCode = getPostalCode(feature, isCanada);
    const stateProvince = getRegion(feature, isCanada);
    const isFsaBulkClickable =
      isCanada && canadaDisplayMode === 'fsa' && !!onFsaBulkAction;
    layer.off('click');
    layer.on({
      click: (e: any) => {
        L.DomEvent.stopPropagation(e);
        if (isBulkSelecting) return;
        if (isFsaBulkClickable) {
          openFsaBulkPopupRef.current?.(zipCode, stateProvince, e?.latlng ?? null);
          return;
        }
        onZipCodeClickRef.current(zipCode, stateProvince);
      },
    });
    const label = isCanada ? 'FSA' : 'ZIP';
    let tooltipHtml = `<div><strong>${label}: ${zipCode}</strong>`;
    if (stateProvince && stateProvince !== 'Unknown') tooltipHtml += ` (${stateProvince})`;
    tooltipHtml += `</div>`;

    // Action-focused coverage breakdown for Canadian FSAs. Headlines the
    // missing count (the most useful number for the bulk-action popup),
    // then breaks down free / paid below. Hover for a quick read; click
    // to open the bulk-action popup.
    if (isCanada) {
      const sel = fsaSelectionAggregates?.get(zipCode);
      const total = fsaTotalPostalCounts?.get(zipCode);
      if (sel) {
        const assigned = sel.free + sel.paid;
        if (total != null && total > 0) {
          const missing = Math.max(0, total - assigned);
          if (missing === 0) {
            const statusLine =
              sel.free > 0 && sel.paid > 0
                ? `${sel.free.toLocaleString()} free &middot; ${sel.paid.toLocaleString()} paid`
                : sel.free > 0
                  ? 'All assigned are Free'
                  : 'All assigned are Paid';
            tooltipHtml += `<div style="margin-top:2px">&#10003; All ${total.toLocaleString()} postals assigned</div>`;
            tooltipHtml += `<div style="color:#475569">${statusLine}</div>`;
          } else {
            tooltipHtml += `<div style="margin-top:2px"><strong>${missing.toLocaleString()} unassigned</strong> of ${total.toLocaleString()}</div>`;
            const partsAssigned: string[] = [];
            if (sel.free > 0) partsAssigned.push(`${sel.free.toLocaleString()} free`);
            if (sel.paid > 0) partsAssigned.push(`${sel.paid.toLocaleString()} paid`);
            tooltipHtml += `<div style="color:#475569">${partsAssigned.join(' &middot; ')}</div>`;
          }
        } else {
          const partsAssigned: string[] = [];
          if (sel.free > 0) partsAssigned.push(`${sel.free.toLocaleString()} free`);
          if (sel.paid > 0) partsAssigned.push(`${sel.paid.toLocaleString()} paid`);
          tooltipHtml += `<div style="margin-top:2px">${assigned.toLocaleString()} assigned (${partsAssigned.join(' &middot; ')})</div>`;
        }
      } else if (total != null && total > 0) {
        tooltipHtml += `<div style="margin-top:2px;color:#475569">${total.toLocaleString()} postals &middot; none assigned</div>`;
      }
      if (isFsaBulkClickable) {
        tooltipHtml += `<div style="margin-top:4px;color:#64748b;font-size:0.7rem">Click to bulk-assign</div>`;
      }
      if (isTerritoryManagementPage && !sel) {
        const t = fsaTerritoryAggregates?.get(zipCode);
        if (t) {
          const assigned = t.free + t.paid;
          if (total != null && total > 0) {
            const pct = Math.min(100, Math.round((assigned / total) * 1000) / 10);
            tooltipHtml += `<div>${assigned.toLocaleString()} / ${total.toLocaleString()} postals assigned globally (${pct}%)</div>`;
          } else {
            tooltipHtml += `<div>${assigned.toLocaleString()} postals assigned globally</div>`;
          }
        }
      }
    }

    layer.bindTooltip(tooltipHtml, { permanent: false, direction: 'auto', sticky: true });
  };

  // The key change is the only reliable way to force React-Leaflet GeoJSON to re-draw colors
  const geoJsonStyleKey = useMemo(() => {
    // Include `fsaCountsKey` so that when the FSA total-postal counts finish
    // loading, the polygon layer rebuilds with the more accurate styling.
    const fsaCountsKey = fsaTotalPostalCounts ? fsaTotalPostalCounts.size : 0;
    const fsaLoadingKey = fsaTotalPostalCountsLoading ? 'l' : 'r';
    return `${currentDisplayRadius}-${isBulkSelecting}-${refreshKey}-${country}-${fsaCountsKey}-${fsaLoadingKey}`;
  }, [currentDisplayRadius, isBulkSelecting, refreshKey, country, fsaTotalPostalCounts, fsaTotalPostalCountsLoading]);

  const radiiConfig = isCanada ? [{ radius: 35, color: '#22c55e' }, { radius: 50, color: '#facc15' }, { radius: 75, color: '#f97316' }] 
                               : [{ radius: 25, color: '#22c55e' }, { radius: 50, color: '#facc15' }, { radius: 100, color: '#f97316' }, { radius: 150, color: '#ef4444' }];
  const unit = isCanada ? 'km' : 'miles';
  const conversionFactor = isCanada ? 1000 : 1609.34;

  if (dataError && !isCanada) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-red-100 text-red-800 p-4 border-4 border-dashed border-red-500 text-center">
        <div><h3 className="font-bold text-lg mb-2">Map Data Error</h3><p>{dataError}</p></div>
      </div>
    );
  }

  // Whether the new FSA aggregate styling has anything to show. Used to
  // decide whether to render the small legend in the corner.
  const hasAggregateColoredFsas = useMemo(() => {
    if (!isCanada) return false;
    const sel = fsaSelectionAggregates;
    if (sel && sel.size > 0) return true;
    const t = fsaTerritoryAggregates;
    return !!t && t.size > 0;
  }, [isCanada, fsaSelectionAggregates, fsaTerritoryAggregates]);

  return (
    <div className="relative h-full w-full">
    <FsaFillPatternDefs />
    <MapContainer
      center={isCanada ? [56.1304, -106.3468] : [39.8283, -98.5795]}
      zoom={4}
      minZoom={3}
      maxZoom={18}
      scrollWheelZoom={true}
      className="h-full w-full rounded-lg overflow-hidden shadow-sm"
      renderer={L.canvas()}
    >
      <TileLayer
        attribution='&copy; CARTO'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <Pane name="polygons" style={{ zIndex: 450 }} />
      {(loadingStage === 'counting' || loadingStage === 'fetching') && (
        <LoadingOverlay
          progress={loadingProgress}
          total={totalPointsToLoad}
          stage={loadingStage}
          footnote={
            isCanada && canadaDisplayMode === 'postal-codes'
              ? 'This count is postal points inside the map radius for drawing dots. It is not the number of territories assigned to this installer.'
              : undefined
          }
        />
      )}
      {isCanada && canadaDisplayMode === 'postal-codes' && !fsaEditTarget && renderedCanadaPoints.length > 0 && (
        renderedCanadaPoints.map(point => {
          const postalCode = point.POSTAL_CODE;
          // Normalize for the highlight lookup so a stored "T4X2J3" matches
          // a point whose POSTAL_CODE is "T4X 2J3" (and vice versa).
          const status = highlightedZipCodes.get(
            (postalCode ?? '').toUpperCase().replace(/\s+/g, ''),
          );
          let color = '#3b82f6';
          let fillOpacity = 0.5;
          let pointRadius = 2;
          if (status === 'green') { color = '#22c55e'; fillOpacity = 0.7; pointRadius = 3; }
          else if (status === 'orange') { color = '#f97316'; fillOpacity = 0.7; pointRadius = 3; }
          return (
            <CircleMarker key={point.id} center={[point.LATITUDE, point.LONGITUDE]} radius={pointRadius} pathOptions={{ color, fillColor: color, fillOpacity, weight: 1 }} eventHandlers={{ click: () => onZipCodeClick(postalCode, point.PROVINCE_ABBR) }}>
              <Tooltip>{postalCode}</Tooltip>
            </CircleMarker>
          );
        })
      )}
      {filteredGeoJsonData && !(isCanada && canadaDisplayMode === 'postal-codes') && !fsaEditTarget && (
        <GeoJSON
          key={geoJsonStyleKey}
          ref={geoJsonLayerRef}
          data={filteredGeoJsonData as any}
          style={(feature) => getGeoJsonStyle(getPostalCode(feature, isCanada))}
          onEachFeature={onEachFeature}
          pane="polygons"
          // Canadian FSA fills can be SVG paint servers (the "mixed" stripe
          // pattern). Patterns require an SVG renderer; the canvas renderer
          // would silently drop them. US ZCTAs don't use patterns and can
          // ride the MapContainer's default canvas renderer, which is faster.
          {...(isCanada ? { renderer: svgPolygonRenderer } : {})}
        />
      )}
      {/* FSA edit mode — render only the focused FSA polygon as an
          emphasized outline (no fill, no click handler) so the user
          can see the boundary they're editing inside, then render
          the per-postal dots on top. The normal polygon layer is
          suppressed via the `!fsaEditTarget` gate above so nothing
          else competes for the click. */}
      {fsaEditTarget && fsaEditFeature && (
        <GeoJSON
          key={`fsa-edit-outline-${fsaEditTarget.fsa}`}
          data={fsaEditFeature as any}
          style={() => ({
            color: '#0ea5e9',
            weight: 3,
            opacity: 0.95,
            fillColor: '#0ea5e9',
            fillOpacity: 0.05,
            interactive: false,
          })}
          pane="polygons"
          renderer={svgPolygonRenderer}
        />
      )}
      {fsaEditTarget && fsaEditPostals.length > 0 && fsaEditPostals.map(point => {
        if (point.latitude == null || point.longitude == null) return null;
        const postalKey = (point.postal_code ?? '').toUpperCase().replace(/\s+/g, '');
        const isEdge = fsaEditEdgePostalCodes.has(postalKey);
        const status = highlightedZipCodes.get(postalKey);
        // Larger dots than the radius-fetch postal mode (we're zoomed
        // into a single FSA so there's room) and grey-by-default so
        // unassigned postals are still discoverable.
        let color = '#94a3b8'; // slate-400 for unassigned
        let fillOpacity = 0.7;
        let pointRadius = 5;
        let weight = 1;
        if (status === 'green') { color = '#16a34a'; fillOpacity = 0.85; pointRadius = 6; weight = 1.5; }
        else if (status === 'orange') { color = '#ea580c'; fillOpacity = 0.85; pointRadius = 6; weight = 1.5; }
        const pathOptions = isEdge
          ? {
              color,
              fillColor: '#ffffff',
              fillOpacity: 0.92,
              weight: 2,
              dashArray: '4,3',
              opacity: 0.9,
            }
          : { color, fillColor: color, fillOpacity, weight };
        return (
          <CircleMarker
            key={`fsa-edit-${point.postal_code}`}
            center={[point.latitude, point.longitude]}
            radius={isEdge ? pointRadius + 1 : pointRadius}
            pathOptions={pathOptions}
            eventHandlers={{
              click: () => onZipCodeClick(point.postal_code, point.province_abbr || fsaEditTarget.stateProvince),
            }}
          >
            <Tooltip>
              {point.postal_code}
              {isEdge && (
                <span className="block text-[10px] text-gray-500 font-normal mt-0.5">
                  Edge — coordinate outside FSA boundary
                </span>
              )}
            </Tooltip>
          </CircleMarker>
        );
      })}
      {fsaEditTarget && fsaEditBounds && (
        <MapBoundsFitter bounds={fsaEditBounds} boundsKey={fsaEditTarget.fsa} />
      )}
      {centerLocation?.lat != null && centerLocation?.lng != null && (
        <Marker position={[centerLocation.lat, centerLocation.lng]} icon={createStarIcon()}><Popup>Installer Location</Popup></Marker>
      )}
      {showRadiusCircles && centerLocation?.lat != null && centerLocation?.lng != null && (
        radiiConfig.map(({ radius, color }) => {
          const centerPoint = turf.point([centerLocation.lng!, centerLocation.lat!]);
          const radiusInKmForLabel = isCanada ? radius : radius * 1.60934;
          const topPoint = turf.destination(centerPoint, radiusInKmForLabel, 0, { units: 'kilometers' });
          const labelPosition: [number, number] = [topPoint.geometry.coordinates[1], topPoint.geometry.coordinates[0]];
          const labelIcon = L.divIcon({ className: 'radius-label-icon', html: `<div>${radius} ${unit}</div>`, iconAnchor: [25, 10] });
          return (
            <React.Fragment key={radius}>
              <Circle center={[centerLocation.lat!, centerLocation.lng!]} radius={radius * conversionFactor} pathOptions={{ color: color, fillOpacity: 0, weight: 2, dashArray: '5, 10', interactive: false }} />
              <Marker position={labelPosition} icon={labelIcon} interactive={false} />
            </React.Fragment>
          );
        })
      )}
      {/* MapUpdater snaps the view to the installer location on
          mount/changes. Suppress it while in FSA edit mode so the
          MapBoundsFitter's fitBounds isn't immediately stomped on
          by a re-centre. */}
      {!fsaEditTarget && (
        <MapUpdater centerLocation={centerLocation} isOpen={isOpen} country={country} />
      )}
      <MapInteractionHandler
        isBulkSelecting={isBulkSelecting}
        geoJsonData={allGeoJsonData}
        onBulkSelectionComplete={onBulkSelectionComplete}
        isCanada={isCanada}
        publicAuth={publicAuth}
        fsaEditPostals={fsaEditTarget ? fsaEditPostals : undefined}
      />
      {fsaBulkPopup && onFsaBulkAction && (
        <Popup
          position={fsaBulkPopup.latlng}
          eventHandlers={{ remove: () => setFsaBulkPopup(null) }}
          autoPan
          closeButton
          closeOnClick={false}
          minWidth={260}
          className="fsa-bulk-popup"
        >
          <FsaBulkActionPopupContents
            fsa={fsaBulkPopup.fsa}
            stateProvince={fsaBulkPopup.stateProvince}
            free={fsaSelectionAggregates?.get(fsaBulkPopup.fsa)?.free ?? 0}
            paid={fsaSelectionAggregates?.get(fsaBulkPopup.fsa)?.paid ?? 0}
            total={fsaTotalPostalCounts?.get(fsaBulkPopup.fsa)}
            onAction={async (action) => {
              await onFsaBulkAction(
                fsaBulkPopup.fsa,
                action,
                fsaBulkPopup.stateProvince,
              );
            }}
            onClose={() => setFsaBulkPopup(null)}
            onEnterEdit={() => {
              setFsaEditTarget({
                fsa: fsaBulkPopup.fsa,
                stateProvince: fsaBulkPopup.stateProvince,
              });
            }}
          />
        </Popup>
      )}
    </MapContainer>
    {isCanada && canadaDisplayMode === 'fsa' && !fsaEditTarget && fsaTotalPostalCountsLoading && (
      <div
        className="absolute inset-0 z-[1000] flex items-center justify-center pointer-events-none"
        role="status"
        aria-live="polite"
      >
        <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px]" aria-hidden="true" />
        <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 px-5 py-4 flex items-center gap-3 max-w-sm pointer-events-auto">
          <svg
            className="animate-spin h-5 w-5 text-gray-700 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <div className="text-sm">
            <div className="font-semibold text-gray-900">Loading territories&hellip;</div>
            <div className="text-gray-600 text-xs mt-0.5">
              Coverage is approximate until this finishes.
            </div>
          </div>
        </div>
      </div>
    )}
    {isCanada && canadaDisplayMode === 'fsa' && !fsaEditTarget && hasAggregateColoredFsas && (
      <div
        className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur-sm rounded-md shadow-md border border-gray-200 px-3 py-2 text-xs text-gray-800 max-w-xs"
        role="note"
        aria-label="FSA color legend"
      >
        <p className="font-semibold mb-1.5">FSA color key</p>
        <ul className="space-y-1">
          <li className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-5 rounded-sm border border-green-700"
              style={{ backgroundColor: '#22C55E', opacity: 0.6 }}
            />
            <span>Fully covered &mdash; all free</span>
          </li>
          <li className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-5 rounded-sm border border-orange-700"
              style={{ backgroundColor: '#F97316', opacity: 0.6 }}
            />
            <span>Fully covered &mdash; all paid</span>
          </li>
          <li className="flex items-center gap-2">
            <svg
              width="20"
              height="12"
              viewBox="0 0 20 12"
              aria-hidden="true"
              className="rounded-sm border border-orange-700"
            >
              <rect width="20" height="12" fill="#F97316" fillOpacity={0.45} />
              <line x1="-2" y1="-2" x2="22" y2="14" stroke="#16A34A" strokeWidth={2.5} strokeOpacity={0.5} />
              <line x1="-2" y1="6" x2="22" y2="22" stroke="#16A34A" strokeWidth={2.5} strokeOpacity={0.5} />
            </svg>
            <span>Mix of free and paid</span>
          </li>
          <li className="flex items-center gap-2">
            <svg
              width="20"
              height="12"
              viewBox="0 0 20 12"
              aria-hidden="true"
              className="rounded-sm border border-green-700"
            >
              <rect width="20" height="12" fill="#FFFFFF" />
              <line x1="-2" y1="-2" x2="22" y2="14" stroke="#16A34A" strokeWidth={2.5} strokeOpacity={0.5} />
              <line x1="-2" y1="6" x2="22" y2="22" stroke="#16A34A" strokeWidth={2.5} strokeOpacity={0.5} />
            </svg>
            <span>Partial coverage &mdash; assigned ones are free</span>
          </li>
          <li className="flex items-center gap-2">
            <svg
              width="20"
              height="12"
              viewBox="0 0 20 12"
              aria-hidden="true"
              className="rounded-sm border border-orange-700"
            >
              <rect width="20" height="12" fill="#FFFFFF" />
              <line x1="-2" y1="-2" x2="22" y2="14" stroke="#F97316" strokeWidth={2.5} strokeOpacity={0.5} />
              <line x1="-2" y1="6" x2="22" y2="22" stroke="#F97316" strokeWidth={2.5} strokeOpacity={0.5} />
            </svg>
            <span>Partial coverage &mdash; assigned ones are paid</span>
          </li>
        </ul>
      </div>
    )}
    {isCanada && !fsaEditTarget && (
      <div
        className="absolute top-3 right-3 z-[1000] bg-white rounded-md shadow-md border border-gray-200 p-1 flex gap-1 text-xs"
        role="group"
        aria-label="Map detail level"
      >
        <button
          type="button"
          onClick={() => setCanadaDisplayMode('fsa')}
          className={cn(
            'px-3 py-1.5 rounded font-medium transition-colors',
            canadaDisplayMode === 'fsa'
              ? 'bg-gray-900 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          )}
          aria-pressed={canadaDisplayMode === 'fsa'}
          title="Show 3-character FSA areas only (faster)"
        >
          FSA
        </button>
        <button
          type="button"
          onClick={() => setCanadaDisplayMode('postal-codes')}
          className={cn(
            'px-3 py-1.5 rounded font-medium transition-colors',
            canadaDisplayMode === 'postal-codes'
              ? 'bg-gray-900 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          )}
          aria-pressed={canadaDisplayMode === 'postal-codes'}
          title="Show full 6-character postal codes (slower; large territories take time to load)"
        >
          Postal codes
        </button>
      </div>
    )}
    {/* FSA edit-mode focus banner. Pins to the top of the map and
        gives the user (a) a live read-out of their selections inside
        this FSA, (b) an escape hatch back to the bulk popup, and (c)
        a one-click exit. The whole banner is pointer-events-auto so
        clicks inside don't fall through to the map below. */}
    {fsaEditTarget && (
      <div
        className="absolute top-3 left-1/2 -translate-x-1/2 z-[1100] max-w-[calc(100%-1.5rem)]"
        role="region"
        aria-label={`Editing FSA ${fsaEditTarget.fsa}`}
      >
        <div className="bg-white rounded-md shadow-lg border border-sky-300 px-3 py-2 sm:px-4 sm:py-2.5 flex items-center gap-3 text-xs sm:text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <Pencil className="h-4 w-4 text-sky-600 flex-shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <div className="font-semibold text-gray-900 leading-tight">
                Editing FSA {fsaEditTarget.fsa}
                {fsaEditTarget.stateProvince && fsaEditTarget.stateProvince !== 'Unknown' && (
                  <span className="text-gray-500 font-normal"> · {fsaEditTarget.stateProvince}</span>
                )}
              </div>
              <div className="text-[11px] sm:text-xs text-gray-600 mt-0.5 leading-tight">
                {fsaEditLoading ? (
                  <span className="inline-flex items-center gap-1 text-gray-500">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    Loading postals…
                  </span>
                ) : (
                  <>
                    <span className="text-emerald-700 font-medium">{fsaEditCounts.free.toLocaleString()}</span> free
                    <span className="text-gray-300 mx-1">·</span>
                    <span className="text-orange-700 font-medium">{fsaEditCounts.paid.toLocaleString()}</span> paid
                    {fsaEditCounts.total > 0 && (
                      <>
                        <span className="text-gray-300 mx-1">·</span>
                        <span className="text-gray-500">{fsaEditCounts.unassigned.toLocaleString()} unassigned</span>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => setFsaEditTarget(null)}
              className="h-7 px-2.5 inline-flex items-center gap-1 rounded text-xs font-semibold bg-sky-600 text-white hover:bg-sky-700"
              title="Exit FSA edit mode (Esc)"
            >
              <X className="h-3 w-3" aria-hidden="true" />
              Done
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
};

export default memo(TerritoryMap);