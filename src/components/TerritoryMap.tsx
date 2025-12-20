import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle, GeoJSON, Pane, Tooltip, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { cn } from '@/lib/utils';
import { Star, Loader2 } from 'lucide-react';
import { calculateDistance } from '@/utils/distance';
import { TerritoryStatus } from '@/types/territory';
import { toast } from 'sonner';
import * as turf from '@turf/turf';
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";

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
  onBulkZipCodeUpdate?: (updates: Array<{ zipCode: string, stateProvince: string, newStatus: TerritoryStatus | null }>) => void;
  country?: 'USA' | 'Canada';
}

const DEFAULT_DISPLAY_RADIUS_MILES = 25;
const FETCH_BATCH_SIZE = 20000;
const RENDER_BATCH_SIZE = 5000;

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

    const handleMouseUp = async () => {
      if (isDrawingRef.current && drawStartLatLngRef.current && currentDrawCircleRef.current && onBulkSelectionCompleteRef.current) {
        const finalCenter = drawStartLatLngRef.current;
        const finalRadiusMeters = currentDrawCircleRef.current.getRadius();
        
        if (isCanada) {
          const { data, error } = await supabase.rpc('get_canadian_fsa_in_radius', {
            center_lat: finalCenter.lat,
            center_lng: finalCenter.lng,
            radius_meters: finalRadiusMeters,
          });

          if (error) {
            toast.error("Failed to get postal codes for selection.");
            console.error(error);
          } else {
            const selectedZips = (data || []).map((p: any) => ({ zipCode: p.POSTAL_CODE, stateProvince: p.PROVINCE_ABBR }));
            onBulkSelectionCompleteRef.current(selectedZips);
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

const LoadingOverlay = ({ progress, total }: { progress: number, total: number }) => (
  <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-[1000]">
    <div className="flex flex-col items-center text-gray-700 bg-white p-6 rounded-lg shadow-lg w-64">
      <Loader2 className="h-8 w-8 animate-spin text-gray-500 mb-4" />
      <p className="font-semibold text-lg mb-2">Loading Territories...</p>
      <Progress value={(progress / total) * 100} className="w-full" />
      <p className="text-sm text-gray-500 mt-2">{progress.toLocaleString()} / {total.toLocaleString()}</p>
    </div>
  </div>
);

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
}) => {
  const [allGeoJsonData, setAllGeoJsonData] = useState<any>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  
  const [allCanadaPoints, setAllCanadaPoints] = useState<any[]>([]);
  const [renderedCanadaPoints, setRenderedCanadaPoints] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [totalPointsToLoad, setTotalPointsToLoad] = useState(0);

  const isCanada = country === 'Canada';
  const isTerritoryManagementPage = !isOpen;

  const onZipCodeClickRef = useRef(onZipCodeClick);
  useEffect(() => {
    onZipCodeClickRef.current = onZipCodeClick;
  }, [onZipCodeClick]);

  useEffect(() => {
    const loadInitialData = async () => {
      if (isCanada) {
        if (!centerLocation?.lat || !centerLocation.lng || currentDisplayRadius === 'all') {
          setAllCanadaPoints([]);
          setRenderedCanadaPoints([]);
          setLoadingData(false);
          return;
        }
        setLoadingData(true);
        setAllCanadaPoints([]);
        setRenderedCanadaPoints([]);
        setLoadingProgress(0);
        setTotalPointsToLoad(0);

        try {
          const radiusMeters = (currentDisplayRadius as number) * 1000; // Correctly use km for Canada
          
          const { data: countData, error: countError } = await supabase.functions.invoke('get-map-data-count', {
            body: { country: 'Canada', center: centerLocation, radius: radiusMeters },
          });
          if (countError) throw countError;
          if (countData.error) throw new Error(countData.error);
          
          const totalPoints = countData.count;
          setTotalPointsToLoad(totalPoints);
          if (totalPoints === 0) {
            setLoadingData(false);
            return;
          }

          const totalPages = Math.ceil(totalPoints / FETCH_BATCH_SIZE);
          let allPoints: any[] = [];

          for (let i = 1; i <= totalPages; i++) {
            try {
              const { data: pageData, error: pageError } = await supabase.functions.invoke('get-map-data', {
                body: {
                  country: 'Canada',
                  center: centerLocation,
                  radius: radiusMeters,
                  pageSize: FETCH_BATCH_SIZE,
                  pageNumber: i,
                },
              });

              if (pageError) throw pageError;
              if (pageData.error) throw new Error(pageData.error);

              if (pageData.data) {
                allPoints = [...allPoints, ...pageData.data];
                setLoadingProgress(allPoints.length);
              }
            } catch (err) {
              console.error(`Error fetching page ${i} of Canadian postal codes:`, err);
              toast.error(`Failed to load page ${i}/${totalPages}. Data may be incomplete.`);
            }
          }
          setAllCanadaPoints(allPoints);

        } catch (err: any) {
          console.error("Error fetching Canadian postal codes:", err);
          toast.error(`Failed to load Canadian postal codes: ${err.message}`);
        } finally {
          setLoadingData(false);
        }
      } else {
        // USA GeoJSON logic remains the same
        if (allGeoJsonData) { setLoadingData(false); return; }
        setLoadingData(true);
        try {
          const geoJsonModule = await import('@/data/us-zip-codes.json');
          const geoJson = geoJsonModule.default;
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
          const errorMessage = `CRITICAL ERROR: Could not load GeoJSON data for USA. ${error.message}`;
          console.error(errorMessage, error);
          toast.error(errorMessage, { duration: 10000 });
          setDataError(errorMessage);
        } finally {
          setLoadingData(false);
        }
      }
    };
    loadInitialData();
  }, [isCanada, centerLocation, currentDisplayRadius]);

  // Effect for progressive rendering of Canadian points
  useEffect(() => {
    if (!isCanada || allCanadaPoints.length === 0) {
      setRenderedCanadaPoints([]);
      return;
    }

    setRenderedCanadaPoints([]); // Clear previous renders
    let currentIndex = 0;
    let animationFrameId: number;

    const renderNextBatch = () => {
      const nextBatch = allCanadaPoints.slice(currentIndex, currentIndex + RENDER_BATCH_SIZE);
      setRenderedCanadaPoints(prev => [...prev, ...nextBatch]);
      currentIndex += RENDER_BATCH_SIZE;

      if (currentIndex < allCanadaPoints.length) {
        animationFrameId = requestAnimationFrame(renderNextBatch);
      }
    };

    animationFrameId = requestAnimationFrame(renderNextBatch);

    return () => cancelAnimationFrame(animationFrameId);
  }, [allCanadaPoints, isCanada]);

  const filteredGeoJsonData = useMemo(() => {
    if (isCanada || !allGeoJsonData || !centerLocation?.lat || !centerLocation.lng || currentDisplayRadius === 'all') {
      return allGeoJsonData;
    }

    const radius = typeof currentDisplayRadius === 'number' ? currentDisplayRadius : DEFAULT_DISPLAY_RADIUS_MILES;

    const filteredFeatures = allGeoJsonData.features.filter((feature: any) => {
      const centroid = getCentroid(feature);
      if (centroid.lat && centroid.lng) {
        const distance = calculateDistance(
          centerLocation.lat!,
          centerLocation.lng!,
          centroid.lat,
          centroid.lng
        );
        return distance <= radius;
      }
      return false;
    });

    return {
      ...allGeoJsonData,
      features: filteredFeatures,
    };
  }, [allGeoJsonData, centerLocation, currentDisplayRadius, isCanada]);

  const getGeoJsonStyle = useCallback((zipCode: string): L.PathOptions => {
    const isHighlighted = highlightedZipCodes.get(zipCode);
    const isSelected = selectedZipCodes.some(z => z.zipCode === zipCode);
    const status = isSelected ? selectedZipCodes.find(z => z.zipCode === zipCode)?.assignedStatus : territoryStatuses.get(zipCode);

    let fillColor = '#F0F0F0';
    let color = '#94a3b8';
    let fillOpacity = 0;
    let weight = 1;
    let opacity = 0.15;

    if (isHighlighted === 'green' || (isSelected && status === 'Approved')) {
      fillColor = '#22C55E';
      fillOpacity = 0.1;
      color = '#166534';
      weight = 2;
      opacity = 0.4;
    } else if (isHighlighted === 'orange' || (isSelected && status === 'Needs Approval')) {
      fillColor = '#F97316';
      fillOpacity = 0.1;
      color = '#9A3412';
      weight = 2;
      opacity = 0.4;
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
  }, [highlightedZipCodes, selectedZipCodes, territoryStatuses, isTerritoryManagementPage]);

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

  const usRadii = [
    { radius: 25, color: '#22c55e' },
    { radius: 50, color: '#facc15' },
    { radius: 100, color: '#f97316' },
    { radius: 150, color: '#ef4444' },
  ];

  const caRadii = [
    { radius: 25, color: '#22c55e' },
    { radius: 50, color: '#facc15' },
    { radius: 75, color: '#f97316' },
  ];

  const radiiConfig = isCanada ? caRadii : usRadii;
  const unit = isCanada ? 'km' : 'miles';
  const conversionFactor = isCanada ? 1000 : 1609.34;

  if (dataError && !isCanada) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-red-100 text-red-800 p-4 border-4 border-dashed border-red-500">
        <div className="text-center">
          <h3 className="font-bold text-lg mb-2">Map Data Error</h3>
          <p>{dataError}</p>
        </div>
      </div>
    );
  }

  return (
    <MapContainer
      center={isCanada ? [56.1304, -106.3468] : [39.8283, -98.5795]}
      zoom={isCanada ? 4 : 4}
      minZoom={3}
      maxZoom={18}
      scrollWheelZoom={true}
      className="h-full w-full rounded-lg overflow-hidden shadow-sm"
      renderer={L.canvas()}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      
      <Pane name="polygons" style={{ zIndex: 450 }} />
      
      {loadingData && <LoadingOverlay progress={loadingProgress} total={totalPointsToLoad} />}

      {isCanada && renderedCanadaPoints.length > 0 && (
        renderedCanadaPoints.map(point => {
          const postalCode = point.POSTAL_CODE;
          const status = highlightedZipCodes.get(postalCode);
          let color = '#3b82f6';
          let fillOpacity = 0.5;
          let pointRadius = 2;

          if (status === 'green') {
            color = '#22c55e';
            fillOpacity = 0.7;
            pointRadius = 3;
          } else if (status === 'orange') {
            color = '#f97316';
            fillOpacity = 0.7;
            pointRadius = 3;
          }
          
          return (
            <CircleMarker
              key={point.id}
              center={[point.LATITUDE, point.LONGITUDE]}
              radius={pointRadius}
              pathOptions={{ color, fillColor: color, fillOpacity, weight: 1 }}
              eventHandlers={{
                click: () => onZipCodeClick(postalCode, point.PROVINCE_ABBR),
              }}
            >
              <Tooltip>{postalCode}</Tooltip>
            </CircleMarker>
          );
        })
      )}

      {!isCanada && filteredGeoJsonData && (
        <GeoJSON
          key={geoJsonStyleKey}
          ref={geoJsonLayerRef}
          data={filteredGeoJsonData as any}
          style={(feature) => getGeoJsonStyle(getPostalCode(feature, isCanada))}
          onEachFeature={onEachFeature}
          pane="polygons"
        />
      )}

      {centerLocation?.lat != null && centerLocation?.lng != null && (
        <Marker position={[centerLocation.lat, centerLocation.lng]} icon={createStarIcon()}>
          <Popup>Installer Location</Popup>
        </Marker>
      )}

      {showRadiusCircles && centerLocation?.lat != null && centerLocation?.lng != null && (
        radiiConfig.map(({ radius, color }) => {
          const centerPoint = turf.point([centerLocation.lng!, centerLocation.lat!]);
          const radiusInKmForLabel = isCanada ? radius : radius * 1.60934;
          const topPoint = turf.destination(centerPoint, radiusInKmForLabel, 0, { units: 'kilometers' });
          const labelPosition: [number, number] = [topPoint.geometry.coordinates[1], topPoint.geometry.coordinates[0]];

          const labelIcon = L.divIcon({
            className: 'radius-label-icon',
            html: `<div>${radius} ${unit}</div>`,
            iconAnchor: [25, 10],
          });

          return (
            <React.Fragment key={radius}>
              <Circle
                center={[centerLocation.lat!, centerLocation.lng!]}
                radius={radius * conversionFactor}
                pathOptions={{
                  color: color,
                  fillOpacity: 0,
                  weight: 2,
                  dashArray: '5, 10',
                  interactive: false,
                }}
              />
              <Marker position={labelPosition} icon={labelIcon} interactive={false} />
            </React.Fragment>
          );
        })
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