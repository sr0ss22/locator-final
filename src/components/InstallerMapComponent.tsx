import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { GestureHandling } from 'leaflet-gesture-handling';
import { Installer, InstallerBrand, InstallerCertification, InstallerSkill } from '@/types/installer';
import { useCountrySettings } from "@/hooks/useCountrySettings";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SKILL_ICON_MAP } from "@/lib/skillIcons";
import CoverageOverlay from "@/components/CoverageOverlay";
import CoverageLegend from "@/components/CoverageLegend";
import type { CoverageCounts } from "@/lib/coverageStyle";

// Fix for default Leaflet icons with Webpack/Vite
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

// Mobile gesture-handling plugin: makes single-finger touches scroll
// the page (not the map) and shows a "Use two fingers to move the map"
// overlay until the user does. The plugin's own CSS is imported in
// src/main.tsx so it loads once for the app.
import 'leaflet-gesture-handling/dist/leaflet-gesture-handling.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
});

// Register the gesture-handling plugin once at module load. Safe to
// call repeatedly; Leaflet de-dupes the handler under the same key.
(L.Map as any).addInitHook('addHandler', 'gestureHandling', GestureHandling);

// Reads coarse-pointer (touch) capability at component-mount time.
// Avoided a viewport-width media query because tablets are wide enough
// to behave like desktop but still want two-finger pan, and a hover-
// capable laptop in tablet mode should keep desktop scroll-zoom.
function detectCoarsePointer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

interface CoverageOverlayConfig {
  enabled: boolean;
  defaultVisible: boolean;
  searchCenter: { lat: number | null; lng: number | null };
  searchRadiusMiles: number;
  brands: InstallerBrand[];
  skills: InstallerSkill[];
  certifications: InstallerCertification[];
  acceptsShipments: boolean;
  // When non-null/empty, scopes the aggregate to JUST these installers.
  // Backs the per-card "View coverage" mode on the internal locator.
  installerIds?: string[] | null;
  // Optional label rendered next to the legend (e.g. "Acme Installs")
  // when the overlay is scoped to a single installer.
  filterLabel?: string | null;
  // Called when the user clicks the "X" on the filter chip.
  onClearFilter?: () => void;
  onZipClick?: (
    zip: string,
    counts: CoverageCounts,
    meta: { country: "USA" | "Canada"; totalPostalCodes: number | null },
  ) => void;
  // Fired when the user clicks the search-icon button in the legend
  // (opens the coverage detail panel in "search mode"). Optional;
  // when omitted the legend hides the button.
  onSearchClick?: () => void;
}

interface InstallerMapProps {
  userLocation: { lat: number | null; lng: number | null } | null;
  installers: (Installer & { distance?: number })[];
  selectedInstallerId: string | null;
  isPublicView?: boolean;
  coverageOverlay?: CoverageOverlayConfig;
}

const InstallerMapComponent: React.FC<InstallerMapProps> = ({ userLocation, installers, selectedInstallerId, isPublicView = false, coverageOverlay }) => {
  const mapRef = useRef<L.Map | null>(null);
  const [mounted, setMounted] = useState(false);
  const { distanceUnit, isCanada } = useCountrySettings();

  // Coverage overlay visibility (legend toggle). Falls back to false when
  // the overlay isn't configured at all so this hook always runs.
  const [coverageVisible, setCoverageVisible] = useState<boolean>(coverageOverlay?.defaultVisible ?? false);
  const [coverageLoading, setCoverageLoading] = useState<boolean>(false);

  // When the parent activates a per-installer filter, auto-show the
  // overlay so the user actually sees the result of the action. We
  // intentionally don't force-hide it again when the filter clears —
  // leaving the toggle in whatever state the user prefers.
  const hasInstallerFilter = !!(coverageOverlay?.installerIds && coverageOverlay.installerIds.length > 0);
  useEffect(() => {
    if (hasInstallerFilter && !coverageVisible) {
      setCoverageVisible(true);
    }
  }, [hasInstallerFilter, coverageVisible]);

  // Gesture-handling plugin is mount-time-only: Leaflet wires the
  // handler when the map is constructed, so we sample the pointer kind
  // once and pass it through. A desktop user resizing to mobile won't
  // hot-swap behavior, which is fine (and matches Google Maps).
  const [isTouchDevice] = useState<boolean>(detectCoarsePointer);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Custom icon for user location (blue star)
  const userIcon = L.divIcon({
    html: `<div class="relative flex items-center justify-center" style="width: 40px; height: 40px;">
            <svg stroke="currentColor" fill="#3b82f6" stroke-width="0" viewBox="0 0 24 24" height="40px" width="40px" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.27l-6.18 3.25L7 14.14l-5-4.87 7.91-1.01L12 2z"></path>
            </svg>
          </div>`,
    className: 'custom-div-icon',
    iconSize: [40, 40],
    iconAnchor: [20, 40], // Anchor at the bottom center of the star
    popupAnchor: [0, -35], // Adjust popup to appear above the star
  });

  // Custom icon for numbered installers. Pin shape + number now live
  // inside a single SVG so the number is perfectly aligned with the
  // pin head's hole. Prior implementation overlaid an HTML circle on
  // top of an SVG-with-hole, which left visible seams and made the
  // number look like its top was cut off at small sizes.
  //
  // Color rules: selected → sky blue; inactive → gray (so admins can
  // spot dormant accounts at a glance); otherwise → black. Selected
  // wins over inactive so click feedback isn't masked.
  const createNumberedIcon = (
    number: number,
    installerId: string,
    currentSelectedInstallerId: string | null,
    isInactive: boolean,
  ) => {
    let fillColor = '#000000';
    if (installerId === currentSelectedInstallerId) {
      fillColor = '#0EA5E9';
    } else if (isInactive) {
      fillColor = '#9CA3AF';
    }
    // Solid teardrop in the active color, with the number painted
    // directly on top in white. Scale text down for 2-/3-digit values
    // so the glyphs continue to fit inside the head circle.
    const label = String(number);
    const fontSize = label.length >= 3 ? 6 : label.length === 2 ? 7 : 8;
    return L.divIcon({
      html: `<div style="width: 48px; height: 48px;">
              <svg viewBox="0 0 24 24" height="48" width="48" xmlns="http://www.w3.org/2000/svg" aria-label="Map pin ${label}">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="${fillColor}"/>
                <text x="12" y="9.4" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="700" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" fill="#ffffff">${label}</text>
              </svg>
            </div>`,
      className: 'custom-div-icon',
      iconSize: [48, 48],
      iconAnchor: [24, 48], // Anchor at the tip of the pin
      popupAnchor: [0, -45], // Adjust popup to appear above the pin
    });
  };

  const MapUpdater = () => {
    const map = useMap();
    useEffect(() => {
      if (userLocation?.lat && userLocation?.lng && installers.length > 0) {
        const bounds = L.latLngBounds([]);
        bounds.extend([userLocation.lat, userLocation.lng]);
        installers.forEach(installer => {
          if (installer.latitude && installer.longitude) {
            bounds.extend([installer.latitude, installer.longitude]);
          }
        });
        map.fitBounds(bounds, { padding: [50, 50] });
      } else if (userLocation?.lat && userLocation?.lng) {
        map.setView([userLocation.lat, userLocation.lng], 10); // Zoom to user if no installers
      } else {
        const center: [number, number] = isCanada ? [56.1304, -106.3468] : [39.8283, -98.5795];
        map.setView(center, 4);
      }
    }, [map, userLocation, installers, isCanada]);

    // Effect to pan to selected installer
    useEffect(() => {
      if (selectedInstallerId) {
        const selectedInstaller = installers.find(inst => inst.id === selectedInstallerId);
        if (selectedInstaller && selectedInstaller.latitude && selectedInstaller.longitude) {
          map.flyTo([selectedInstaller.latitude, selectedInstaller.longitude], map.getZoom() || 12, {
            duration: 1.5, // Smooth animation
          });
        }
      }
    }, [selectedInstallerId, installers, map]);

    return null;
  };

  if (!mounted) {
    return <div className="h-full w-full flex items-center justify-center text-gray-500">Loading map...</div>;
  }

  const overlayActive = !!coverageOverlay?.enabled;
  const overlayCountry: 'USA' | 'Canada' = isCanada ? 'Canada' : 'USA';

  return (
    <div className="relative h-full w-full">
    <MapContainer
      center={userLocation?.lat && userLocation?.lng ? [userLocation.lat, userLocation.lng] : (isCanada ? [56.1304, -106.3468] : [39.8283, -98.5795])}
      zoom={userLocation?.lat && userLocation?.lng ? 10 : 4}
      scrollWheelZoom={true}
      // Plugin reads this option at construction time and registers
      // its own touch handler when true. We pass it only on coarse-
      // pointer devices so desktop scroll-to-zoom + click-drag stay
      // unchanged. Cast through `any` because react-leaflet's prop
      // types don't know about the plugin option.
      {...({
        gestureHandling: isTouchDevice,
        gestureHandlingOptions: {
          text: {
            touch: 'Use two fingers to move the map',
            scroll: 'Use ctrl + scroll to zoom',
            scrollMac: 'Use \u2318 + scroll to zoom',
          },
        },
      } as any)}
      className="h-full w-full"
      ref={mapRef}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      {overlayActive && coverageOverlay && (
        <CoverageOverlay
          country={overlayCountry}
          center={coverageOverlay.searchCenter}
          radiusMiles={coverageOverlay.searchRadiusMiles}
          brands={coverageOverlay.brands}
          skills={coverageOverlay.skills}
          certifications={coverageOverlay.certifications}
          acceptsShipments={coverageOverlay.acceptsShipments}
          installerIds={coverageOverlay.installerIds}
          enabled={coverageVisible}
          onZipClick={coverageOverlay.onZipClick}
          onLoadingChange={setCoverageLoading}
        />
      )}
      {userLocation?.lat && userLocation?.lng && (
        <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
          <Popup>Your Search Location</Popup>
        </Marker>
      )}
      {installers.map((installer, index) => {
        const displayDistance = installer.distance !== undefined && installer.distance !== null && installer.distance !== Infinity
          ? (distanceUnit === 'km' ? (installer.distance * 1.60934).toFixed(1) : installer.distance.toFixed(1))
          : undefined;
        const formattedDistanceFull = displayDistance ? `Distance: ${displayDistance} ${distanceUnit}` : undefined;
        const simplifiedAddress = `${installer.rawSupabaseData?.city || ''}, ${installer.rawSupabaseData?.state || ''} ${installer.zipCode || ''}`.trim();
        const pinNumber = index + 1;

        return installer.latitude && installer.longitude && (
          <Marker
            key={installer.id}
            position={[installer.latitude, installer.longitude]}
            icon={createNumberedIcon(
              pinNumber,
              installer.id,
              selectedInstallerId,
              // Only consider an installer "inactive" on the internal
              // locator. The public RPC excludes inactive installers
              // server-side AND doesn't return the is_active column at
              // all, so testing `is_active !== 1` would default every
              // public-view pin to gray. Gating on !isPublicView keeps
              // public pins black.
              !isPublicView && installer.rawSupabaseData?.is_active !== 1,
            )}
          >
            {isPublicView ? (
              // Public view: anonymized capabilities only. No header (pin
              // number and distance were taking up half the popup for no
              // real signal — the marker on the map already conveys "this
              // pin"). Brands and certs render as gray pill badges that
              // match the visual weight of the skill-icon row.
              <Popup
                className="public-installer-popup"
                maxWidth={280}
                minWidth={220}
                closeButton={false}
              >
                <div className="py-0.5">
                  <div className="space-y-1.5 text-xs leading-snug">
                    {installer.brands && installer.brands.length > 0 && (
                      <div>
                        <span className="font-medium text-gray-700 block mb-1">Brands</span>
                        <div className="flex flex-wrap gap-1.5">
                          {installer.brands.map((brand) => (
                            <span
                              key={brand}
                              className="inline-flex items-center h-6 px-2 rounded bg-gray-100 text-gray-700 text-[11px] font-medium"
                            >
                              {brand}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {installer.skills && installer.skills.length > 0 && (
                      <div>
                        <span className="font-medium text-gray-700 block mb-1">Skills</span>
                        <div className="flex flex-wrap gap-1.5">
                          {installer.skills.map((skill) => {
                            const Icon = SKILL_ICON_MAP[skill];
                            if (!Icon) return null;
                            return (
                              <Tooltip key={skill}>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    title={skill}
                                    aria-label={skill}
                                    className="inline-flex items-center justify-center h-7 w-7 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                                  >
                                    <Icon className="h-4 w-4" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" sideOffset={6}>
                                  {skill}
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {installer.certifications && installer.certifications.length > 0 && (
                      <div>
                        <span className="font-medium text-gray-700 block mb-1">Certifications</span>
                        <div className="flex flex-wrap gap-1.5">
                          {installer.certifications.map((cert) => (
                            <span
                              key={cert}
                              className="inline-flex items-center h-6 px-2 rounded bg-gray-100 text-gray-700 text-[11px] font-medium"
                            >
                              {cert}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Popup>
            ) : (
              <Popup>
                <strong>{installer.name}</strong><br />
                {simplifiedAddress}<br />
                {formattedDistanceFull}
              </Popup>
            )}
          </Marker>
        )
      })}
      <MapUpdater />
    </MapContainer>
      {overlayActive && (
        <CoverageLegend
          visible={coverageVisible}
          onToggle={() => setCoverageVisible((v) => !v)}
          isLoading={coverageLoading}
          filterLabel={coverageOverlay?.filterLabel ?? null}
          onClearFilter={coverageOverlay?.onClearFilter}
          onSearchClick={coverageOverlay?.onSearchClick}
          className="top-3 right-3"
        />
      )}
    </div>
  );
};

export default InstallerMapComponent;