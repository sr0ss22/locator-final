import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save, XCircle, MousePointerClick, Eraser } from "lucide-react";
import { Installer } from "@/types/installer";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import TerritoryMap from "@/components/TerritoryMap";
import { supabase } from "@/integrations/supabase/client";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import InstallerTerritoryList from "@/components/InstallerTerritoryList";
import { TerritoryStatus } from "@/types/territory";
import { cn } from "@/lib/utils";
import usGeoJson from '@/data/us-zip-codes.json' with { type: 'json' };
import canadaGeoJson from '@/data/canada-postal-codes.json' with { type: 'json' };
import * as turf from '@turf/turf';
import proj4 from 'proj4';

proj4.defs("EPSG:3857", "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs");
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

const toBoolean = (value: any): boolean => {
  if (typeof value === 'string') return value.toLowerCase() === '1' || value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';
  return value === 1 || value === true;
};

const PublicTerritoryEditor: React.FC = () => {
  const { installerId, token } = useParams<{ installerId: string; token: string }>();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<any>({});
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [initialSelectedMapZipCodes, setInitialSelectedMapZipCodes] = useState<any[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedMapZipCodes, setSelectedMapZipCodes] = useState<Array<{ zipCode: string, assignedStatus: TerritoryStatus, stateProvince: string, centroid_latitude: number | null, centroid_longitude: number | null }>>([]);
  const [mapDisplayRadius, setMapDisplayRadius] = useState<number | 'all'>(150);
  const [territoryStatuses, setTerritoryStatuses] = useState<Map<string, TerritoryStatus>>(new Map());
  const [currentInstaller, setCurrentInstaller] = useState<Installer | null>(null);
  const [bulkActionType, setBulkActionType] = useState<'approve' | 'needs_approval' | null>('approve');
  const [listDisplayRadius, setListDisplayRadius] = useState<string | 'all'>('all');

  const installerCountry = useMemo(() => {
    const country = formData?.country?.toUpperCase();
    if (country === 'CANADA' || country === 'CA' || country === 'CAN') return 'Canada';
    return 'USA';
  }, [formData?.country]);

  const zipCodeCentroids = useMemo(() => {
    const map = new Map<string, { lat: number, lng: number, state: string }>();
    const geoJsonToProcess = installerCountry === 'Canada' ? canadaGeoJson : usGeoJson;
    if (geoJsonToProcess && geoJsonToProcess.features) {
      geoJsonToProcess.features.forEach(feature => {
        let zipCode: string | null = null, state: string | null = null, lat: number | null = null, lng: number | null = null;
        if (installerCountry === 'Canada') {
          zipCode = feature.properties.CFSAUID; state = feature.properties.PRNAME;
          try {
            // The Canadian GeoJSON is already in EPSG:4326, so no reprojection is needed.
            const centroid = turf.centroid(feature.geometry);
            if (centroid?.geometry?.coordinates) {
              lng = centroid.geometry.coordinates[0];
              lat = centroid.geometry.coordinates[1];
            }
          } catch (e) { console.warn("Error calculating centroid for Canadian feature:", feature, e); }
        } else {
          zipCode = feature.properties.ZCTA5CE20; state = feature.properties.STUSPS;
          lat = parseFloat(feature.properties.INTPTLAT20); lng = parseFloat(feature.properties.INTPTLON20);
        }
        if (zipCode && lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
          map.set(zipCode, { lat, lng, state: state || 'Unknown' });
        }
      });
    }
    return map;
  }, [installerCountry]);

  useEffect(() => {
    toast.info("Bulk Approve mode is active. Click and drag on the map to select territories.", {
      duration: 6000,
    });
  }, []);

  const loadAllData = useCallback(async () => {
    if (!installerId || !token) {
      toast.error("Installer ID or access token is missing.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-public-territory-data', {
        body: { installerId, token },
      });

      if (error || data.error) {
        throw new Error(error?.message || data.error);
      }

      const { installer: installerData, zipCodes: zipData } = data;

      const mappedInstaller: Installer = {
        id: installerData.id, name: installerData.name,
        address: `${installerData.address1 || ''} ${installerData.add2 || ''}, ${installerData.city || ''}, ${installerData.state || ''} ${installerData.postalcode || ''}`.trim(),
        zipCode: installerData.postalcode, phone: installerData.primary_phone, email: installerData.email,
        skills: [], brands: [], certifications: [],
        latitude: installerData.latitude, longitude: installerData.longitude,
        rawSupabaseData: installerData,
      };
      setFormData(installerData);
      setInitialFormData(JSON.parse(JSON.stringify(installerData)));
      setCurrentInstaller(mappedInstaller);

      const enrichedZips = (zipData || []).map((item: any) => {
        const centroid = zipCodeCentroids.get(item.zip_code);
        return {
          zipCode: item.zip_code, assignedStatus: item.status as TerritoryStatus, stateProvince: item.state_province,
          centroid_latitude: centroid?.lat || null, centroid_longitude: centroid?.lng || null,
        };
      });
      setSelectedMapZipCodes(enrichedZips);
      setInitialSelectedMapZipCodes(JSON.parse(JSON.stringify(enrichedZips)));
      setIsDirty(false);
    } catch (err: any) {
      console.error("Error loading public installer data:", err);
      toast.error(`Access Denied: ${err.message}`);
      setCurrentInstaller(null);
    } finally {
      setLoading(false);
    }
  }, [installerId, token, zipCodeCentroids]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault();
        // Standard for most browsers to show the confirmation dialog
        event.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  useEffect(() => {
    if (loading || !initialFormData) return;
    const normalizeZips = (zips: any[]) => zips.map(({ zipCode, assignedStatus }) => ({ zipCode, assignedStatus })).sort((a, b) => a.zipCode.localeCompare(b.zipCode));
    const zipCodesChanged = JSON.stringify(normalizeZips(selectedMapZipCodes)) !== JSON.stringify(normalizeZips(initialSelectedMapZipCodes));
    setIsDirty(zipCodesChanged);
  }, [selectedMapZipCodes, initialSelectedMapZipCodes, loading]);

  const memoizedCenterLocation = useMemo(() => {
    if (currentInstaller?.latitude != null && currentInstaller?.longitude != null) {
      return { lat: currentInstaller.latitude, lng: currentInstaller.longitude };
    }
    return null;
  }, [currentInstaller?.latitude, currentInstaller?.longitude]);

  const handleMapZipCodeClick = useCallback((zipCode: string, stateProvince: string) => {
    setSelectedMapZipCodes(prevSelected => {
      const existingEntryIndex = prevSelected.findIndex(item => item.zipCode === zipCode);
      const centroid = zipCodeCentroids.get(zipCode);
      const centroid_latitude = centroid?.lat || null;
      const centroid_longitude = centroid?.lng || null;
      if (existingEntryIndex !== -1) {
        const currentEntry = prevSelected[existingEntryIndex];
        if (currentEntry.assignedStatus === 'Approved') {
          return [...prevSelected.slice(0, existingEntryIndex), { ...currentEntry, assignedStatus: 'Needs Approval' }, ...prevSelected.slice(existingEntryIndex + 1)];
        } else {
          return prevSelected.filter(item => item.zipCode !== zipCode);
        }
      } else {
        return [...prevSelected, { zipCode, assignedStatus: 'Approved', stateProvince, centroid_latitude, centroid_longitude }];
      }
    });
  }, [zipCodeCentroids]);

  const handleBulkSelectionComplete = useCallback((selectedZips: Array<{ zipCode: string, stateProvince: string }>) => {
    setSelectedMapZipCodes(prevSelected => {
      const prevSelectedMap = new Map(prevSelected.map(item => [item.zipCode, item]));
      const newSelectedMap = new Map(prevSelectedMap);
      selectedZips.forEach(zipInfo => {
        const existing = prevSelectedMap.get(zipInfo.zipCode);
        const centroid = zipCodeCentroids.get(zipInfo.zipCode);
        const centroid_latitude = centroid?.lat || null;
        const centroid_longitude = centroid?.lng || null;
        if (bulkActionType === 'approve') {
          newSelectedMap.set(zipInfo.zipCode, { ...zipInfo, assignedStatus: 'Approved', centroid_latitude, centroid_longitude });
        } else if (bulkActionType === 'needs_approval') {
          if (!existing || existing.assignedStatus === 'Needs Approval') {
            newSelectedMap.set(zipInfo.zipCode, { ...zipInfo, assignedStatus: 'Needs Approval', centroid_latitude, centroid_longitude });
          }
        }
      });
      const updatedList = Array.from(newSelectedMap.values());
      toast.success(`Bulk selected ${selectedZips.length} ZIP codes.`);
      setBulkActionType(null);
      return updatedList;
    });
  }, [bulkActionType, zipCodeCentroids]);

  const highlightedZipCodes = useMemo(() => {
    const highlights = new Map<string, 'green' | 'orange'>();
    selectedMapZipCodes.forEach(item => {
      highlights.set(item.zipCode, item.assignedStatus === 'Approved' ? 'green' : 'orange');
    });
    return highlights;
  }, [selectedMapZipCodes]);

  const handleSubmit = async () => {
    if (!installerId || !token) { toast.error("Missing ID or token. Cannot save."); return; }
    setLoading(true);
    const loadingToastId = toast.loading("Saving territory changes...");
    try {
      const { error } = await supabase.functions.invoke('save-public-territory-data', {
        body: { installerId, token, zipCodes: selectedMapZipCodes },
      });
      if (error) throw new Error(error.message || "An unknown error occurred.");
      toast.success("Territory changes saved successfully! Refreshing data...", { id: loadingToastId });
      await loadAllData();
      toast.success("Save complete. Data is up to date.", { id: loadingToastId, duration: 4000 });
    } catch (err: any) {
      console.error("Error saving territories:", err);
      toast.error(`Failed to save changes: ${err.message}`, { id: loadingToastId });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleBulkSelect = (action: 'approve' | 'needs_approval') => {
    setBulkActionType(prev => {
      if (prev === action) { toast.info("Bulk selection mode deactivated."); return null; }
      else { toast.info(`Bulk ${action === 'approve' ? 'approval' : 'needs approval'} mode activated. Click and drag on the map.`); return action; }
    });
  };

  const handleClearAllAssignedZips = () => {
    setSelectedMapZipCodes([]);
    toast.info("All assigned ZIP codes cleared from selection.");
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-gray-500" /><p className="text-gray-500 ml-2">Loading installer data...</p></div>;
  }
  if (!currentInstaller) {
    return <div className="min-h-screen flex flex-col items-center justify-center text-red-500"><p className="text-xl mb-4">Access Denied or Installer Not Found.</p><p>Please check your link and try again.</p></div>;
  }

  return (
    <>
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 pb-24">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-700">Territory Editor: {currentInstaller.name}</h1>
            {currentInstaller.email && <p className="text-md text-gray-500">{currentInstaller.email}</p>}
          </div>
        </div>
        <div className="grid gap-6 py-4">
          <div className="col-span-full mt-6">
            <h3 className="text-lg font-semibold mb-2">Assigned Territories</h3>
            <div className="flex flex-wrap justify-between gap-2 mb-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className={cn(bulkActionType === 'approve' ? "bg-green-600 text-white hover:bg-green-700" : "border-green-600 text-green-600 hover:bg-green-100")} onClick={() => handleToggleBulkSelect('approve')} disabled={loading}><MousePointerClick className="mr-2 h-4 w-4" /> {bulkActionType === 'approve' ? "Exit Bulk Approve" : "Bulk Approve"}</Button>
                <Button variant="outline" className={cn(bulkActionType === 'needs_approval' ? "bg-orange-600 text-white hover:bg-orange-700" : "border-orange-600 text-orange-600 hover:bg-orange-100")} onClick={() => handleToggleBulkSelect('needs_approval')} disabled={loading}><MousePointerClick className="mr-2 h-4 w-4" /> {bulkActionType === 'needs_approval' ? "Exit Bulk Needs Approval" : "Bulk Needs Approval"}</Button>
                <Button variant="outline" onClick={handleClearAllAssignedZips} disabled={loading || selectedMapZipCodes.length === 0}><Eraser className="mr-2 h-4 w-4" /> Clear All Assigned</Button>
              </div>
            </div>
            <div className="h-[800px] w-full rounded-lg overflow-hidden shadow-sm border">
              <TerritoryMap country={installerCountry} isOpen={true} centerLocation={memoizedCenterLocation} onZipCodeClick={handleMapZipCodeClick} selectedZipCodes={selectedMapZipCodes} currentDisplayRadius={mapDisplayRadius} showRadiusCircles={true} territoryStatuses={territoryStatuses} highlightedZipCodes={highlightedZipCodes} isBulkSelecting={bulkActionType !== null} onBulkSelectionComplete={handleBulkSelectionComplete} />
            </div>
            <p className="text-sm text-gray-500 mt-2">Click on ZIP code areas to assign/unassign them. In bulk select mode, click and drag to select multiple ZIP codes.</p>
            <div className="mt-6 p-4 border rounded-lg shadow-sm bg-card">
              <h4 className="font-semibold text-lg mb-3">Filter Assigned ZIPs by Radius (from Installer)</h4>
              <RadioGroup value={listDisplayRadius} onValueChange={(value) => setListDisplayRadius(value)} className="flex flex-wrap gap-4">
                {['0-25', '25-50', '50-75', '75-100', '100-125', '150+'].map(range => (<div key={range} className="flex items-center space-x-2"><RadioGroupItem value={range} id={`list-radius-${range}`} /><Label htmlFor={`list-radius-${range}`}>{range} miles</Label></div>))}
                <div className="flex items-center space-x-2"><RadioGroupItem value="all" id="list-radius-all" /><Label htmlFor={`list-radius-all`}>All</Label></div>
              </RadioGroup>
            </div>
            <InstallerTerritoryList assignedZipCodes={selectedMapZipCodes} onZipCodeClick={handleMapZipCodeClick} mapClickStates={highlightedZipCodes} installerLocation={memoizedCenterLocation} listDisplayRadius={listDisplayRadius} />
          </div>
        </div>
      </div>
      {isDirty && (
        <div className="sticky bottom-0 left-0 w-full z-[1000] bg-background/80 backdrop-blur-sm border-t border-border">
          <div className="container mx-auto p-4 flex justify-end gap-2">
            <Button variant="outline" onClick={loadAllData} disabled={loading}>
              <XCircle className="mr-2 h-4 w-4" /> Discard Changes
            </Button>
            <Button onClick={handleSubmit} disabled={loading} className="bg-green-600 hover:bg-green-700">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save Territory Changes
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

export default PublicTerritoryEditor;