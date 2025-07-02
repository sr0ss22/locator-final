import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import { cn } from '@/lib/utils';
import { Star } from 'lucide-react';
import { Loader2 } from "lucide-react";
import { calculateDistance } from '@/utils/distance'; // Import the distance utility
import { InstallerZipAssignment } from '@/types/territory'; // Import the new type
import { toast } from 'sonner'; // Import toast for user feedback
import localGeoJson from '/public/GEO-zip-file (2).json'; // Import local GeoJSON file

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
  onZipCodeClick: (zipCode: string, stateProvince: string) => void; // Added stateProvince
  centerLocation?: { lat: number | null; lng: number | null };
  isOpen?: boolean;
  existingTerritories?: InstallerZipAssignment[]; // Now expects InstallerZipAssignment[]
  currentDisplayRadius?: number | 'all'; // New prop: dynamic radius for modal context, now can be 'all'
  showRadiusCircles?: boolean; // New prop to control visibility of radius circles
  highlightedZipCodes: Map<string, 'green' | 'orange'>; // New prop for passing highlight states
  
  // New props for bulk selection
  isBulkSelecting?: boolean;
  onBulkSelectionComplete?: (selectedZips: Array<{ zipCode: string, stateProvince: string }>) => void;
}

// Define a fixed radius for displaying polygons around the center location
// This constant is now only a fallback/default if currentDisplayRadius is not provided
const DEFAULT_DISPLAY_RADIUS_MILES = 25; 

// Helper to calculate the centroid of a GeoJSON polygon
// This is a simplified centroid calculation for display purposes
const getPolygonCentroid = (coordinates: any): L.LatLngTuple | null => {
  if (!coordinates || coordinates.length === 0) return null;

  let latSum = 0;
  let lngSum = 0;
  let count = 0;

  // For MultiPolygon, iterate through each polygon
  if (Array.isArray(coordinates[0][0][0])) { // MultiPolygon
    coordinates.forEach((polygon: any) => {
      polygon[0].forEach((point: any) => {
        lngSum += point[0];
        latSum += point[1];
        count++;
      });
    });
  } else { // Polygon
    coordinates[0].forEach((point: any) => {
      lngSum += point[0];
      latSum += point[1];
      count++;
    });
  }

  if (count === 0) return null;
  return [latSum / count, lngSum / count];
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
  visibleGeoJsonFeatures, // Changed to accept already filtered features
  getZipCodeStyle,
  onEachFeatureCallback,
}: {
  visibleGeoJsonFeatures: any[]; // Renamed prop
  getZipCodeStyle: (feature: any) => L.PathOptions;
  onEachFeatureCallback: (feature: any, layer: L.Layer) => void;
}) {
  const map = useMap();
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);

  // Effect for initial creation and dynamic updating of features within the stable GeoJSON layer
  useEffect(() => {
    if (!map) return;

    // Initialize the GeoJSON layer once if it doesn't exist
    if (!geoJsonLayerRef.current) {
      geoJsonLayerRef.current = L.geoJSON(null, { // Initialize with no features
        style: (feature) => getZipCodeStyle(feature), // Initial style for new features
        onEachFeature: onEachFeatureCallback, // Attach event listeners
      }).addTo(map);
    }

    // Clear existing layers from the GeoJSON group
    geoJsonLayerRef.current.clearLayers();

    // Add only the currently visible features
    if (visibleGeoJsonFeatures.length > 0) {
      geoJsonLayerRef.current.addData({
        type: 'FeatureCollection',
        features: visibleGeoJsonFeatures
      });
    }

    // Cleanup function (only remove the main layer if component unmounts)
    return () => {
      if (geoJsonLayerRef.current && map.hasLayer(geoJsonLayerRef.current)) {
        map.removeLayer(geoJsonLayerRef.current);
        geoJsonLayerRef.current = null;
      }
    };
  }, [map, visibleGeoJsonFeatures, getZipCodeStyle, onEachFeatureCallback]); // Dependencies for layer creation and feature management

  // Effect for updating styles when existingTerritories or highlightedZipCodes change
  // This effect will re-apply styles to existing layers without re-creating them
  useEffect(() => {
    if (!geoJsonLayerRef.current) return;

    geoJsonLayerRef.current.eachLayer(layer => {
      if (layer.feature) {
        layer.setStyle(getZipCodeStyle(layer.feature));
      }
    });
  }, [getZipCodeStyle]); // Only depends on getZipCodeStyle now

  return null;
} // End of GeoJsonLayerManager

// New component to handle map interactions like bulk selection drawing
function MapInteractionHandler({
  isBulkSelecting,
  geoJsonData, // This should be the full geoJsonData, as bulk selection can span beyond filtered view
  onBulkSelectionComplete,
}: {
  isBulkSelecting: boolean;
  geoJsonData: any;
  onBulkSelectionComplete: ((selectedZips: Array<{ zipCode: string, stateProvince: string }>) => void) | undefined;
}) {
  const map = useMap();
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStartLatLng, setDrawStartLatLng] = useState<L.LatLng | null>(null);
  const [currentDrawCircle, setCurrentDrawCircle] = useState<L.Circle | null>(null);

  // Create a ref for the latest onBulkSelectionComplete
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
        // Clear any previous circle
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
          currentDrawCircle.setLatLng(drawStartLatLng); // Ensure center remains start point
        } else {
          const newCircle = L.circle(drawStartLatLng, {
            radius: distanceMeters,
            color: '#1D4ED8', // Tailwind blue-700
            fillColor: '#BFDBFE', // Tailwind blue-200
            fillOpacity: 0.3,
            weight: 2,
            interactive: false, // Make circle non-interactive
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
          if (feature.geometry && feature.properties.INTPTLAT20 && feature.properties.INTPTLON20) {
            // Use centroid from properties for more accurate check
            if (isPointInCircle(feature.properties.INTPTLAT20, feature.properties.INTPTLON20, finalCenter.lat, finalCenter.lng, finalRadiusMeters)) {
              const zipCode = feature.properties.ZCTA5CE20; // Use ZCTA5CE20 from local GeoJSON
              const stateProvince = feature.properties.STUSPS || 'Unknown'; // Use STUSPS from local GeoJSON
              selectedZips.push({ zipCode, stateProvince });
            }
          }
        });
        onBulkSelectionCompleteRef.current(selectedZips);
      }

      // Clean up drawing state and circle
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
      map.dragging.disable(); // Disable map dragging during bulk select
      map.doubleClickZoom.disable(); // Disable double click zoom
      map.scrollWheelZoom.disable(); // Disable scroll wheel zoom
    } else {
      map.off('mousedown', handleMouseDown);
      map.off('mousemove', handleMouseMove);
      map.off('mouseup', handleMouseUp);
      map.dragging.enable(); // Re-enable map dragging
      map.doubleClickZoom.enable(); // Re-enable double click zoom
      map.scrollWheelZoom.enable(); // Re-enable scroll wheel zoom
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
  }, [map, isBulkSelecting, isDrawing, drawStartLatLng, currentDrawCircle, geoJsonData, onBulkSelectionCompleteRef]);
} // End of MapInteractionHandler


// Component to handle initial map view setting imperatively
function MapBoundsUpdater({ centerLocation, filteredGeoJsonFeatures, isOpen, existingTerritories }: { // Changed allGeoJsonData to filteredGeoJsonFeatures
  centerLocation?: { lat: number | null; lng: number | null };
  filteredGeoJsonFeatures: any[]; // Changed prop name
  isOpen: boolean;
  existingTerritories: InstallerZipAssignment[];
}) {
  const map = useMap();
  const lastAppliedView = useRef<{ bounds?: L.LatLngBounds; center?: L.LatLngTuple; zoom?: number } | null>(null);

  // Effect to invalidate map size when modal opens
  useEffect(() => {
    if (isOpen) {
      // Give the modal animation a moment to complete
      const timer = setTimeout(() => {
        map.invalidateSize();
      }, 350); // Adjust delay if needed based on modal animation
      return () => clearTimeout(timer);
    }
  }, [isOpen, map]);

  useEffect(() => {
    // Crucial: Only proceed if map is loaded and its container is available
    if (!map || !map._loaded || !map.getContainer()) {
      return;
    }

    let newBounds: L.LatLngBounds | null = null;
    let newCenter: L.LatLngTuple | null = null;
    let newZoom: number | null = null;

    if (isOpen) { // Modal context (EditInstallerPage)
      if (centerLocation?.lat !== null && centerLocation?.lng !== null) {
        // When in modal, if there's a center location, we want to show that and the surrounding filtered ZIPS.
        // So, calculate bounds to include the center and all filtered features.
        const tempBounds = L.latLngBounds([]);
        tempBounds.extend([centerLocation.lat, centerLocation.lng]); // Include installer location

        filteredGeoJsonFeatures.forEach(feature => {
          if (feature.geometry) {
            // Create a temporary Leaflet GeoJSON layer for this feature to get its bounds
            const tempLayer = L.geoJSON(feature);
            tempLayer.eachLayer(layer => {
              if (layer instanceof L.Polygon || layer instanceof L.MultiPolygon) {
                tempBounds.extend(layer.getBounds());
              } else if (layer instanceof L.Marker) { // Also handle point geometries if any
                tempBounds.extend(layer.getLatLng());
              }
            });
          }
        });

        if (tempBounds.isValid()) {
          newBounds = tempBounds;
        } else {
          // Fallback if no valid features or only center point
          newCenter = [centerLocation.lat, centerLocation.lng];
          newZoom = 10;
        }
      } else {
        newCenter = [39.8283, -98.5795]; // Default if no installer location
        newZoom = 4;
      }
    } else { // Full-page context (TerritoryManagement)
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

    // Compare with last applied view to prevent unnecessary updates
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
} // End of MapBoundsUpdater


const TerritoryMap: React.FC<TerritoryMapProps> = ({
  onZipCodeClick,
  centerLocation,
  isOpen = false,
  existingTerritories = [], // Now InstallerZipAssignment[]
  currentDisplayRadius = DEFAULT_DISPLAY_RADIUS_MILES,
  showRadiusCircles = false,
  highlightedZipCodes, // Use the new prop
  isBulkSelecting = false, // New prop
  onBulkSelectionComplete, // New prop
}) => {
  const [allGeoJsonData, setAllGeoJsonData] = useState<any>(null); // Renamed to allGeoJsonData
  const [loadingGeoJson, setLoadingGeoJson] = useState(true);

  // Determine if this map instance is for the TerritoryManagement page
  const isTerritoryManagementPage = !isOpen;

  // Create a ref for the latest onZipCodeClick
  const onZipCodeClickRef = useRef(onZipCodeClick);
  useEffect(() => {
    onZipCodeClickRef.current = onZipCodeClick;
  }, [onZipCodeClick]);

  useEffect(() => {
    setLoadingGeoJson(true);
    // Directly use the imported local GeoJSON data
    setAllGeoJsonData(localGeoJson);
    setLoadingGeoJson(false);
  }, []); // No dependencies needed as it's a static import

  // Memoized filtered features based on radius or all data
  const filteredGeoJsonFeatures = useMemo(() => {
    // Only proceed if allGeoJsonData is loaded and has features
    if (loadingGeoJson || !allGeoJsonData || !allGeoJsonData.features) {
      console.log("TerritoryMap: GeoJSON data not yet loaded or empty, returning empty array for filteredGeoJsonFeatures.");
      return [];
    }

    if (isTerritoryManagementPage || currentDisplayRadius === 'all' || !centerLocation || centerLocation.lat === null || centerLocation.lng === null) {
      // If on TerritoryManagement page, or radius is 'all', or no center location, show all features
      console.log("TerritoryMap: Displaying all GeoJSON features (not filtering by radius).");
      return allGeoJsonData.features;
    }

    // Otherwise, filter by radius
    const radiusInMeters = currentDisplayRadius * 1609.34; // Convert miles to meters
    const filtered = allGeoJsonData.features.filter((feature: any) => {
      if (feature.properties.INTPTLAT20 && feature.properties.INTPTLON20) {
        const inCircle = isPointInCircle(
          feature.properties.INTPTLAT20,
          feature.properties.INTPTLON20,
          centerLocation.lat!,
          centerLocation.lng!,
          radiusInMeters
        );
        // Log for debugging:
        if (feature.properties.ZCTA5CE20 === '22030' || feature.properties.ZCTA5CE20 === '20170') { // Example ZIPs near the installer
          console.log(`TerritoryMap Debug: Installer: [${centerLocation.lat}, ${centerLocation.lng}], ZIP: ${feature.properties.ZCTA5CE20} Centroid: [${feature.properties.INTPTLAT20}, ${feature.properties.INTPTLON20}], Distance: ${calculateDistance(feature.properties.INTPTLAT20, feature.properties.INTPTLON20, centerLocation.lat!, centerLocation.lng!).toFixed(2)} miles, In Radius: ${inCircle}`);
        }
        return inCircle;
      }
      return false;
    });
    console.log(`TerritoryMap: Filtered GeoJSON features by radius (${currentDisplayRadius} miles) around [${centerLocation.lat}, ${centerLocation.lng}] - count: ${filtered.length}`);
    return filtered;
  }, [allGeoJsonData, centerLocation, currentDisplayRadius, isTerritoryManagementPage, loadingGeoJson]);


  // This function will be used to determine the style of each ZIP code polygon dynamically
  const getZipCodeStyle = useCallback((feature: any) => {
    const zipCode = feature.properties.ZCTA5CE20; // Use ZCTA5CE20 from properties
    
    const highlightState = highlightedZipCodes.get(zipCode); // Get highlight state first (from EditInstallerPage)

    let fillColor = '#F0F0F0'; // Default: very light gray for unassigned
    let color = '#60A5FA'; // Default: lighter blue border (tailwind blue-400)
    let weight = 1; // Default border weight (thinner)
    let fillOpacity = 0.3;
    let dashArray: string | null = null;

    if (highlightState === 'green') {
      // EditInstallerPage: First click (Approved for THIS installer)
      color = '#22C55E'; // Green border (tailwind green-600)
      fillColor = '#DCFCE7'; // Light green fill (tailwind green-100)
      weight = 3; // Thicker border
      fillOpacity = 0.8; // More opaque fill
    } else if (highlightState === 'orange') {
      // EditInstallerPage: Second click (Needs Approval for THIS installer)
      color = '#F97316'; // Orange border (tailwind orange-600)
      fillColor = '#FFEDD5'; // Light orange fill (tailwind orange-100)
      weight = 3; // Thicker border
      fillOpacity = 0.8; // More opaque fill
    } else {
      // No highlight from current interaction, apply base styling based on existing assignments
      // For TerritoryManagement page, or unselected zips in EditInstallerPage
      const approvedByAnyInstaller = existingTerritories.some(t => t.zip_code === zipCode && t.status === 'Approved');
      const needsApprovalByAnyInstaller = existingTerritories.some(t => t.zip_code === zipCode && t.status === 'Needs Approval');

      if (approvedByAnyInstaller) {
        fillColor = '#D4EDDA'; // Very light green for Approved by any installer
        fillOpacity = 0.4;
        weight = 1.5;
      } else if (needsApprovalByAnyInstaller) {
        fillColor = '#FFF3CD'; // Very light orange for Needs Approval by any installer
        fillOpacity = 0.4;
        weight = 1.5;
      }
      // If no existing assignment and no highlight, it remains default #F0F0F0 fill and #60A5FA border
    }

    return {
      fillColor,
      weight,
      opacity: 1, // Always opaque border
      color,
      fillOpacity,
      dashArray,
      interactive: true,
    };
  }, [existingTerritories, highlightedZipCodes, isOpen, centerLocation]); // Dependencies for style calculation

  // This callback is passed to GeoJsonLayerManager and used for onEachFeature
  const onEachFeatureCallback = useCallback((feature: any, layer: L.Layer) => {
    const zipCode = feature.properties.ZCTA5CE20; // Use ZCTA5CE20 from properties
    // Ensure stateProvince is always a string, even if STUSPS is null/undefined
    const stateProvince = feature.properties.STUSPS || 'Unknown'; // Use STUSPS from properties
    
    // Ensure no duplicate listeners if layer is somehow re-used without full re-creation
    layer.off('click'); 

    layer.on({
      click: (e) => {
        L.DomEvent.stopPropagation(e); // Crucial: Stop propagation to prevent map click events
        // Only allow individual clicks if not in bulk selecting mode
        if (!isBulkSelecting) {
          // Call parent's click handler for database/list updates using the ref
          onZipCodeClickRef.current(zipCode, stateProvince); 
        }
      },
    });
    layer.bindTooltip(`ZIP: ${zipCode} (${stateProvince})`, { permanent: false, direction: 'auto' }); // Bind tooltip
  }, [isBulkSelecting]); // Dependency on isBulkSelecting to enable/disable click behavior


  if (loadingGeoJson) {
    return (
      <div className="h-full w-full flex items-center justify-center text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin mr-2" /> Loading map data...
      </div>
    );
  }

  // Define specific options for each circle
  const yellowCircleOptions = {
    color: '#FACC15', // Tailwind yellow-400
    fillOpacity: 0,
    dashArray: '5, 5',
    weight: 2,
  };

  const orangeCircleOptions = {
    color: '#FB923C', // Tailwind orange-400
    fillOpacity: 0,
    dashArray: '5, 5',
    weight: 2,
  };

  const lightRedCircleOptions = {
    color: '#FCA5A5', // Tailwind red-300
    fillOpacity: 0,
    dashArray: '5, 5',
    weight: 2,
  };

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
      {/* Conditionally render installer marker and radius circles only if NOT on TerritoryManagementPage */}
      {!isTerritoryManagementPage && centerLocation?.lat !== null && centerLocation?.lng !== null && (
        <>
          <Marker
            position={[centerLocation.lat, centerLocation.lng]}
            icon={createStarIcon()}
          >
            <Popup>Installer Location</Popup>
          </Marker>

          {showRadiusCircles && (
            <>
              {/* 25-mile radius circle (Yellow) */}
              <Circle center={[centerLocation.lat, centerLocation.lng]} radius={25 * 1609.34} pathOptions={yellowCircleOptions} />

              {/* 50-mile radius circle (Orange) */}
              <Circle center={[centerLocation.lat, centerLocation.lng]} radius={50 * 1609.34} pathOptions={orangeCircleOptions} />

              {/* 100-mile radius circle (Light Red) */}
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
        geoJsonData={allGeoJsonData} // Pass allGeoJsonData to bulk selector
        onBulkSelectionComplete={onBulkSelectionComplete}
      />

      {/* New Territory Status Legend */}
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