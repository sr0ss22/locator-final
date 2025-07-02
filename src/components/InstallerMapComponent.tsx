import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Star } from 'lucide-react'; // Import MapPin and Star icons
import { Installer } from '@/types/installer';

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

interface InstallerMapProps {
  userLocation: { lat: number | null; lng: number | null } | null;
  installers: (Installer & { distance?: number })[];
  selectedInstallerId: string | null; // New prop
}

const InstallerMapComponent: React.FC<InstallerMapProps> = ({ userLocation, installers, selectedInstallerId }) => {
  const mapRef = useRef<L.Map | null>(null);
  const [mounted, setMounted] = useState(false);

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
    const fillColor = installerId === currentSelectedInstallerId ? '#f97316' : '#000000'; // Orange if selected, black otherwise
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
        map.setView([39.8283, -98.5795], 4); // Default to center of US
      }
    }, [map, userLocation, installers]);

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

  return (
    <MapContainer
      center={userLocation?.lat && userLocation?.lng ? [userLocation.lat, userLocation.lng] : [39.8283, -98.5795]}
      zoom={userLocation?.lat && userLocation?.lng ? 10 : 4}
      scrollWheelZoom={true}
      className="h-full w-full"
      ref={mapRef}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {userLocation?.lat && userLocation?.lng && (
        <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
          <Popup>Your Search Location</Popup>
        </Marker>
      )}
      {installers.map((installer, index) => (
        installer.latitude && installer.longitude && (
          <Marker
            key={installer.id}
            position={[installer.latitude, installer.longitude]}
            icon={createNumberedIcon(index + 1, installer.id, selectedInstallerId)} // Pass installer ID and selected ID
          >
            <Popup>
              <strong>{installer.name}</strong><br />
              {installer.address}<br />
              {installer.distance !== undefined && installer.distance !== Infinity && (
                `Distance: ${installer.distance.toFixed(1)} miles`
              )}
            </Popup>
          </Marker>
        )
      ))}
      <MapUpdater />
    </MapContainer>
  );
};

export default InstallerMapComponent;