import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import { cn } from '@/lib/utils';
import { Star } from 'lucide-react';
import { Loader2 } from "lucide-react";
import { calculateDistance } from '@/utils/distance';
import { InstallerZipAssignment, TerritoryStatus } from '@/types/territory';
import { toast } from 'sonner';
import * as turf from '@turf/turf';
import proj4 from 'proj4';

// Import both GeoJSON files from the new src/data directory with import assertions
import usGeoJson from '@/data/us-zip-codes.json' with { type: 'json' };
import canadaGeoJson from '@/data/canada-postal-codes.json' with { type: 'json' };

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

interface TerritoryMapProps {
  onZipCodeClick: (zipCode: string, stateProvince: string) => void;
  centerLocation?: { lat: number | null; lng: number | null };
  isOpen?: boolean; // True if used in a modal/drawer (e.g., EditInstallerPage), false for full page (e.g., TerritoryManagement)
  existingTerritories: InstallerZipAssignment[]; // All territories for TerritoryManagement page
  selectedZipCodes?: Array<{ zipCode: string, assignedStatus: TerritoryStatus, stateProvince: string, centroid_latitude: number | null, centroid_longitude: number | null }>; // Selected zips for current installer (EditInstallerPage)
  currentDisplayRadius?: number | 'all'; // Radius for filtering displayed polygons (EditInstallerPage)
  showRadiusCircles?: boolean; // Whether to show radius circles around centerLocation
  highlightedZipCodes: Map<string, 'green' | 'orange'>; // Zips highlighted by user interaction (e.g., bulk select)
  isBulkSelecting?: boolean; // Whether bulk selection mode is active
  onBulkSelectionComplete?: (selectedZips: Array<{ zipCode: string, stateProvince: string }>) => void;
  country?: 'USA' | 'Canada'; // New prop for country awareness
}

const DEFAULT_DISPLAY_RADIUS_MILES = 25;

// Define projections at the top of the file
proj4.defs("EPSG:3857", "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs");
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

// --- Country-Aware Helper Functions ---

const getPostalCode = (feature: any, isCanada: boolean): string => {
  if (!feature || !feature.properties) return '';
  return isCanada ? feature.properties.CFSAUID : feature.properties.ZCTA5CE20;
};

const getRegion = (feature: any, isCanada: boolean): string => {
  if (!feature || !feature.properties) return 'Unknown';
  return isCanada ? feature.properties.PRNAME : (feature.properties.STUSPS || 'Unknown');
};

// Helper to get centroid from GeoJSON feature (used for filtering/bulk selection)
const getCentroid = (feature: any, isCanada: boolean): { lat: number | null, lng: number | null } => {
    if (!feature || !feature.geometry || !feature.properties) {
        return { lat: null, lng: null };
    }

    let lat: number | null = null;
    let lng: number | null = null;

    if (isCanada) {
        // The feature passed here is already reprojected to WGS84
        try {
            const centroid = turf.centroid(feature);
            if (centroid && centroid.geometry && centroid.geometry.coordinates) {
                lng = centroid.geometry.coordinates[0];
                lat = centroid.geometry.coordinates[1];
            }
        } catch (e) {
            console.error("Error calculating centroid for Canadian feature:", feature, e);
        }
    } else {
        // For US data, we get lat/lng from properties
        lat = parseFloat(feature.properties.INTPTLAT20);
        lng = parseFloat(feature.properties.INTPTLON20);
    }

    if (isNaN(lat!)) lat = null;
    if (isNaN(lng!)) lng = null;

    return { lat, lng };
};

// Helper to check if a point (lat, lng) is inside a circle (centerLat, centerLng, radiusMeters)
function isPointInCircle(pointLat: number, pointLng: number, circleCenterLat: number, circleCenterLng: number, circleRadiusMeters: number): boolean {
  const distanceMiles = calculateDistance(pointLat, pointLng, circleCenterLat, circleCenterLng);
  return (distanceMiles * 1609.34) <= circleRadiusMeters; // Convert miles to meters for comparison
}

// Custom icon for installer location (star)
const createStarIcon = () => L.divIcon({
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

// Component to handle map view updates (bounds, zoom, etc.)
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
      map.setView(country === 'Canada' ? [56.1304, -106.3468] : [39.8283, -98.5795], country === 'Canada' ? 3 : 4);
    }
  }, [map, centerLocation, country]);

  return null;
}

// Component to handle bulk selection interactions
function MapInteractionHandler({
  isBulkSelecting,
  geoJsonData,
  onBulkSelectionComplete,
  isCanada,
}: {
  isBulkSelecting: boolean;
  geoJsonData: any;
  onBulkSelectionComplete: ((selectedZips: Array<{ zipCode: string, stateProvince: string }>) => void) | undefined;
  isCanada: boolean;
}) {
  const map = useMap();
  const isDrawingRef = useRef(false);
  const drawStartLatLngRef = useRef<L.LatLng | null>(null);
  const currentDrawCircleRef = useRef<L.Circle | null>(null);
  const onBulkSelectionCompleteRef = useRef(onBulkSelectionComplete);

  useEffect(() => {
    onBulkSelectionCompleteRef.current = onBulkSelectionComplete;
  }, [onBulkSelectionComplete]);

  useEffect(() => {
    const handleMouseDown = (e: L.LeafletMouseEvent) => {
      isDrawingRef.current = true;
      drawStartLatLngRef.current = e.latlng;
      // Ensure any previous circle is removed before starting a new draw
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
            interactive: false, // Crucial: this circle should not block underlying map interactions
          }).addTo(map);
        }
      }
    };

    const handleMouseUp = () => {
      if (isDrawingRef.current && drawStartLatLngRef.current && currentDrawCircleRef.current && geoJsonData && onBulkSelectionCompleteRef.current) {
        const finalCenter = drawStartLatLngRef.current;
        const finalRadiusMeters = currentDrawCircleRef.current.getRadius();
        const selectedZips: Array<{ zipCode: string, stateProvince: string }> = [];
        geoJsonData.features.forEach((feature: any) => {
          if (feature.geometry) {
            const centroid = getCentroid(feature, isCanada);
            if (centroid.lat && centroid.lng && isPointInCircle(centroid.lat, centroid.lng, finalCenter.lat, finalCenter.lng, finalRadiusMeters)) {
              selectedZips.push({ zipCode: getPostalCode(feature, isCanada), stateProvince: getRegion(feature, isCanada) });
            }
          }
        });
        onBulkSelectionCompleteRef.current(selectedZips);
      }

      // Always remove the circle on mouse up
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
      // Disable default map interactions during bulk selection
      map.dragging.disable();
      map.doubleClickZoom.disable();
      map.scrollWheelZoom.disable();
    } else {
      // When not in bulk select mode:
      // 1. Remove event listeners for drawing
      map.off('mousedown', handleMouseDown);
      map.off('mousemove', handleMouseMove);
      map.off('mouseup', handleMouseUp);
      
      // 2. Ensure map interactions are enabled (revert to default behavior)
      // These are already set to true in MapContainer props, so no need to explicitly enable here.
      // map.dragging.enable();
      // map.doubleClickZoom.enable();
      // map.scrollWheelZoom.enable();

      // 3. Crucially, remove any lingering draw circle if bulk select mode was active
      // and then turned off without a mouseup event (e.g., by clicking the button again)
      if (currentDrawCircleRef.current) {
        map.removeLayer(currentDrawCircleRef.current);
        currentDrawCircleRef.current = null;
        isDrawingRef.current = false; // Reset drawing state
        drawStartLatLngRef.current = null; // Reset start point
      }
    }

    // Cleanup function for the effect
    return () => {
      map.off('mousedown', handleMouseDown);
      map.off('mousemove', handleMouseMove);
      map.off('mouseup', handleMouseUp);
      // Ensure map interactions are re-enabled on component unmount or re-render
      // These are already set to true in MapContainer props, so no need to explicitly enable here.
      // if (map.dragging && !map.dragging.enabled()) map.dragging.enable();
      // if (map.doubleClickZoom && !map.doubleClickZoom.enabled()) map.doubleClickZoom.enable();
      // if (map.scrollWheelZoom && !map.scrollWheelZoom.enabled()) map.scrollWheelZoom.enable();
      // Ensure the circle is removed on cleanup
      if (currentDrawCircleRef.current) {
        map.removeLayer(currentDrawCircleRef.current);
        currentDrawCircleRef.current = null;
      }
    };
  }, [map, isBulkSelecting, geoJsonData, isCanada]); // Dependencies
  return null;
}

const TerritoryMap: React.FC<TerritoryMapProps> = ({
  onZipCodeClick,
  centerLocation,
  isOpen = false,
  existingTerritories = [],
  selectedZipCodes = [],
  currentDisplayRadius = DEFAULT_DISPLAY_RADIUS_MILES,
  showRadiusCircles = false,
  highlightedZipCodes,
  isBulkSelecting = false,
  onBulkSelectionComplete,
  country = 'USA',
}) => {
  const [allGeoJsonData, setAllGeoJsonData] = useState<any>(null);
  const [loadingGeoJson, setLoadingGeoJson] = useState(true);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);

  const isCanada = country === 'Canada';
  const isTerritoryManagementPage = !isOpen;

  const onZipCodeClickRef = useRef(onZipCodeClick);
  useEffect(() => {
    onZipCodeClickRef.current = onZipCodeClick;
  }, [onZipCodeClick]);

  useEffect(() => {
    setLoadingGeoJson(true);
    const featuresToLoad = isCanada ? canadaGeoJson.features : usGeoJson.features;
    let processedFeatures = featuresToLoad;

    if (isCanada) {
      const reprojectCoordinatesRecursive = (coordinates: any[]): any[] => {
        if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
          return proj4('EPSG:3857', 'EPSG:4326', coordinates);
        }
        return coordinates.map(reprojectCoordinatesRecursive);
      };

      processedFeatures = featuresToLoad.map(feature => {
        const newFeature = JSON.parse(JSON.stringify(feature));
        if (newFeature.geometry && newFeature.geometry.coordinates) {
          newFeature.geometry.coordinates = reprojectCoordinatesRecursive(newFeature.geometry.coordinates);
        }
        return newFeature;
      });
    }

    setAllGeoJsonData({
      type: 'FeatureCollection',
      features: processedFeatures
    });
    setLoadingGeoJson(false);
  }, [isCanada]);

  const getZipCodeStyle = useCallback((feature: any): L.PathOptions => {
    const zipCode = getPostalCode(feature, isCanada);
    
    let isVisibleByRadius = true;
    if (!isTerritoryManagementPage && currentDisplayRadius !== 'all' && centerLocation?.lat != null && centerLocation?.lng != null) {
      const centroid = getCentroid(feature, isCanada);
      if (centroid.lat != null && centroid.lng != null) {
        const radiusInMeters = (currentDisplayRadius as number) * 1609.34;
        isVisibleByRadius = isPointInCircle(
          centroid.lat,
          centroid.lng,
          centerLocation.lat,
          centerLocation.lng,
          radiusInMeters
        );
      } else {
        isVisibleByRadius = false;
      }
    }

    if (!isVisibleByRadius) {
      return {
        fillColor: '#F0F0F0',
        weight: 0.5,
        opacity: 0.5,
        color: '#B0B0B0',
        fillOpacity: 0.1,
        interactive: false,
      };
    }

    const highlightState = highlightedZipCodes.get(zipCode);
    let fillColor = '#F0F0F0';
    let color = '#60A5FA';
    let weight = 1;
    let fillOpacity = 0.3;

    if (highlightState === 'green') {
      color = '#22C55E';
      fillColor = '#DCFCE7';
      weight = 3;
      fillOpacity = 0.8;
    } else if (highlightState === 'orange') {
      color = '#F97316';
      fillColor = '#FFEDD5';
      weight = 3;
      fillOpacity = 0.8;
    } else {
      let assignedStatus: TerritoryStatus | null = null;
      if (!isTerritoryManagementPage) {
        const selectedZip = selectedZipCodes.find(item => item.zipCode === zipCode);
        if (selectedZip) assignedStatus = selectedZip.assignedStatus;
      } else {
        const existingAssignment = existingTerritories.find(t => t.zip_code === zipCode);
        if (existingAssignment) assignedStatus = existingAssignment.status;
      }

      if (assignedStatus === 'Approved') {
        fillColor = '#D4EDDA';
        fillOpacity = 0.4;
        weight = 1.5;
      } else if (assignedStatus === 'Needs Approval') {
        fillColor = '#FFF3CD';
        fillOpacity = 0.4;
        weight = 1.5;
      }
    }

    return { fillColor, weight, opacity: 1, color, fillOpacity, interactive: true };
  }, [
    existingTerritories,
    highlightedZipCodes,
    isCanada,
    isTerritoryManagementPage,
    currentDisplayRadius,
    centerLocation,
    selectedZipCodes,
  ]);

  const onEachFeature = (feature: any, layer: L.Layer) => {
    const zipCode = getPostalCode(feature, isCanada);
    const stateProvince = getRegion(feature, isCanada);
    
    layer.off('click'); 
    layer.on({
      click: (e) => {
        L.DomEvent.stopPropagation(e);
        if (!isBulkSelecting) {
          onZipCodeClickRef.current(zipCode, stateProvince); 
        }
      },
    });
    layer.bindTooltip(`${isCanada ? 'FSA' : 'ZIP'}: ${zipCode} (${stateProvince})`, { permanent: false, direction: 'auto' });
  };

  const geoJsonStyleKey = useMemo(() => {
    const selectedZipsString = selectedZipCodes.map(z => `${z.zipCode}:${z.assignedStatus}`).join(',');
    const highlightedZipsString = Array.from(highlightedZipCodes.entries()).map(([k, v]) => `${k}:${v}`).join(',');
    return `${selectedZipsString}-${highlightedZipsString}-${currentDisplayRadius}-${isBulkSelecting}`;
  }, [selectedZipCodes, highlightedZipCodes, currentDisplayRadius, isBulkSelecting]);

  if (loadingGeoJson) {
    return (
      <div className="h-full w-full flex items-center justify-center text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin mr-2" /> Loading map data...
      </div>
    );
  }

  const yellowCircleOptions = { color: '#FACC15', fillOpacity: 0, dashArray: '5, 5', weight: 2 };
  const orangeCircleOptions = { color: '#FB923C', fillOpacity: 0, dashArray: '5, 5', weight: 2 };
  const lightRedCircleOptions = { color: '#FCA5A5', fillOpacity: 0, dashArray: '5, 5', weight: 2 };

  return (
    <MapContainer
      center={isCanada ? [56.1304, -106.3468] : [39.8283, -98.5795]}
      zoom={isCanada ? 3 : 4}
      minZoom={3}
      maxZoom={18}
      scrollWheelZoom={true}
      zoomControl={true}
      dragging={true}
      doubleClickZoom={true}
      className="h-full w-full rounded-lg overflow-hidden shadow-sm"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      
      {allGeoJsonData && (
        <GeoJSON
          key={geoJsonStyleKey}
          ref={geoJsonLayerRef}
          data={allGeoJsonData as any}
          style={getZipCodeStyle}
          onEachFeature={onEachFeature}
        />
      )}

      {!isTerritoryManagementPage && centerLocation?.lat != null && centerLocation?.lng != null && (
        <>
          <Marker position={[centerLocation.lat, centerLocation.lng]} icon={createStarIcon()}>
            <Popup>Installer Location</Popup>
          </Marker>
          {showRadiusCircles && (
            <>
              <Circle center={[centerLocation.lat, centerLocation.lng]} radius={25 * 1609.34} pathOptions={yellowCircleOptions} />
              <Circle center={[centerLocation.lat, centerLocation.lng]} radius={50 * 1609.34} pathOptions={orangeCircleOptions} />
              <Circle center={[centerLocation.lat, centerLocation.lng]} radius={100 * 1609.34} pathOptions={lightRedCircleOptions} />
            </>
          )}
        </>
      )}
      <MapUpdater
        centerLocation={centerLocation}
        isOpen={isOpen}
        country={country}
      />
      <MapInteractionHandler
        isBulkSelecting={isBulkSelecting}
        geoJsonData={allGeoJsonData}
        onBulkSelectionComplete={onBulkSelectionComplete}
        isCanada={isCanada}
      />
      {isTerritoryManagementPage && (
        <div className="leaflet-bottom leaflet-left p-2">
          <div className="bg-white p-3 rounded-lg shadow-md flex flex-col space-y-2 text-sm">
            <div className="font-semibold mb-1">Territory Status</div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded-full mr-2" style={{ backgroundColor: '#D4EDDA', border: '1px solid #2563EB' }}></div>
              <span>Approved (by any installer)</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded-full mr-2" style={{ backgroundColor: '#FFF3CD', border: '1px solid #2563EB' }}></div>
              <span>Needs Approval (by any installer)</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded-full mr-2" style={{ backgroundColor: '#F0F0F0', border: '1px solid #2563EB' }}></div>
              <span>Unassigned</span>
            </div>
          </div>
        </div>
      )}
    </MapContainer>
  );
};

export default TerritoryMap;