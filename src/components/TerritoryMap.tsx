import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as turf from '@turf/turf';
import proj4 from 'proj4'; // Import proj4 for coordinate transformation

// Define the projection for EPSG:3857 (Web Mercator)
proj4.defs("EPSG:3857", "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs");
// Define the projection for EPSG:4326 (WGS84 Geographic)
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

// Fix for default Leaflet icon paths
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

interface TerritoryMapProps {
  country: 'USA' | 'Canada';
  isOpen: boolean;
  centerLocation: { lat: number; lng: number } | null;
  onZipCodeClick: (zipCode: string, stateProvince: string) => void;
  selectedZipCodes: Array<{ zipCode: string; assignedStatus: 'Approved' | 'Needs Approval'; stateProvince: string; centroid_latitude: number | null; centroid_longitude: number | null }>;
  currentDisplayRadius: number | 'all';
  showRadiusCircles: boolean;
  existingTerritories: Array<{ zip_code: string; installer_id: string; status: 'Approved' | 'Needs Approval' }>;
  highlightedZipCodes: Map<string, 'green' | 'orange'>;
  isBulkSelecting: boolean;
  onBulkSelectionComplete: (selectedZips: Array<{ zipCode: string, stateProvince: string }>) => void;
}

// Import GeoJSON data
import usGeoJson from '@/data/us-zip-codes.json' with { type: 'json' };
import canadaGeoJson from '@/data/canada-postal-codes.json' with { type: 'json' };

const TerritoryMap: React.FC<TerritoryMapProps> = ({
  country,
  isOpen,
  centerLocation,
  onZipCodeClick,
  selectedZipCodes,
  currentDisplayRadius,
  showRadiusCircles,
  existingTerritories,
  highlightedZipCodes,
  isBulkSelecting,
  onBulkSelectionComplete,
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const selectRectRef = useRef<L.Rectangle | null>(null);
  const startLatLngRef = useRef<L.LatLng | null>(null);
  const isDrawingRef = useRef(false);

  const [mapCenter, setMapCenter] = useState<L.LatLngExpression>([39.8283, -98.5795]); // Default to US center
  const [mapZoom, setMapZoom] = useState(4); // Default zoom for US

  // Helper to recursively reproject and optionally flip coordinates
  const processCoordinatesRecursive = useCallback((coords: any, fromProj: string | null, toProj: string, flip: boolean): any => {
    if (Array.isArray(coords[0])) {
      // If it's an array of arrays (e.g., MultiPolygon, Polygon)
      return coords.map(c => processCoordinatesRecursive(c, fromProj, toProj, flip));
    } else {
      let processedCoords = coords;
      if (fromProj && fromProj !== toProj) {
        processedCoords = proj4(fromProj, toProj, coords);
      }
      if (flip) {
        // Flip [lng, lat] to [lat, lng] or vice-versa
        return [processedCoords[1], processedCoords[0]];
      }
      return processedCoords;
    }
  }, []);

  const allGeoJsonData = useMemo(() => {
    let data = null;
    let needsFlip = false; // Flag to indicate if coordinates need flipping
    if (country === 'Canada') {
      data = canadaGeoJson;
      // Canadian data is EPSG:3857, needs reprojection to EPSG:4326.
      // Assuming original EPSG:3857 is [easting, northing] which maps to [lng, lat] after reprojection.
      // So, no flip needed after reprojection.
      needsFlip = false; 
    } else { // USA
      data = usGeoJson;
      // US data is already EPSG:4326.
      // Based on migrate-geojson.js using ST_FlipCoordinates, it implies original US GeoJSON is [lat, lng].
      // So, it needs to be flipped to [lng, lat] for Leaflet.
      needsFlip = true; 
    }

    if (data && data.features) {
      const clonedData = JSON.parse(JSON.stringify(data));

      clonedData.features = clonedData.features.map((feature: any) => {
        if (feature.geometry && feature.geometry.coordinates) {
          feature.geometry.coordinates = processCoordinatesRecursive(
            feature.geometry.coordinates,
            country === 'Canada' ? 'EPSG:3857' : null, // Only reproject if Canada
            'EPSG:4326',
            needsFlip // Apply flip based on country
          );
        }
        return feature;
      });
      return clonedData;
    }
    return null;
  }, [country, processCoordinatesRecursive]);

  useEffect(() => {
    if (country === 'Canada') {
      setMapCenter([56.1304, -106.3468]); // Center of Canada
      setMapZoom(3);
    } else {
      setMapCenter([39.8283, -98.5795]); // Center of USA
      setMapZoom(4);
    }
  }, [country]);

  useEffect(() => {
    if (centerLocation && mapRef.current) {
      mapRef.current.setView([centerLocation.lat, centerLocation.lng], 9);
    }
  }, [centerLocation]);

  const getZipCodeStyle = useCallback((feature: any) => {
    const zipCode = country === 'Canada' ? feature.properties.CFSAUID : feature.properties.ZCTA5CE20;
    const highlightColor = highlightedZipCodes.get(zipCode);

    let fillColor = '#808080'; // Default grey for unassigned
    let fillOpacity = 0.2;
    let color = '#555555';
    let weight = 1;

    if (highlightColor === 'green') {
      fillColor = '#4CAF50'; // Green for Approved
      fillOpacity = 0.5;
      color = '#388E3C';
      weight = 2;
    } else if (highlightColor === 'orange') {
      fillColor = '#FF9800'; // Orange for Needs Approval
      fillOpacity = 0.5;
      color = '#F57C00';
      weight = 2;
    } else {
      // Check if it's assigned to another installer
      const isAssignedToOther = existingTerritories.some(
        (t) => t.zip_code === zipCode && t.installer_id !== (centerLocation ? 'currentInstallerId' : '') // Placeholder for current installer ID if needed
      );
      if (isAssignedToOther) {
        fillColor = '#FF0000'; // Red for assigned to other
        fillOpacity = 0.3;
        color = '#CC0000';
        weight = 1;
      }
    }

    return {
      fillColor,
      weight,
      opacity: 1,
      color,
      fillOpacity,
    };
  }, [highlightedZipCodes, existingTerritories, country, centerLocation]);

  const onEachFeature = useCallback((feature: any, layer: L.Layer) => {
    const zipCode = country === 'Canada' ? feature.properties.CFSAUID : feature.properties.ZCTA5CE20;
    const stateProvince = country === 'Canada' ? feature.properties.PRNAME : feature.properties.STUSPS;

    layer.on({
      click: () => {
        if (!isDrawingRef.current) { // Only allow click if not currently drawing a bulk selection
          onZipCodeClick(zipCode, stateProvince);
        }
      },
      mouseover: (e) => {
        const layer = e.target;
        layer.setStyle({
          weight: 3,
          color: '#666',
          fillOpacity: 0.7,
        });
        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
          layer.bringToFront();
        }
        layer.bindPopup(`<b>${country === 'Canada' ? 'FSA' : 'ZIP'}:</b> ${zipCode}<br><b>${country === 'Canada' ? 'Province' : 'State'}:</b> ${stateProvince}`).openPopup();
      },
      mouseout: (e) => {
        const layer = e.target;
        // Reset style to default or highlighted
        const style = getZipCodeStyle(feature);
        layer.setStyle(style);
        layer.closePopup();
      },
    });
  }, [onZipCodeClick, getZipCodeStyle, country]);

  const MapEvents = () => {
    useMapEvents({
      mousedown: (e) => {
        if (isBulkSelecting) {
          isDrawingRef.current = true;
          startLatLngRef.current = e.latlng;
          if (selectRectRef.current) {
            selectRectRef.current.remove();
          }
          selectRectRef.current = L.rectangle([e.latlng, e.latlng], { color: '#007bff', weight: 2, fillOpacity: 0.1 }).addTo(mapRef.current!);
        }
      },
      mousemove: (e) => {
        if (isDrawingRef.current && selectRectRef.current && startLatLngRef.current) {
          selectRectRef.current.setBounds(L.latLngBounds(startLatLngRef.current, e.latlng));
        }
      },
      mouseup: () => {
        if (isDrawingRef.current && selectRectRef.current && startLatLngRef.current) {
          isDrawingRef.current = false;
          const bounds = selectRectRef.current.getBounds();
          selectRectRef.current.remove();
          selectRectRef.current = null;
          startLatLngRef.current = null;

          const selectedZips: Array<{ zipCode: string, stateProvince: string }> = [];
          if (allGeoJsonData) {
            allGeoJsonData.features.forEach((feature: any) => {
              const zipCode = country === 'Canada' ? feature.properties.CFSAUID : feature.properties.ZCTA5CE20;
              const stateProvince = country === 'Canada' ? feature.properties.PRNAME : feature.properties.STUSPS;

              // Use turf.booleanIntersects for more robust intersection check
              // Ensure the feature geometry is valid for turf operations
              let featureGeometry = feature.geometry;
              if (featureGeometry && featureGeometry.coordinates && featureGeometry.type) {
                try {
                  const featurePolygon = turf.polygon(featureGeometry.coordinates);
                  const boundsPolygon = turf.bboxPolygon([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]);
    
                  if (turf.booleanIntersects(featurePolygon, boundsPolygon)) {
                    selectedZips.push({ zipCode, stateProvince });
                  }
                } catch (e) {
                  console.warn(`Skipping intersection check for invalid feature geometry (ZIP: ${zipCode}):`, e);
                }
              }
            });
          }
          onBulkSelectionComplete(selectedZips);
        }
      },
    });
    return null;
  };

  if (!isOpen) {
    return null; // Don't render map if not open
  }

  return (
    <MapContainer
      center={mapCenter}
      zoom={mapZoom}
      scrollWheelZoom={true}
      style={{ height: '100%', width: '100%' }}
      whenCreated={mapInstance => { mapRef.current = mapInstance; }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapEvents />
      {allGeoJsonData && (
        <GeoJSON
          key={country} // Force re-render when country changes
          data={allGeoJsonData}
          style={getZipCodeStyle}
          onEachFeature={onEachFeature}
        />
      )}
      {centerLocation && showRadiusCircles && (
        <>
          <Marker position={[centerLocation.lat, centerLocation.lng]}>
            <Popup>Installer Location</Popup>
          </Marker>
          {currentDisplayRadius !== 'all' && (
            <Circle center={[centerLocation.lat, centerLocation.lng]} radius={currentDisplayRadius * 1609.34} pathOptions={{ color: 'blue', fillColor: 'blue', fillOpacity: 0.1 }} />
          )}
        </>
      )}
    </MapContainer>
  );
};

// Dummy Circle component for now, replace with actual if needed
const Circle: React.FC<{ center: L.LatLngExpression, radius: number, pathOptions: L.PathOptions }> = ({ center, radius, pathOptions }) => {
  const map = useMapEvents({});
  useEffect(() => {
    const circle = L.circle(center, { radius, ...pathOptions }).addTo(map);
    return () => {
      map.removeLayer(circle);
    };
  }, [map, center, radius, pathOptions]);
  return null;
};

export default TerritoryMap;