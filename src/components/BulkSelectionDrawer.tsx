import React, { useEffect, useRef, useCallback } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { calculateDistance } from '@/utils/distance';
import * as turf from '@turf/turf';
import proj4 from 'proj4'; // Ensure proj4 is imported if needed for centroid calculation

// Define projections if not already globally defined or passed
proj4.defs("EPSG:3857", "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs");
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

interface BulkSelectionDrawerProps {
  isBulkSelecting: boolean;
  geoJsonData: any;
  onBulkSelectionComplete: ((selectedZips: Array<{ zipCode: string, stateProvince: string }>) => void) | undefined;
  isCanada: boolean;
}

// Helper to get postal code (ZIP/FSA) from GeoJSON feature
const getPostalCode = (feature: any, isCanada: boolean): string => {
  if (!feature || !feature.properties) return '';
  return isCanada ? feature.properties.CFSAUID : feature.properties.ZCTA5CE20;
};

// Helper to get region (State/Province) from GeoJSON feature
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

const BulkSelectionDrawer: React.FC<BulkSelectionDrawerProps> = ({
  isBulkSelecting,
  geoJsonData,
  onBulkSelectionComplete,
  isCanada,
}) => {
  const map = useMap();
  const isDrawingRef = useRef(false);
  const drawStartLatLngRef = useRef<L.LatLng | null>(null);
  const currentDrawCircleRef = useRef<L.Circle | null>(null);
  const onBulkSelectionCompleteRef = useRef(onBulkSelectionComplete);

  useEffect(() => {
    onBulkSelectionCompleteRef.current = onBulkSelectionComplete;
  }, [onBulkSelectionComplete]);

  const handleMouseDown = useCallback((e: L.LeafletMouseEvent) => {
    if (!isBulkSelecting) return;
    isDrawingRef.current = true;
    drawStartLatLngRef.current = e.latlng;
    if (currentDrawCircleRef.current) {
      map.removeLayer(currentDrawCircleRef.current);
      currentDrawCircleRef.current = null;
    }
  }, [map, isBulkSelecting]);

  const handleMouseMove = useCallback((e: L.LeafletMouseEvent) => {
    if (isDrawingRef.current && drawStartLatLngRef.current && isBulkSelecting) {
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
  }, [map, isBulkSelecting]);

  const handleMouseUp = useCallback(() => {
    if (isDrawingRef.current && drawStartLatLngRef.current && currentDrawCircleRef.current && geoJsonData && onBulkSelectionCompleteRef.current && isBulkSelecting) {
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

    if (currentDrawCircleRef.current) {
      map.removeLayer(currentDrawCircleRef.current);
      currentDrawCircleRef.current = null;
    }
    isDrawingRef.current = false;
    drawStartLatLngRef.current = null;
  }, [map, isBulkSelecting, geoJsonData, isCanada]);

  useEffect(() => {
    if (isBulkSelecting) {
      map.on('mousedown', handleMouseDown);
      map.on('mousemove', handleMouseMove);
      map.on('mouseup', handleMouseUp);
    } else {
      map.off('mousedown', handleMouseDown);
      map.off('mousemove', handleMouseMove);
      map.off('mouseup', handleMouseUp);
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
      if (currentDrawCircleRef.current) {
        map.removeLayer(currentDrawCircleRef.current);
        currentDrawCircleRef.current = null;
      }
    };
  }, [map, isBulkSelecting, handleMouseDown, handleMouseMove, handleMouseUp]);

  return null;
};

export default BulkSelectionDrawer;