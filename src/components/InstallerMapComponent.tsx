import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Installer, InstallerBrand, InstallerCertification, InstallerSkill } from '@/types/installer';
import { useCountrySettings } from "@/hooks/useCountrySettings";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SKILL_ICON_MAP } from "@/lib/skillIcons";
import CoverageOverlay from "@/components/CoverageOverlay";
import CoverageLegend from "@/components/CoverageLegend";
import type { CoverageCounts } from "@/lib/coverageStyle";

// Small inline version of the numbered map pin, used inside the popup header
// so the popup visually matches the marker the user just clicked.
const NumberedPinGlyph: React.FC<{ number: number; size?: number }> = ({ number, size = 28 }) => {
  const badgeSize = Math.round(size * 0.5);
  const fontSize = Math.round(size * 0.32);
  return (
    <span
      className="relative inline-flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
      aria-label={`Pin ${number}`}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} fill="#000000" aria-hidden="true">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z" />
      </svg>
      <span
        className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center rounded-full bg-black text-white font-bold leading-none"
        style={{
          top: Math.round(size * 0.08),
          width: badgeSize,
          height: badgeSize,
          fontSize,
        }}
      >
        {number}
      </span>
    </span>
  );
};

// Fix for default Leaflet icons with Webpack/Vite
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
});

interface CoverageOverlayConfig {
  enabled: boolean;
  defaultVisible: boolean;
  searchCenter: { lat: number | null; lng: number | null };
  searchRadiusMiles: number;
  brands: InstallerBrand[];
  skills: InstallerSkill[];
  certifications: InstallerCertification[];
  acceptsShipments: boolean;
  onZipClick?: (zip: string, counts: CoverageCounts) => void;
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

  // Custom icon for numbered installers (colored MapPin with circular number)
  const createNumberedIcon = (number: number, installerId: string, currentSelectedInstallerId: string | null) => {
    const fillColor = installerId === currentSelectedInstallerId ? '#0EA5E9' : '#000000'; // Sky Blue if selected, black otherwise
    return L.divIcon({
      html: `<div class="relative flex items-center justify-center" style="width: 48px; height: 48px;">
              <svg stroke="currentColor" fill="${fillColor}" stroke-width="0" viewBox="0 0 24 24" height="48px" width="48px" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"></path>
              </svg>
              <div style="position: absolute; top: 4px; left: 50%; transform: translateX(-50%); background-color: ${fillColor}; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold;">${number}</div>
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
        const distanceUnitLabel = distanceUnit === 'km' ? 'km' : 'mi';
        const formattedDistanceFull = displayDistance ? `Distance: ${displayDistance} ${distanceUnit}` : undefined;
        const formattedDistanceShort = displayDistance ? `${displayDistance} ${distanceUnitLabel}` : undefined;
        const simplifiedAddress = `${installer.rawSupabaseData?.city || ''}, ${installer.rawSupabaseData?.state || ''} ${installer.zipCode || ''}`.trim();
        const pinNumber = index + 1;

        return installer.latitude && installer.longitude && (
          <Marker
            key={installer.id}
            position={[installer.latitude, installer.longitude]}
            icon={createNumberedIcon(pinNumber, installer.id, selectedInstallerId)}
          >
            {isPublicView ? (
              // Public view: anonymized capabilities only. Header shows the
              // numbered pin glyph + distance; below it brands / skills /
              // certs. Skills use lucide icons. No name, no address, no
              // phone, no city/state.
              <Popup
                className="public-installer-popup"
                maxWidth={280}
                minWidth={220}
                closeButton={false}
              >
                <div className="py-0.5">
                  <div className="flex items-center justify-between border-b border-gray-200 pb-1.5 mb-1.5">
                    <NumberedPinGlyph number={pinNumber} />
                    {formattedDistanceShort && (
                      <span className="text-sm font-medium text-gray-700">{formattedDistanceShort}</span>
                    )}
                  </div>
                  <div className="space-y-1.5 text-xs leading-snug">
                    {installer.brands && installer.brands.length > 0 && (
                      <div>
                        <span className="font-medium text-gray-700">Brands: </span>
                        <span className="text-gray-600">{installer.brands.join(", ")}</span>
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
                        <span className="font-medium text-gray-700">Certs: </span>
                        <span className="text-gray-600">{installer.certifications.join(", ")}</span>
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
          className="top-3 right-3"
        />
      )}
    </div>
  );
};

export default InstallerMapComponent;