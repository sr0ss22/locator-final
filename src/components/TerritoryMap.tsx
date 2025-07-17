import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import { cn } from '@/lib/utils';
import { Star } from 'lucide-react';
import { Loader2 } from "lucide-react";
import { calculateDistance } from '@/utils/distance';
import { InstallerZipAssignment } from '@/types/territory';
import { toast } from 'sonner';
import * as turf from '@turf/turf';

// Import both GeoJSON files from the new src/data directory with import assertions
import usGeoJson from '@/data/us-zip-codes.json' assert { type: 'json' };
import canadaGeoJson from '@/data/canada-postal-codes.json' assert { type: 'json' };

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
  isOpen?: boolean;
  existingTerritories?: InstallerZipAssignment[];
  currentDisplayRadius?: number | 'all';
  showRadiusCircles?: boolean;
  highlightedZipCodes: Map<string, 'green' | 'orange'>;
  isBulkSelecting?: boolean;
  onBulkSelectionComplete?: (selectedZips: Array<{ zipCode: string, stateProvince: string }>) => void;
  country?: 'USA' | 'Canada'; // New prop for country awareness
}

const DEFAULT_DISPLAY_RADIUS_MILES = 25;

// --- Country-Aware Helper Functions ---

const getPostalCode = (feature: any, isCanada: boolean): string => {
  if (!feature || !feature.properties) return '';
  return isCanada ? feature.properties.CFSAUID : feature.properties.ZCTA5CE20;
};

const getRegion = (feature: any, isCanada: boolean): string => {
  if (!feature || !feature.properties) return 'Unknown';
  return isCanada ? feature.properties.PRNAME : (feature.properties.STUSPS || 'Unknown');
};

// Memoize centroid calculation for performance
const featureCentroids = new WeakMap<any, { lat: number | null, lng: number | null }>();
const getCentroid = (feature: any, isCanada: boolean): { lat: number | null, lng: number | null } => {
    if (featureCentroids.has(feature)) {
        return featureCentroids.get(feature)!;
    }

    if (!feature || !feature.properties || !feature.geometry) {
        return { lat: null, lng: null };
    }

    let lat: number | null = null;
    let lng: number | null = null;

    if (isCanada) {
        try {
            const centroid = turf.centroid(feature);
            [lng, lat] = centroid.geometry.coordinates;
        } catch (e) {
            console.error("Error calculating centroid for feature:", feature, e);
        }
    } else {
        lat = parseFloat(feature.properties.INTPTLAT20);
        lng = parseFloat(feature.properties.INTPTLON20);
    }

    const result = { lat: isNaN(lat!) ? null : lat, lng: isNaN(lng!) ? null : lng };
    featureCentroids.set(feature, result);
    return result;
};

// Helper function to calculate a point at a given distance and bearing from a start point
function getPointAtDistance(lat: number, lng: number, distanceMiles: number, bearingDegrees: number): L.LatLngTuple {
  const R = 3958.8; // Earth's radius in miles
  const bearingRad = (bearingDegrees * Math.PI) / 180;

  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;

  const newLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(distanceMiles / R) +
    Math.cos(latRad) * Math.sin(distanceMiles / R) * Math.cos(bearingRad)
  );

  const newLngRad = lngRad + Math.atan2(
    Math.sin(bearingRad) * Math.sin(distanceMiles / R) * Math.cos(latRad),
    Math.cos(distanceMiles / R) - Math.sin(latRad) * Math.sin(newLatRad)
  );

  return [(newLatRad * 180) / Math.PI, (newLngRad * 180) / Math.PI];
}

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


// Component to manage the GeoJSON layer imperatively
function GeoJsonLayerManager({
  visibleGeoJsonFeatures,
  getZipCodeStyle,
  onEachFeatureCallback,
}: {
  visibleGeoJsonFeatures: any[];
  getZipCodeStyle: (feature: any) => L.PathOptions;
  onEachFeatureCallback: (feature: any, layer: L.Layer) => void;
}) {
  const map = useMap();
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    if (!map) return;

    if (!geoJsonLayerRef.current) {
      geoJsonLayerRef.current = L.geoJSON(null, {
        style: (feature) => getZipCodeStyle(feature),
        onEachFeature: onEachFeatureCallback,
      }).addTo(map);
    }

    geoJsonLayerRef.current.clearLayers();

    if (visibleGeoJsonFeatures.length > 0) {
      geoJsonLayerRef.current.addData({
        type: 'FeatureCollection',
        features: visibleGeoJsonFeatures
      });
    }

    return () => {
      if (geoJsonLayerRef.current && map.hasLayer(geoJsonLayerRef.current)) {
        map.removeLayer(geoJsonLayerRef.current);
        geoJsonLayerRef.current = null;
      }
    };
  }, [map, visibleGeoJsonFeatures, getZipCodeStyle, onEachFeatureCallback]);

  useEffect(() => {
    if (!geoJsonLayerRef.current) return;

    geoJsonLayerRef.current.eachLayer(layer => {
      if (layer.feature) {
        layer.setStyle(getZipCodeStyle(layer.feature));
      }
    });
  }, [getZipCodeStyle]);

  return null;
}

// New component to handle map interactions like bulk selection drawing
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
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStartLatLng, setDrawStartLatLng] = useState<L.LatLng | null>(null);
  const [currentDrawCircle, setCurrentDrawCircle] = useState<L.Circle | null>(null);

  const onBulkSelectionCompleteRef = useRef(onBulkSelectionComplete);
  useEffect(() => {
    onBulkSelectionCompleteRef.current = onBulkSelectionComplete;
  }, [onBulkSelectionComplete]);

  useEffect(() => {
    if (!map) return;

    const handleMouseDown = (e: L.LeafletMouseEvent) => {
      if (isBulkSelecting) {
        setIsDrawing(true);
        setDrawStartLatLng(e.latlng);
        if (currentDrawCircle) {
          map.removeLayer(currentDrawCircle);
          setCurrentDrawCircle(null);
        }
      }
    };

    const handleMouseMove = (e: L.LeafletMouseEvent) => {
      if (isDrawing && drawStartLatLng) {
        const distanceMeters = drawStartLatLng.distanceTo(e.latlng);
        if (currentDrawCircle) {
          currentDrawCircle.setRadius(distanceMeters);
          currentDrawCircle.setLatLng(drawStartLatLng);
        } else {
          const newCircle = L.circle(drawStartLatLng, {
            radius: distanceMeters,
            color: '#1D4ED8',
            fillColor: '#BFDBFE',
            fillOpacity: 0.3,
            weight: 2,
            interactive: false,
          }).addTo(map);
          setCurrentDrawCircle(newCircle);
        }
      }
    };

    const handleMouseUp = () => {
      if (isDrawing && drawStartLatLng && currentDrawCircle && geoJsonData && onBulkSelectionCompleteRef.current) {
        const finalCenter = drawStartLatLng;
        const finalRadiusMeters = currentDrawCircle.getRadius();

        const selectedZips: Array<{ zipCode: string, stateProvince: string }> = [];
        geoJsonData.features.forEach((feature: any) => {
          if (feature.geometry) {
            const centroid = getCentroid(feature, isCanada);
            if (centroid.lat && centroid.lng) {
              if (isPointInCircle(centroid.lat, centroid.lng, finalCenter.lat, finalCenter.lng, finalRadiusMeters)) {
                const zipCode = getPostalCode(feature, isCanada);
                const stateProvince = getRegion(feature, isCanada);
                selectedZips.push({ zipCode, stateProvince });
              }
            }
          }
        });
        onBulkSelectionCompleteRef.current(selectedZips);
      }

      if (currentDrawCircle) {
        map.removeLayer(currentDrawCircle);
      }
      setIsDrawing(false);
      setDrawStartLatLng(null);
      setCurrentDrawCircle(null);
    };

    if (isBulkSelecting) {
      map.on('mousedown', handleMouseDown);
      map.on('mousemove', handleMouseMove);
      map.on('mouseup', handleMouseUp);
      map.dragging.disable();
      map.doubleClickZoom.disable();
      map.scrollWheelZoom.disable();
    } else {
      map.off('mousedown', handleMouseDown);
      map.off('mousemove', handleMouseMove);
      map.off('mouseup', handleMouseUp);
      map.dragging.enable();
      map.doubleClickZoom.enable();
      map.scrollWheelZoom.enable();
    }

    return () => {
      map.off('mousedown', handleMouseDown);
      map.off('mousemove', handleMouseMove);
      map.off('mouseup', handleMouseUp);
      map.dragging.enable();
      map.doubleClickZoom.enable();
      map.scrollWheelZoom.enable();
      if (currentDrawCircle) {
        map.removeLayer(currentDrawCircle);
      }
    };
  }, [map, isBulkSelecting, isDrawing, drawStartLatLng, currentDrawCircle, geoJsonData, onBulkSelectionCompleteRef, isCanada]);

  return null;
}

// Component to handle initial map view setting imperatively
function MapBoundsUpdater({ centerLocation, filteredGeoJsonFeatures, isOpen, existingTerritories }: {
  centerLocation?: { lat: number | null; lng: number | null };
  filteredGeoJsonFeatures: any[];
  isOpen: boolean;
  existingTerritories: InstallerZipAssignment[];
}) {
  const map = useMap();
  const lastAppliedView = useRef<{ bounds?: L.LatLngBounds; center?: L.LatLngTuple; zoom?: number } | null>(null);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        map.invalidateSize();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen, map]);

  useEffect(() => {
    if (!map || !map._loaded || !map.getContainer()) {
      return;
    }

    let newBounds: L.LatLngBounds | null = null;
    let newCenter: L.LatLngTuple | null = null;
    let newZoom: number | null = null;

    if (isOpen) {
      if (centerLocation?.lat !== null && centerLocation?.lng !== null) {
        const tempBounds = L.latLngBounds([]);
        tempBounds.extend([centerLocation.lat, centerLocation.lng]);

        filteredGeoJsonFeatures.forEach(feature => {
          if (feature.geometry) {
            const tempLayer = L.geoJSON(feature);
            tempLayer.eachLayer(layer => {
              if (layer instanceof L.Polygon || layer instanceof L.MultiPolygon) {
                tempBounds.extend(layer.getBounds());
              } else if (layer instanceof L.Marker) {
                tempBounds.extend(layer.getLatLng());
              }
            });
          }
        });

        if (tempBounds.isValid()) {
          newBounds = tempBounds;
        } else {
          newCenter = [centerLocation.lat, centerLocation.lng];
          newZoom = 10;
        }
      } else {
        newCenter = [39.8283, -98.5795];
        newZoom = 4;
      }
    } else {
      if (filteredGeoJsonFeatures && filteredGeoJsonFeatures.length > 0) {
        const tempBounds = L.latLngBounds([]);
        filteredGeoJsonFeatures.forEach(feature => {
          if (feature.geometry) {
            const tempLayer = L.geoJSON(feature);
            tempLayer.eachLayer(layer => {
              if (layer instanceof L.Polygon || layer instanceof L.MultiPolygon) {
                tempBounds.extend(layer.getBounds());
              } else if (layer instanceof L.Marker) {
                tempBounds.extend(layer.getLatLng());
              }
            });
          }
        });
        if (tempBounds.isValid()) {
          newBounds = tempBounds;
        } else {
          newCenter = [39.8283, -98.5795];
          newZoom = 4;
        }
      } else {
        newCenter = [39.8283, -98.5795];
        newZoom = 4;
      }
    }

    const shouldUpdate = () => {
      if (!lastAppliedView.current) {
        return true;
      }

      if (newBounds) {
        return !lastAppliedView.current.bounds || !lastAppliedView.current.bounds.equals(newBounds);
      } else if (newCenter && newZoom) {
        return !lastAppliedView.current.center || !lastAppliedView.current.zoom ||
                             lastAppliedView.current.center[0] !== newCenter[0] ||
                             lastAppliedView.current.center[1] !== newCenter[1] ||
                             lastAppliedView.current.zoom !== newZoom;
      }
      return false;
    };

    if (shouldUpdate()) {
      if (newBounds) {
        map.fitBounds(newBounds, { padding: [50, 50] });
        lastAppliedView.current = { bounds: newBounds };
      } else if (newCenter && newZoom) {
        map.setView(newCenter, newZoom);
        lastAppliedView.current = { center: newCenter, zoom: newZoom };
      }
    }
  }, [map, centerLocation, filteredGeoJsonFeatures, isOpen, existingTerritories]);

  return null;
}

const TerritoryMap: React.FC<TerritoryMapProps> = ({
  onZipCodeClick,
  centerLocation,
  isOpen = false,
  existingTerritories = [],
  currentDisplayRadius = DEFAULT_DISPLAY_RADIUS_MILES,
  showRadiusCircles = false,
  highlightedZipCodes,
  isBulkSelecting = false,
  onBulkSelectionComplete,
  country = 'USA',
}) => {
  const [allGeoJsonData, setAllGeoJsonData] = useState<any>(null);
  const [loadingGeoJson, setLoadingGeoJson] = useState(true);

  const isCanada = country === 'Canada';
  const activeGeoJson = useMemo(() => {
    return isCanada ? canadaGeoJson : usGeoJson;
  }, [isCanada]);

  const isTerritoryManagementPage = !isOpen;

  const onZipCodeClickRef = useRef(onZipCodeClick);
  useEffect(() => {
    onZipCodeClickRef.current = onZipCodeClick;
  }, [onZipCodeClick]);

  useEffect(() => {
    setLoadingGeoJson(true);
    setAllGeoJsonData(activeGeoJson);
    setLoadingGeoJson(false);
  }, [activeGeoJson]);

  const filteredGeoJsonFeatures = useMemo(() => {
    if (loadingGeoJson || !allGeoJsonData || !allGeoJsonData.features) {
      return [];
    }

    if (isTerritoryManagementPage || currentDisplayRadius === 'all' || !centerLocation || centerLocation.lat === null || centerLocation.lng === null) {
      return allGeoJsonData.features;
    }

    const radiusInMeters = currentDisplayRadius * 1609.34;
    const filtered = allGeoJsonData.features.filter((feature: any) => {
      const centroid = getCentroid(feature, isCanada);
      if (centroid.lat && centroid.lng) {
        return isPointInCircle(
          centroid.lat,
          centroid.lng,
          centerLocation.lat!,
          centerLocation.lng!,
          radiusInMeters
        );
      }
      return false;
    });
    return filtered;
  }, [allGeoJsonData, centerLocation, currentDisplayRadius, isTerritoryManagementPage, loadingGeoJson, isCanada]);

  const getZipCodeStyle = useCallback((feature: any): L.PathOptions => {
    const zipCode = getPostalCode(feature, isCanada);
    
    const highlightState = highlightedZipCodes.get(zipCode);

    let fillColor = '#F0F0F0';
    let color = '#60A5FA';
    let weight = 1;
    let fillOpacity = 0.3;
    let dashArray: string | null = null;

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
      const approvedByAnyInstaller = existingTerritories.some(t => t.zip_code === zipCode && t.status === 'Approved');
      const needsApprovalByAnyInstaller = existingTerritories.some(t => t.zip_code === zipCode && t.status === 'Needs Approval');

      if (approvedByAnyInstaller) {
        fillColor = '#D4EDDA';
        fillOpacity = 0.4;
        weight = 1.5;
      } else if (needsApprovalByAnyInstaller) {
        fillColor = '#FFF3CD';
        fillOpacity = 0.4;
        weight = 1.5;
      }
    }

    return {
      fillColor,
      weight,
      opacity: 1,
      color,
      fillOpacity,
      dashArray,
      interactive: true,
    };
  }, [existingTerritories, highlightedZipCodes, isCanada]);

  const onEachFeatureCallback = useCallback((feature: any, layer: L.Layer) => {
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
  }, [isBulkSelecting, isCanada]);

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
      center={[39.8283, -98.5795]}
      zoom={2}
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
      <GeoJsonLayerManager
        visibleGeoJsonFeatures={filteredGeoJsonFeatures}
        getZipCodeStyle={getZipCodeStyle}
        onEachFeatureCallback={onEachFeatureCallback}
      />
      {!isTerritoryManagementPage && centerLocation?.lat !== null && centerLocation?.lng !== null && (
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
      <MapBoundsUpdater
        centerLocation={centerLocation}
        filteredGeoJsonFeatures={filteredGeoJsonFeatures}
        isOpen={isOpen}
        existingTerritories={existingTerritories}
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