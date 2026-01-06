import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2, Save, MousePointerClick, Eraser, Star } from "lucide-react";
import { Installer } from "@/types/installer";
import { toast } from "sonner";
import TerritoryMap from "@/components/TerritoryMap";
import { supabase } from "@/integrations/supabase/client";
import InstallerTerritoryList from "@/components/InstallerTerritoryList";
import { TerritoryStatus } from "@/types/territory";
import { cn } from "@/lib/utils";
import usGeoJson from '@/data/us-zip-codes.json' with { type: 'json' };
import canadaGeoJson from '@/data/canada-postal-codes.json' with { type: 'json' };
import * as turf from '@turf/turf';
import proj4 from 'proj4';
import { calculateDistance } from "@/utils/distance";
import LoadingSayings from "@/components/LoadingSayings";

proj4.defs("EPSG:3857", "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs");
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");
proj4.defs("EPSG:3347", "+proj=lcc +lat_1=49 +lat_2=77 +lat_0=63.390675 +lon_0=-91.86666666666666 +x_0=6200000 +y_0=3000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");

const PublicTerritoryEditor: React.FC = () => {
  const { installerId, token } = useParams<{ installerId: string; token: string }>();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<any>({});
  const [initialSelectedMapZipCodes, setInitialSelectedMapZipCodes] = useState<any[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [mapRefreshKey, setMapRefreshKey] = useState<number>(0); 
  const [selectedMapZipCodes, setSelectedMapZipCodes] = useState<Array<{ zipCode: string, assignedStatus: TerritoryStatus, stateProvince: string, centroid_latitude: number | null, centroid_longitude: number | null }>>([]);
  const [territoryStatuses, setTerritoryStatuses] = useState<Map<string, TerritoryStatus>>(new Map());
  const [currentInstaller, setCurrentInstaller] = useState<Installer | null>(null);
  const [bulkActionType, setBulkActionType] = useState<'approve' | 'needs_approval' | 'deselect' | null>('approve');

  const installerCountry = useMemo(() => {
    const c = formData?.country?.toUpperCase();
    return (c === 'CANADA' || c === 'CA') ? 'Canada' : 'USA';
  }, [formData?.country]);

  const mapDisplayRadius = useMemo(() => (installerCountry === 'Canada' ? 75 : 150), [installerCountry]);

  const memoizedCenterLocation = useMemo(() => {
    if (currentInstaller?.latitude != null && currentInstaller?.longitude != null) {
      return { lat: currentInstaller.latitude, lng: currentInstaller.longitude };
    }
    return null;
  }, [currentInstaller?.latitude, currentInstaller?.longitude]);

  const highlightedZipCodes = useMemo(() => {
    const highlights = new Map<string, 'green' | 'orange'>();
    selectedMapZipCodes.forEach(item => {
      highlights.set(item.zipCode, item.assignedStatus === 'Approved' ? 'green' : 'orange');
    });
    return highlights;
  }, [selectedMapZipCodes]);

  const zipCodeCentroids = useMemo(() => {
    const map = new Map<string, { lat: number, lng: number, state: string }>();
    const geoJsonToProcess = installerCountry === 'Canada' ? canadaGeoJson : usGeoJson;
    if (geoJsonToProcess && geoJsonToProcess.features) {
      geoJsonToProcess.features.forEach(feature => {
        let zipCode: string | null = null, state: string | null = null, lat: number | null = null, lng: number | null = null;
        if (installerCountry === 'Canada') {
          zipCode = feature.properties.CFSAUID; state = feature.properties.PRNAME;
          try {
            const transformedGeometry = turf.clone(feature.geometry);
            turf.coordEach(transformedGeometry, (currentCoord) => {
              const [lon, lat] = proj4('EPSG:3347', 'EPSG:4326').forward(currentCoord);
              currentCoord[0] = lon; currentCoord[1] = lat;
            });
            const centroid = turf.centroid(transformedGeometry);
            if (centroid?.geometry?.coordinates) {
              lng = centroid.geometry.coordinates[0]; lat = centroid.geometry.coordinates[1];
            }
          } catch (e) {}
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

  const loadAllData = useCallback(async (silent = false) => {
    if (!installerId || !token) return;
    if (!silent) setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('get-public-territory-data', { body: { installerId, token } });
      if (!data || data.error) throw new Error(data?.error || "Load failed");
      const { installer: inst, zipCodes: zips } = data;
      setFormData(inst);
      setCurrentInstaller({ ...inst, id: inst.id, name: inst.name, skills: [], brands: [], certifications: [], rawSupabaseData: inst });
      const enriched = (zips || []).map((item: any) => {
        const c = zipCodeCentroids.get(item.zip_code);
        return { zipCode: item.zip_code, assignedStatus: item.status as TerritoryStatus, stateProvince: item.state_province, centroid_latitude: c?.lat || null, centroid_longitude: c?.lng || null };
      });
      setSelectedMapZipCodes(enriched);
      setInitialSelectedMapZipCodes(JSON.parse(JSON.stringify(enriched)));
      setIsDirty(false);
      setMapRefreshKey(p => p + 1);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [installerId, token, zipCodeCentroids]);

  useEffect(() => { loadAllData(); }, [loadAllData]);

  useEffect(() => {
    if (loading || !currentInstaller) return;
    const normalize = (z: any[]) => z.map(({ zipCode, assignedStatus }) => ({ zipCode, assignedStatus })).sort((a, b) => a.zipCode.localeCompare(b.zipCode));
    setIsDirty(JSON.stringify(normalize(selectedMapZipCodes)) !== JSON.stringify(normalize(initialSelectedMapZipCodes)));
  }, [selectedMapZipCodes, initialSelectedMapZipCodes, loading]);

  const handleMapZipCodeClick = useCallback((zipCode: string, stateProvince: string) => {
    setSelectedMapZipCodes(prev => {
      const idx = prev.findIndex(item => item.zipCode === zipCode);
      const c = zipCodeCentroids.get(zipCode);
      if (idx !== -1) {
        if (prev[idx].assignedStatus === 'Approved') return [...prev.slice(0, idx), { ...prev[idx], assignedStatus: 'Needs Approval' }, ...prev.slice(idx + 1)];
        return prev.filter(item => item.zipCode !== zipCode);
      }
      return [...prev, { zipCode, assignedStatus: 'Approved', stateProvince, centroid_latitude: c?.lat || null, centroid_longitude: c?.lng || null }];
    });
    setMapRefreshKey(p => p + 1);
  }, [zipCodeCentroids]);

  const handleSubmit = async (territoriesOverride?: any[]) => {
    if (!installerId || !token) return;
    setIsSaving(true);
    const loadingToastId = toast.loading("Saving changes...");
    try {
      const finalZips = territoriesOverride || selectedMapZipCodes;
      const initialMap = new Map(initialSelectedMapZipCodes.map(z => [z.zipCode, z]));
      const currentMap = new Map(finalZips.map(z => [z.zipCode, z]));

      const added = finalZips.filter(z => !initialMap.has(z.zipCode)).map(z => ({ zip_code: z.zipCode, state_province: z.stateProvince, assigned_status: z.assignedStatus }));
      const updated = finalZips.filter(z => initialMap.has(z.zipCode) && initialMap.get(z.zipCode)!.assignedStatus !== z.assignedStatus).map(z => ({ zip_code: z.zipCode, assigned_status: z.assignedStatus }));
      const removed = initialSelectedMapZipCodes.filter(z => !currentMap.has(z.zipCode)).map(z => ({ zipCode: z.zipCode }));

      if (added.length || updated.length || removed.length) {
        const process = async (type: string, items: any[]) => {
          for (let i = 0; i < items.length; i += 500) {
            const body: any = { installerId, token };
            if (type === 'added') body.addedZips = items.slice(i, i + 500);
            if (type === 'updated') body.updatedZips = items.slice(i, i + 500);
            if (type === 'removed') body.removedZips = items.slice(i, i + 500);
            await supabase.functions.invoke('save-public-territory-data', { body });
          }
        };
        if (removed.length) await process('removed', removed);
        if (updated.length) await process('updated', updated);
        if (added.length) await process('added', added);
      }

      toast.success("Changes saved successfully!", { id: loadingToastId });
      const savedTerritories = JSON.parse(JSON.stringify(finalZips));
      setInitialSelectedMapZipCodes(savedTerritories);
      setSelectedMapZipCodes(savedTerritories);
      setIsDirty(false);
      setMapRefreshKey(p => p + 1);
    } catch (err: any) {
      toast.error(`Save failed: ${err.message}`, { id: loadingToastId });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAutoApprove = async () => {
    if (!currentInstaller?.latitude || !currentInstaller?.longitude) return;
    setIsSaving(true);
    let loadingToastId: string | number | undefined;
    if (installerCountry === 'Canada') {
      loadingToastId = toast.loading("Finding territories...");
    }
    try {
      let zips: any[] = [];
      if (installerCountry === 'Canada') {
        const { data } = await supabase.functions.invoke('get-territories-in-radius', { body: { country: 'Canada', center: { lat: currentInstaller.latitude, lng: currentInstaller.longitude }, radius: 35000 } });
        zips = (data.data || []).map((p: any) => ({ zipCode: p.POSTAL_CODE, stateProvince: p.PROVINCE_ABBR, centroid_latitude: p.LATITUDE, centroid_longitude: p.LONGITUDE }));
      } else {
        const center = turf.point([currentInstaller.longitude, currentInstaller.latitude]);
        const radiusCircle = turf.circle(center, 25 * 1.60934, { steps: 64, units: 'kilometers' });
        usGeoJson.features.forEach(f => {
          if (f.geometry && turf.booleanIntersects(radiusCircle, f as any)) {
            const code = f.properties.ZCTA5CE20;
            const c = zipCodeCentroids.get(code);
            zips.push({ zipCode: code, stateProvince: f.properties.STUSPS, centroid_latitude: c?.lat || null, centroid_longitude: c?.lng || null });
          }
        });
      }
      const newMap = new Map(selectedMapZipCodes.map(item => [item.zipCode, item]));
      zips.forEach(z => newMap.set(z.zipCode, { ...z, assignedStatus: 'Approved' }));
      const final = Array.from(newMap.values());
      setSelectedMapZipCodes(final);
      setMapRefreshKey(p => p + 1);
      if (loadingToastId) {
        toast.dismiss(loadingToastId);
      }
      await handleSubmit(final);
    } catch (err: any) {
      toast.error(`Auto-approve failed: ${err.message}`, { id: loadingToastId });
      setIsSaving(false);
    }
  };

  const handleBulkSelectionComplete = useCallback((selectedZips: any[]) => {
    setSelectedMapZipCodes(prev => {
      const map = new Map(prev.map(item => [item.zipCode, item]));
      selectedZips.forEach(z => {
        const c = zipCodeCentroids.get(z.zipCode);
        if (bulkActionType === 'deselect') map.delete(z.zipCode);
        else if (bulkActionType === 'approve') map.set(z.zipCode, { ...z, assignedStatus: 'Approved', centroid_latitude: c?.lat || null, centroid_longitude: c?.lng || null });
        else if (bulkActionType === 'needs_approval' && (!map.has(z.zipCode) || map.get(z.zipCode)!.assignedStatus === 'Needs Approval')) map.set(z.zipCode, { ...z, assignedStatus: 'Needs Approval', centroid_latitude: c?.lat || null, centroid_longitude: c?.lng || null });
      });
      return Array.from(map.values());
    });
    setMapRefreshKey(p => p + 1);
    setBulkActionType(null);
  }, [bulkActionType, zipCodeCentroids]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingSayings /></div>;

  return (
    <>
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 pb-24">
        <h1 className="text-2xl font-bold mb-8">Territory Editor: {currentInstaller?.name}</h1>
        <div className="grid gap-6 py-4">
          <div className="col-span-full">
            <div className="flex flex-wrap gap-2 mb-4">
              <Button variant="outline" onClick={handleAutoApprove} disabled={isSaving}><Star className="mr-2 h-4 w-4" /> Auto Approve {installerCountry === 'Canada' ? '35km' : '25 miles'}</Button>
              <Button variant="outline" className={cn(bulkActionType === 'approve' ? "bg-green-600 text-white" : "text-green-600")} onClick={() => setBulkActionType('approve')} disabled={isSaving}>Bulk Free Mileage</Button>
              <Button variant="outline" className={cn(bulkActionType === 'needs_approval' ? "bg-orange-600 text-white" : "text-orange-600")} onClick={() => setBulkActionType('needs_approval')} disabled={isSaving}>Bulk Paid Mileage</Button>
              {installerCountry === 'Canada' ? (
                <Button variant="outline" className={cn(bulkActionType === 'deselect' ? "bg-red-600 text-white" : "text-red-600")} onClick={() => setBulkActionType('deselect')} disabled={isSaving}>
                  <Eraser className="mr-2 h-4 w-4" /> Bulk Deselect
                </Button>
              ) : (
                <Button variant="outline" onClick={() => { setSelectedMapZipCodes([]); setMapRefreshKey(p => p + 1); }} disabled={isSaving}>
                  <Eraser className="mr-2 h-4 w-4" /> Clear All
                </Button>
              )}
            </div>
            <div className="h-[800px] w-full border rounded-lg overflow-hidden">
              <TerritoryMap country={installerCountry} isOpen={true} centerLocation={memoizedCenterLocation} onZipCodeClick={handleMapZipCodeClick} selectedZipCodes={selectedMapZipCodes} currentDisplayRadius={mapDisplayRadius} showRadiusCircles={true} territoryStatuses={territoryStatuses} highlightedZipCodes={highlightedZipCodes} isBulkSelecting={!!bulkActionType} onBulkSelectionComplete={handleBulkSelectionComplete} refreshKey={mapRefreshKey} />
            </div>
            <InstallerTerritoryList assignedZipCodes={selectedMapZipCodes} onZipCodeClick={handleMapZipCodeClick} mapClickStates={highlightedZipCodes} installerLocation={memoizedCenterLocation} listDisplayRadius="all" />
          </div>
        </div>
      </div>
      {isDirty && (
        <div className="fixed bottom-0 left-0 w-full z-[1000] bg-white border-t p-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => loadAllData()} disabled={isSaving}>Discard</Button>
          <Button onClick={() => handleSubmit()} disabled={isSaving} className="bg-green-600 text-white">
            {isSaving ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />} Save Changes
          </Button>
        </div>
      )}
    </>
  );
};

export default PublicTerritoryEditor;