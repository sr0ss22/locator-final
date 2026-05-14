import React, { useEffect, useState, useRef, useCallback, useMemo, memo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle, GeoJSON, Pane, Tooltip, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { cn } from '@/lib/utils';
import { Star, Loader2 } from 'lucide-react';
import { calculateDistance } from '@/utils/distance';
import { TerritoryStatus } from '@/types/territory';
import { toast } from 'sonner';
import * as turf from '@turf/turf';
import proj4 from 'proj4';
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
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
}

const DEFAULT_DISPLAY_RADIUS_MILES = 25;
const RENDER_BATCH_SIZE = 2000;

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
  publicAuth,
}: {
  isBulkSelecting: boolean;
  geoJsonData: any;
  onBulkSelectionComplete: ((selectedZips: Array<{ zipCode: string, stateProvince: string }>) => void) | undefined;
  isCanada: boolean;
  publicAuth?: { installerId: string; token: string };
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

const LoadingOverlay = ({ progress, total, stage }: { progress: number, total: number, stage: 'counting' | 'fetching' | 'rendering' }) => (
  <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-[1000]">
    <div className="flex flex-col items-center text-gray-700 bg-white p-6 rounded-lg shadow-lg w-64">
      <Loader2 className="h-8 w-8 animate-spin text-gray-500 mb-4" />
      <p className="font-semibold text-lg mb-2">
        {stage === 'counting' ? 'Calculating...' : stage === 'fetching' ? 'Fetching Territories...' : 'Rendering Territories...'}
      </p>
      {stage !== 'counting' && (
        <>
          <Progress value={total > 0 ? (progress / total) * 100 : 0} className="w-full" />
          <p className="text-sm text-gray-500 mt-2">{progress.toLocaleString()} / {total.toLocaleString()}</p>
        </>
      )}
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
  refreshKey = 0,
  publicAuth,
}) => {
  const [allGeoJsonData, setAllGeoJsonData] = useState<any>(null);
  const [allCanadaGeoJsonData, setAllCanadaGeoJsonData] = useState<any>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  
  const [allCanadaPoints, setAllCanadaPoints] = useState<any[]>([]);
  const [renderedCanadaPoints, setRenderedCanadaPoints] = useState<any[]>([]);
  const [loadingStage, setLoadingStage] = useState<'idle' | 'counting' | 'fetching' | 'rendering' | 'complete'>('idle');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [totalPointsToLoad, setTotalPointsToLoad] = useState(0);
  const lastSearchKey = useRef<string | null>(null);

  const isCanada = country === 'Canada';
  const isTerritoryManagementPage = !isOpen;

  const onZipCodeClickRef = useRef(onZipCodeClick);
  useEffect(() => {
    onZipCodeClickRef.current = onZipCodeClick;
  }, [onZipCodeClick]);

  // Main data loading effect
  useEffect(() => {
    const loadAndRenderData = async () => {
      const searchKey = (isCanada && centerLocation?.lat && centerLocation.lng && currentDisplayRadius !== 'all')
        ? `${centerLocation.lat}-${centerLocation.lng}-${currentDisplayRadius}`
        : null;

      if (isCanada) {
        if (!searchKey || searchKey === lastSearchKey.current) {
          if (!searchKey) {
            setAllCanadaPoints([]);
            setRenderedCanadaPoints([]);
          }
          return;
        }
        lastSearchKey.current = searchKey;
        
        setAllCanadaPoints([]);
        setRenderedCanadaPoints([]);
        setLoadingProgress(0);
        setTotalPointsToLoad(0);
        setLoadingStage('counting');

        try {
          const radiusMeters = (currentDisplayRadius as number) * 1000;
          const { data: count, error: countError } = await supabase.rpc('get_canadian_points_in_radius_count', {
            center_lat: centerLocation!.lat,
            center_lng: centerLocation!.lng,
            radius_meters: radiusMeters,
          });

          if (countError) throw new Error(`Failed to get count: ${countError.message}`);
          if (count === 0) {
            setLoadingStage('complete');
            return;
          }

          setTotalPointsToLoad(count);
          setLoadingStage('fetching');

          const PAGE_SIZE = 1000;
          const totalPages = Math.ceil(count / PAGE_SIZE);
          const CONCURRENCY_LIMIT = 10;
          let fetchedPoints: any[] = [];

          for (let i = 0; i < totalPages; i += CONCURRENCY_LIMIT) {
            const promises = [];
            const chunkEnd = Math.min(i + CONCURRENCY_LIMIT, totalPages);
            for (let j = i; j < chunkEnd; j++) {
              const page = j + 1;
              promises.push(supabase.rpc('get_all_canadian_points_in_radius', {
                  center_lat: centerLocation!.lat,
                  center_lng: centerLocation!.lng,
                  radius_meters: radiusMeters,
                  page_size: PAGE_SIZE,
                  page_number: page,
                }));
            }
            const results = await Promise.all(promises);
            for (const result of results) {
              if (result.data) fetchedPoints = fetchedPoints.concat(result.data);
            }
            setLoadingProgress(fetchedPoints.length);
          }
          
          setAllCanadaPoints(fetchedPoints);
          setLoadingStage('rendering');

          // Also process Canada GeoJSON if not done yet
          if (!allCanadaGeoJsonData && canadaGeoJsonData) {
            const processed = (canadaGeoJsonData as any).features.map((feature: any) => {
              const newFeature = JSON.parse(JSON.stringify(feature));
              try {
                const transformedGeometry = turf.clone(feature.geometry);
                turf.coordEach(transformedGeometry, (currentCoord) => {
                  const [lon, lat] = proj4('EPSG:3347', 'EPSG:4326').forward(currentCoord);
                  currentCoord[0] = lon; currentCoord[1] = lat;
                });
                const centroid = turf.centroid(transformedGeometry);
                if (centroid?.geometry?.coordinates) {
                  newFeature.properties.calculated_centroid = {
                    lat: centroid.geometry.coordinates[1],
                    lng: centroid.geometry.coordinates[0]
                  };
                }
                newFeature.geometry = transformedGeometry; // Use transformed geometry for rendering
              } catch (e) {
                console.error("Error transforming Canada GeoJSON feature", e);
              }
              return newFeature;
            });
            setAllCanadaGeoJsonData({ type: 'FeatureCollection', features: processed });
          }

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
  }, [isCanada, centerLocation, currentDisplayRadius, allCanadaGeoJsonData, allGeoJsonData]);

  useEffect(() => {
    if (loadingStage !== 'rendering' || !isCanada || allCanadaPoints.length === 0) return;
  
    setRenderedCanadaPoints([]);
    setLoadingProgress(0);
    let renderIndex = 0;
    let animationFrameId: number;
  
    const renderNextBatch = () => {
      if (renderIndex >= allCanadaPoints.length) {
        setLoadingStage('complete');
        return;
      }
      const nextBatch = allCanadaPoints.slice(renderIndex, renderIndex + RENDER_BATCH_SIZE);
      setRenderedCanadaPoints(prev => [...prev, ...nextBatch]);
      setLoadingProgress(prev => prev + nextBatch.length);
      renderIndex += RENDER_BATCH_SIZE;
      animationFrameId = requestAnimationFrame(renderNextBatch);
    };
  
    animationFrameId = requestAnimationFrame(renderNextBatch);
    return () => cancelAnimationFrame(animationFrameId);
  }, [loadingStage, allCanadaPoints, isCanada]);

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

  const getGeoJsonStyle = useCallback((zipCode: string): L.PathOptions => {
    let isHighlighted: 'green' | 'orange' | undefined = highlightedZipCodes.get(zipCode);
    let isSelected = selectedZipCodes.some(z => z.zipCode === zipCode);
    let status = isSelected ? selectedZipCodes.find(z => z.zipCode === zipCode)?.assignedStatus : territoryStatuses.get(zipCode);

    // For Canada, zipCode is the FSA (3 chars). We need to check if any 6-char code matches this FSA.
    if (isCanada) {
      // Find if any highlighted zip code starts with this FSA
      for (const [key, value] of highlightedZipCodes.entries()) {
        if (key.startsWith(zipCode)) {
          isHighlighted = value;
          break;
        }
      }
      
      const selectedMatch = selectedZipCodes.find(z => z.zipCode.startsWith(zipCode));
      if (selectedMatch) {
        isSelected = true;
        status = selectedMatch.assignedStatus;
      }
      
      if (!status) {
        for (const [key, value] of territoryStatuses.entries()) {
          if (key.startsWith(zipCode)) {
            status = value as TerritoryStatus;
            break;
          }
        }
      }
    }

    let fillColor = '#F0F0F0';
    let color = '#94a3b8';
    let fillOpacity = 0;
    let weight = 1;
    let opacity = 0.15;

    if (isHighlighted === 'green' || (isSelected && status === 'Approved')) {
      fillColor = '#22C55E';
      fillOpacity = 0.3; // Increased visibility
      color = '#166534';
      weight = 2;
      opacity = 0.6;
    } else if (isHighlighted === 'orange' || (isSelected && status === 'Needs Approval')) {
      fillColor = '#F97316';
      fillOpacity = 0.3; // Increased visibility
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
  }, [highlightedZipCodes, selectedZipCodes, territoryStatuses, isTerritoryManagementPage]);

  const onEachFeature = (feature: any, layer: L.Layer) => {
    const zipCode = getPostalCode(feature, isCanada);
    const stateProvince = getRegion(feature, isCanada);
    layer.off('click'); 
    layer.on({
      click: (e) => {
        L.DomEvent.stopPropagation(e);
        if (!isBulkSelecting) onZipCodeClickRef.current(zipCode, stateProvince); 
      },
    });
    const label = isCanada ? 'FSA' : 'ZIP';
    let tooltipText = `${label}: ${zipCode}`;
    if (stateProvince && stateProvince !== 'Unknown') tooltipText += ` (${stateProvince})`;
    layer.bindTooltip(tooltipText, { permanent: false, direction: 'auto' });
  };

  // The key change is the only reliable way to force React-Leaflet GeoJSON to re-draw colors
  const geoJsonStyleKey = useMemo(() => {
    // We use a combination of simple markers to trigger a redraw without huge strings
    return `${currentDisplayRadius}-${isBulkSelecting}-${refreshKey}-${country}`;
  }, [currentDisplayRadius, isBulkSelecting, refreshKey, country]);

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

  return (
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
      {(loadingStage === 'counting' || loadingStage === 'fetching' || loadingStage === 'rendering') && <LoadingOverlay progress={loadingProgress} total={totalPointsToLoad} stage={loadingStage} />}
      {isCanada && renderedCanadaPoints.length > 0 && (
        renderedCanadaPoints.map(point => {
          const postalCode = point.POSTAL_CODE;
          const status = highlightedZipCodes.get(postalCode);
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
      {filteredGeoJsonData && (
        <GeoJSON key={geoJsonStyleKey} ref={geoJsonLayerRef} data={filteredGeoJsonData as any} style={(feature) => getGeoJsonStyle(getPostalCode(feature, isCanada))} onEachFeature={onEachFeature} pane="polygons" />
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
      <MapUpdater centerLocation={centerLocation} isOpen={isOpen} country={country} />
      <MapInteractionHandler isBulkSelecting={isBulkSelecting} geoJsonData={allGeoJsonData} onBulkSelectionComplete={onBulkSelectionComplete} isCanada={isCanada} publicAuth={publicAuth} />
    </MapContainer>
  );
};

export default memo(TerritoryMap);