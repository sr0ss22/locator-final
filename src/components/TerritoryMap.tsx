import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import { cn } from '@/lib/utils';
import { Star, Loader2 } from 'lucide-react';
import { calculateDistance } from '@/utils/distance';
import { InstallerZipAssignment, TerritoryStatus } from '@/types/territory';
import { toast } from 'sonner';
import * as turf from '@turf/turf';
import proj4 from 'proj4';
import { useCountrySettings } from "@/hooks/useCountrySettings";

// Import both GeoJSON files
import usGeoJson from '@/data/us-zip-codes.json' with { type: 'json' };
import canadaGeoJson from '@/data/canada-postal-codes.json' with { type: 'json' };

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
  country?: 'USA' | 'Canada';
}

const DEFAULT_DISPLAY_RADIUS_MILES = 25;

// Define projections
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
      // Default views
      if (country === 'Canada') {
        map.setView([56.1304, -106.3468], 3);
      } else {
        map.setView([39.8283, -98.5795], 4);
      }
    }
  }, [map, centerLocation, country]);

  return null;
}

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

    const handleMouseUp = () => {
      if (isDrawingRef.current && drawStartLatLngRef.current && currentDrawCircleRef.current && geoJsonData && onBulkSelectionCompleteRef.current) {
        const finalCenter = drawStartLatLngRef.current;
        const finalRadiusMeters = currentDrawCircleRef.current.getRadius();
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
      map.doubleClickZoom.disable();
      map.scrollWheelZoom.disable();
      map.touchZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();
    } else {
      map.off('mousedown', handleMouseDown);
      map.off('mousemove', handleMouseMove);
      map.off('mouseup', handleMouseUp);
      
      map.dragging.enable();
      map.doubleClickZoom.enable();
      map.scrollWheelZoom.enable();
      map.touchZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();

      if (currentDrawCircleRef.current) {
        map.removeLayer(currentDrawCircleRef.current);
        currentDrawCircleRef.current = null;
        isDrawingRef.current = false;
        drawStartLatLngRef.current = null;
      }
    }

    return () => {
      map.off('mousedown', handleMouseDown);
      map.off('mousemove', handleMouseMove);
      map.off('mouseup', handleMouseUp);
      
      if (map.dragging && !map.dragging.enabled()) map.dragging.enable();
      if (map.doubleClickZoom && !map.doubleClickZoom.enabled()) map.doubleClickZoom.enable();
      if (map.scrollWheelZoom && !map.scrollWheelZoom.enabled()) map.scrollWheelZoom.enable();
      if (map.touchZoom && !map.touchZoom.enabled()) map.touchZoom.enable();
      if (map.boxZoom && !map.boxZoom.enabled()) map.boxZoom.enable();
      if (map.keyboard && !map.keyboard.enabled()) map.keyboard.enable();

      if (currentDrawCircleRef.current) {
        map.removeLayer(currentDrawCircleRef.current);
        currentDrawCircleRef.current = null;
      }
    };
  }, [map, isBulkSelecting, geoJsonData, isCanada]);

  return null;
}

interface RadiusCircleWithLabelProps {
  center: L.LatLngExpression;
  radiusMiles: number;
  pathOptions: L.PathOptions;
  distanceUnit: 'miles' | 'km';
}

const RadiusCircleWithLabel: React.FC<RadiusCircleWithLabelProps> = ({ center, radiusMiles, pathOptions, distanceUnit }) => {
  const [lat, lng] = Array.isArray(center) ? center : [center.lat, center.lng];
  const radiusMeters = radiusMiles * 1609.34;
  const latOffsetDegrees = radiusMeters / 111139;
  const labelLat = lat + latOffsetDegrees;
  const displayRadius = distanceUnit === 'km' ? (radiusMiles * 1.60934).toFixed(0) : radiusMiles.toFixed(0);
  const labelText = `${displayRadius} ${distanceUnit}`;
  const textColor = '#333333';
  const badgeBgColor = '#F0F0F0';

  const labelIcon = L.divIcon({
    html: `<div class="flex items-center justify-center">
            <span style="background-color: ${badgeBgColor}; color: ${textColor};" class="text-xs font-semibold px-2.5 py-0.5 rounded-full shadow-sm whitespace-nowrap">
              ${labelText}
            </span>
          </div>`,
    className: 'custom-radius-label-icon',
    iconSize: [labelText.length * 8 + 20, 20],
    iconAnchor: [labelText.length * 4 + 10, 10],
  });

  return (
    <>
      <Circle center={center} radius={radiusMeters} pathOptions={pathOptions} />
      <Marker position={[labelLat, lng]} icon={labelIcon} interactive={false} />
    </>
  );
};

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
  country = 'USA',
}) => {
  const [allGeoJsonData, setAllGeoJsonData] = useState<any>(null);
  const [loadingGeoJson, setLoadingGeoJson] = useState(true);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const { distanceUnit } = useCountrySettings();

  const isCanada = country === 'Canada';
  const isTerritoryManagementPage = !isOpen;

  const onZipCodeClickRef = useRef(onZipCodeClick);
  useEffect(() => {
    onZipCodeClickRef.current = onZipCodeClick;
  }, [onZipCodeClick]);

  useEffect(() => {
    setLoadingGeoJson(true);
    const featuresToLoad = isCanada ? canadaGeoJson.features : usGeoJson.features;
    
    if (!featuresToLoad || featuresToLoad.length === 0) {
      console.error(`GeoJSON data for ${country} could not be loaded or is empty.`);
      toast.error(`Map data for ${country} is missing. Polygons cannot be displayed.`);
      setLoadingGeoJson(false);
      return;
    }

    let needsReprojection = false;
    const sampleFeature = featuresToLoad[0];
    if (isCanada && sampleFeature?.geometry?.coordinates) {
      const findCoord = (coords: any): any => {
        if (typeof coords[0] === 'number') return coords;
        return findCoord(coords[0]);
      };
      const sampleCoord = findCoord(sampleFeature.geometry.coordinates);
      if (Math.abs(sampleCoord[0]) > 180 || Math.abs(sampleCoord[1]) > 90) {
        needsReprojection = true;
      }
    }

    let processedFeatures;

    if (isCanada) {
      const reprojectCoordinatesRecursive = (coordinates: any[]): any[] => {
        if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
          return proj4('EPSG:3857', 'EPSG:4326', coordinates);
        }
        return coordinates.map(reprojectCoordinatesRecursive);
      };

      processedFeatures = featuresToLoad.map(feature => {
        const newFeature = JSON.parse(JSON.stringify(feature));
        let centroidLat = null;
        let centroidLng = null;

        if (needsReprojection) {
          if (newFeature.geometry && newFeature.geometry.coordinates) {
            newFeature.geometry.coordinates = reprojectCoordinatesRecursive(newFeature.geometry.coordinates);
          }
        }

        try {
          const centroid = turf.centroid(newFeature.geometry);
          if (centroid?.geometry?.coordinates) {
            centroidLng = centroid.geometry.coordinates[0];
            centroidLat = centroid.geometry.coordinates[1];
          }
        } catch (e) {
          console.error("Error calculating centroid for Canadian feature:", newFeature?.properties?.CFSAUID, e);
        }
        
        newFeature.properties.calculated_centroid = { lat: centroidLat, lng: centroidLng };
        return newFeature;
      });
    } else {
      processedFeatures = featuresToLoad.map(feature => {
        const newFeature = JSON.parse(JSON.stringify(feature));
        const lat = parseFloat(feature.properties.INTPTLAT20);
        const lng = parseFloat(feature.properties.INTPTLON20);
        newFeature.properties.calculated_centroid = {
          lat: isNaN(lat) ? null : lat,
          lng: isNaN(lng) ? null : lng
        };
        return newFeature;
      });
    }

    setAllGeoJsonData({
      type: 'FeatureCollection',
      features: processedFeatures
    });
    setLoadingGeoJson(false);
  }, [isCanada, country]);

  const filteredGeoJsonData = useMemo(() => {
    if (!allGeoJsonData) return null;
    if (isTerritoryManagementPage || currentDisplayRadius === 'all' || !centerLocation?.lat || !centerLocation?.lng) {
      return allGeoJsonData;
    }

    const radiusInMeters = (currentDisplayRadius as number) * 1609.34;
    const filteredFeatures = allGeoJsonData.features.filter((feature: any) => {
      const centroid = getCentroid(feature);
      if (centroid.lat != null && centroid.lng != null) {
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

    return {
      ...allGeoJsonData,
      features: filteredFeatures,
    };
  }, [allGeoJsonData, isTerritoryManagementPage, currentDisplayRadius, centerLocation, isCanada]);

  const getZipCodeStyle = useCallback((feature: any): L.PathOptions => {
    const zipCode = getPostalCode(feature, isCanada);
    const highlightState = highlightedZipCodes.get(zipCode);

    let fillColor = '#F0F0F0';
    let color = '#94a3b8';
    let weight = 1.5;
    let fillOpacity = 0;
    let opacity = 0.3;

    if (highlightState === 'green') {
      color = '#22C55E';
      fillColor = '#DCFCE7';
      weight = 1.5; 
      fillOpacity = 0.65; 
      opacity = 1;
    } else if (highlightState === 'orange') {
      color = '#F97316';
      fillColor = '#FFEDD5';
      weight = 1.5; 
      fillOpacity = 0.65; 
      opacity = 1;
    } else {
      const assignedStatus = territoryStatuses.get(zipCode) || null;

      if (isTerritoryManagementPage) {
        if (assignedStatus === 'Approved') {
          fillColor = '#D4EDDA';
          fillOpacity = 0.65;
          color = '#22C55E';
          weight = 1.5;
          opacity = 1;
        } else if (assignedStatus === 'Needs Approval') {
          fillColor = '#FFF3CD';
          fillOpacity = 0.65;
          color = '#F97316';
          weight = 1.5;
          opacity = 1;
        }
      } else {
        if (assignedStatus === 'Approved') {
          color = '#a7f3d0';
          weight = 1;
          opacity = 1;
        } else if (assignedStatus === 'Needs Approval') {
          color = '#fed7aa';
          weight = 1;
          opacity = 1;
        }
      }
    }

    return { fillColor, weight, opacity, color, fillOpacity, interactive: true };
  }, [territoryStatuses, highlightedZipCodes, isCanada, isTerritoryManagementPage]);

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

    const label = isCanada ? 'FSA' : 'ZIP';
    let tooltipText = `${label}: ${zipCode}`;
    if (stateProvince && stateProvince !== 'Unknown') {
      tooltipText += ` (${stateProvince})`;
    }
    
    layer.bindTooltip(tooltipText, { permanent: false, direction: 'auto' });
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

  const greenCircleOptions = { color: '#22C55E', fillOpacity: 0, dashArray: '5, 5', weight: 2 };
  const yellowCircleOptions = { color: '#FACC15', fillOpacity: 0, dashArray: '5, 5', weight: 2 };
  const orangeCircleOptions = { color: '#F97316', fillOpacity: 0, dashArray: '5, 5', weight: 2 };
  const redCircleOptions = { color: '#EF4444', fillOpacity: 0, dashArray: '5, 5', weight: 2 };

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
      
      {filteredGeoJsonData && (
        <GeoJSON
          key={geoJsonStyleKey}
          ref={geoJsonLayerRef}
          data={filteredGeoJsonData as any}
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
              <RadiusCircleWithLabel center={[centerLocation.lat, centerLocation.lng]} radiusMiles={25} pathOptions={greenCircleOptions} distanceUnit={distanceUnit} />
              <RadiusCircleWithLabel center={[centerLocation.lat, centerLocation.lng]} radiusMiles={50} pathOptions={yellowCircleOptions} distanceUnit={distanceUnit} />
              <RadiusCircleWithLabel center={[centerLocation.lat, centerLocation.lng]} radiusMiles={100} pathOptions={orangeCircleOptions} distanceUnit={distanceUnit} />
              <RadiusCircleWithLabel center={[centerLocation.lat, centerLocation.lng]} radiusMiles={150} pathOptions={redCircleOptions} distanceUnit={distanceUnit} />
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
              <div className="w-4 h-4 rounded-full mr-2" style={{ backgroundColor: '#D4EDDA', border: '1px solid #94a3b8' }}></div>
              <span>Approved (by any installer)</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded-full mr-2" style={{ backgroundColor: '#FFF3CD', border: '1px solid #94a3b8' }}></div>
              <span>Needs Approval (by any installer)</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded-full mr-2" style={{ backgroundColor: '#F0F0F0', border: '1px solid #94a3b8' }}></div>
              <span>Unassigned</span>
            </div>
          </div>
        </div>
      )}
    </MapContainer>
  );
};

export default TerritoryMap;