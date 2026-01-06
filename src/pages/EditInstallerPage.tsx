"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save, XCircle, ArrowLeft, MousePointerClick, Eraser, Upload, Download, Home, LogOut, Copy, Star, ChevronsUpDown } from "lucide-react";
import { Installer, InstallerBrand, InstallerSkill, InstallerCertification } from "@/types/installer";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import TerritoryMap from "@/components/TerritoryMap";
import { supabase } from "@/integrations/supabase/client";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import InstallerTerritoryList from "@/components/InstallerTerritoryList";
import { InstallerZipAssignment, TerritoryStatus } from "@/types/territory";
import { run as getCoordinates } from "@/functions/getCoordinates";
import Papa from "papaparse";
import { useSession } from "@/components/SessionContextProvider";
import ImportInstallerTerritoriesModal from "@/components/ImportInstallerTerritoriesModal";
import { cn } from "@/lib/utils";
import usGeoJson from '@/data/us-zip-codes.json' with { type: 'json' };
import canadaGeoJson from '@/data/canada-postal-codes.json' with { type: 'json' };
import * as turf from '@turf/turf';
import proj4 from 'proj4';
import { Switch } from "@/components/ui/switch";
import { calculateDistance } from "@/utils/distance";
import LoadingSayings from "@/components/LoadingSayings";
import DebugPostalCodeChecker from "@/components/DebugPostalCodeChecker";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

proj4.defs("EPSG:3857", "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs");
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");
proj4.defs("EPSG:3347", "+proj=lcc +lat_1=49 +lat_2=77 +lat_0=63.390675 +lon_0=-91.86666666666666 +x_0=6200000 +y_0=3000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");

const toBoolean = (value: any): boolean => {
  if (typeof value === 'string') return value.toLowerCase() === '1' || value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';
  return value === 1 || value === true;
};

const fromBooleanToSupabase = (key: string, value: boolean): number => {
  return value ? 1 : 0;
};

const contactAddressFields = ["name", "email", "primary_phone", "secondary_phone", "address1", "add2", "city", "state", "postalcode", "country"];
const brandCheckboxes = [
  { key: "hunter_douglas", label: "Hunter Douglas" }, { key: "alta", label: "Alta" }, { key: "carole", label: "Carole" },
  { key: "architectural", label: "Architectural" }, { key: "levolor", label: "Levolor" }, { key: "three_day_blinds", label: "Three Day Blinds" },
];
const productSkillCheckboxes = [
  { key: "blinds_and_shades", label: "Blinds & Shades" }, { key: "shutters", label: "Shutters" }, { key: "draperies", label: "Drapery" },
  { key: "power_view", label: "Automation" }, { key: "service_call", label: "Service Call" }, { key: "tall_window", label: "Tall Window" },
  { key: "fixture_displays", label: "Fixture Displays" }, { key: "outdoor", label: "Outdoor" }, { key: "high_voltage_hardwired", label: "High Voltage Hardwired" },
];
const certificationCheckboxes = [
  { label: "Motorization Pro Certified", dbColumn: "powerview_certification", value: "Motorization Pro" },
  { label: "ShutterPro Certified", dbColumn: "shutter_certification_level", value: "ShutterPro Certified" },
  { label: "Master Shutter", dbColumn: "shutter_certification_level", value: "Master Shutter" },
  { label: "Master Installer", dbColumn: "pip_certification_level", value: "Master Installer" },
  { label: "Certified Installer", dbColumn: "pip_certification_level", value: "Certified Installer" },
  { label: "Drapery Certified", dbColumn: "draperies_certification_level", value: "Drapery Certified" },
];
const otherFields = ["installer_vendor_id", "star_rating", "shipment"];
const textAreaFields = ["comments", "specialnote"];

const EditInstallerPage: React.FC = () => {
  const { installerId } = useParams<{ installerId: string }>();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<any>({});
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [initialSelectedMapZipCodes, setInitialSelectedMapZipCodes] = useState<any[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [mapRefreshKey, setMapRefreshKey] = useState<number>(0); 
  const [selectedMapZipCodes, setSelectedMapZipCodes] = useState<Array<{ zipCode: string, assignedStatus: TerritoryStatus, stateProvince: string, centroid_latitude: number | null, centroid_longitude: number | null }>>([]);
  const [territoryStatuses, setTerritoryStatuses] = useState<Map<string, TerritoryStatus>>(new Map());
  const [currentInstaller, setCurrentInstaller] = useState<Installer | null>(null);
  const [bulkActionType, setBulkActionType] = useState<'approve' | 'needs_approval' | 'deselect' | null>(null);
  const [isImportTerritoriesModalOpen, setIsImportTerritoriesModalOpen] = useState(false);
  const [listDisplayRadius, setListDisplayRadius] = useState<string | 'all'>('all');
  const { profile, loading: sessionLoading } = useSession();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const installerCountry = useMemo(() => {
    const country = currentInstaller?.rawSupabaseData?.country?.toUpperCase();
    if (country === 'CANADA' || country === 'CA' || country === 'CAN') return 'Canada';
    return 'USA';
  }, [currentInstaller?.rawSupabaseData?.country]);

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

  const mapDisplayRadius = useMemo(() => (installerCountry === 'Canada' ? 75 : 150), [installerCountry]);

  const columnDisplayNames: { [key: string]: string } = useMemo(() => ({
    name: "Name", email: "Email", primary_phone: "Phone", secondary_phone: "Secondary Phone", address1: "Address Line 1",
    add2: "Address Line 2", city: "City", state: "State", postalcode: installerCountry === 'Canada' ? 'Postal Code' : 'Zip Code',
    country: "Country", hunter_douglas: "Hunter Douglas", alta: "Alta", carole: "Carole", architectural: "Architectural",
    levolor: "Levolor", three_day_blinds: "Three Day Blinds", blinds_and_shades: "Blinds & Shades", power_view: "Automation",
    service_call: "Service Call", shutters: "Shutters", draperies: "Drapery", alta_motorization: "Alta Motorization",
    tall_window: "Tall Window", fixture_displays: "Fixture Displays", outdoor: "Outdoor", high_voltage_hardwired: "High Voltage Hardwired",
    pip_certification_level: "PIP Certification", shutter_certification_level: "Shutter Certification Level",
    powerview_certification: "Motorization Certification", draperies_certification_level: "Drapery Certification",
    installer_vendor_id: "Installer Vendor ID", shipment: "Accepts Shipments", star_rating: "Star Rating",
    specialnote: "Special Note", comments: "Comments", sales_org: "Sales Org",
  }), [installerCountry]);

  const requiredFields = ["name", "email", "primary_phone", "address1", "city", "state", "postalcode"];

  const fetchTerritoryStatuses = useCallback(async () => {
    const { data } = await supabase.from('installer_zip_codes').select('zip_code, status');
    const statusMap = new Map<string, TerritoryStatus>();
    if (data) {
      for (const item of data) {
        if (item.zip_code) {
          const existingStatus = statusMap.get(item.zip_code);
          if (item.status === 'Approved' || !existingStatus) {
            statusMap.set(item.zip_code, item.status as TerritoryStatus);
          }
        }
      }
    }
    setTerritoryStatuses(statusMap);
    return statusMap;
  }, []);

  const loadAllData = useCallback(async (silent = false) => {
    if (!installerId) return;
    if (!silent) setLoading(true);
    
    const { data: installerData } = await supabase.from('installers').select('*').eq('id', installerId).single();
    if (!installerData) {
      navigate("/installers");
      return;
    }

    const currentCountry = (installerData.country?.toUpperCase() === 'CANADA' || installerData.country?.toUpperCase() === 'CA') ? 'Canada' : 'USA';
    
    let allZipData: any[] = [];
    let page = 0;
    let hasMore = true;
    while(hasMore) {
      const { data: zipData } = await supabase.from('installer_zip_codes').select('zip_code, status, state_province').eq('installer_id', installerId).range(page * 1000, (page + 1) * 1000 - 1);
      if (zipData) allZipData = allZipData.concat(zipData);
      if (!zipData || zipData.length < 1000) hasMore = false;
      else page++;
    }

    const enrichedZips = allZipData.map(item => {
      const centroid = zipCodeCentroids.get(item.zip_code);
      return {
        zipCode: item.zip_code, assignedStatus: item.status as TerritoryStatus, stateProvince: item.state_province,
        centroid_latitude: centroid?.lat || null, centroid_longitude: centroid?.lng || null,
      };
    });

    await fetchTerritoryStatuses();
    
    setFormData(installerData);
    setInitialFormData(JSON.parse(JSON.stringify(installerData)));
    setCurrentInstaller({
      ...installerData,
      id: installerData.id,
      name: installerData.name,
      skills: [], brands: [], certifications: [],
      rawSupabaseData: installerData
    });
    setSelectedMapZipCodes(enrichedZips);
    setInitialSelectedMapZipCodes(JSON.parse(JSON.stringify(enrichedZips)));
    setIsDirty(false);
    setMapRefreshKey(p => p + 1);
    if (!silent) setLoading(false);
  }, [installerId, navigate, fetchTerritoryStatuses, zipCodeCentroids]);

  useEffect(() => {
    if (!sessionLoading && installerId) loadAllData();
    else if (!installerId) setLoading(false);
  }, [installerId, sessionLoading, loadAllData]);

  useEffect(() => {
    if (loading || sessionLoading || !initialFormData) return;
    const normalizeZips = (zips: any[]) => zips.map(({ zipCode, assignedStatus }) => ({ zipCode, assignedStatus })).sort((a, b) => a.zipCode.localeCompare(b.zipCode));
    const zipCodesChanged = JSON.stringify(normalizeZips(selectedMapZipCodes)) !== JSON.stringify(normalizeZips(initialSelectedMapZipCodes));
    setIsDirty(JSON.stringify(formData) !== JSON.stringify(initialFormData) || zipCodesChanged);
  }, [formData, selectedMapZipCodes, initialFormData, initialSelectedMapZipCodes, loading, sessionLoading]);

  const handleMapZipCodeClick = useCallback((zipCode: string, stateProvince: string) => {
    setSelectedMapZipCodes(prev => {
      const idx = prev.findIndex(item => item.zipCode === zipCode);
      const centroid = zipCodeCentroids.get(zipCode);
      if (idx !== -1) {
        if (prev[idx].assignedStatus === 'Approved') {
          return [...prev.slice(0, idx), { ...prev[idx], assignedStatus: 'Needs Approval' }, ...prev.slice(idx + 1)];
        }
        return prev.filter(item => item.zipCode !== zipCode);
      }
      return [...prev, { zipCode, assignedStatus: 'Approved', stateProvince, centroid_latitude: centroid?.lat || null, centroid_longitude: centroid?.lng || null }];
    });
    setMapRefreshKey(p => p + 1);
  }, [zipCodeCentroids]);

  const handleSubmit = async (territoriesOverride?: any[]) => {
    if (!validateForm() || !currentInstaller?.id) return;
    setIsSaving(true);
    const loadingToastId = toast.loading("Saving changes...");
  
    try {
      await supabase.auth.refreshSession();

      if (JSON.stringify(formData) !== JSON.stringify(initialFormData)) {
        const formattedData: any = {};
        for (const key in formData) {
          if (Object.prototype.hasOwnProperty.call(formData, key)) {
            const val = formData[key];
            if (typeof val === 'boolean') formattedData[key] = fromBooleanToSupabase(key, val);
            else if (['powerview_certification', 'shutter_certification_level', 'draperies_certification_level', 'pip_certification_level'].includes(key)) formattedData[key] = Array.isArray(val) ? val.join(', ') : val;
            else if (['installer_vendor_id', 'star_rating'].includes(key) && typeof val === 'string' && val !== '') formattedData[key] = parseFloat(val);
            else formattedData[key] = val === "" ? null : val;
          }
        }
        await supabase.from("installers").update(formattedData).eq("id", currentInstaller.id);
      }
  
      const territoriesToProcess = territoriesOverride || selectedMapZipCodes;
      const initialZipMap = new Map(initialSelectedMapZipCodes.map(z => [z.zipCode, z]));
      const currentZipMap = new Map(territoriesToProcess.map(z => [z.zipCode, z]));
  
      const addedZips = territoriesToProcess.filter(z => !initialZipMap.has(z.zipCode)).map(z => ({ zip_code: z.zipCode, state_province: z.stateProvince, assigned_status: z.assignedStatus }));
      const updatedZips = territoriesToProcess.filter(z => initialZipMap.has(z.zipCode) && initialZipMap.get(z.zipCode)!.assignedStatus !== z.assignedStatus).map(z => ({ zip_code: z.zipCode, assigned_status: z.assignedStatus }));
      const removedZips = initialSelectedMapZipCodes.filter(z => !currentZipMap.has(z.zipCode)).map(z => ({ zipCode: z.zipCode }));

      if (addedZips.length || updatedZips.length || removedZips.length) {
        const { data: { session } } = await supabase.auth.getSession();
        const CHUNK = 500;
        const process = async (type: string, items: any[]) => {
          for (let i = 0; i < items.length; i += CHUNK) {
            const chunk = items.slice(i, i + CHUNK);
            const body: any = { installerId: currentInstaller.id };
            if (type === 'added') body.addedZips = chunk;
            if (type === 'updated') body.updatedZips = chunk;
            if (type === 'removed') body.removedZips = chunk;
            await supabase.functions.invoke('save-public-territory-data', { headers: { Authorization: `Bearer ${session?.access_token}` }, body });
          }
        };
        if (removedZips.length) await process('removed', removedZips);
        if (updatedZips.length) await process('updated', updatedZips);
        if (addedZips.length) await process('added', addedZips);
      }
  
      toast.success("Changes saved successfully!", { id: loadingToastId });
      setInitialFormData(JSON.parse(JSON.stringify(formData)));
      setInitialSelectedMapZipCodes(JSON.parse(JSON.stringify(territoriesToProcess)));
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
    const loadingToastId = toast.loading("Finding territories...");
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
      await handleSubmit(final);
    } catch (err: any) {
      toast.error(`Auto-approve failed: ${err.message}`, { id: loadingToastId });
      setIsSaving(false);
    }
  };

  const handleClearAllAssignedZips = () => {
    setSelectedMapZipCodes([]);
    setMapRefreshKey(p => p + 1);
    toast.info("Cleared locally. Click Save to apply.");
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

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-100"><LoadingSayings /></div>;

  return (
    <>
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 pb-24">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-4">
            {profile?.role === 'admin' && <Button variant="outline" size="sm" onClick={() => navigate("/installers")} className="mr-2"><ArrowLeft className="h-4 w-4" /></Button>}
            <div><h1 className="text-2xl font-bold text-gray-700">{currentInstaller?.name}</h1></div>
          </div>
          <Button variant="outline" onClick={handleLogout}><LogOut className="mr-2 h-4 w-4" /> Log Out</Button>
        </div>

        <div className="grid gap-6 py-4">
          <div className="col-span-full mt-6">
            <h3 className="text-lg font-semibold mb-2">Assigned Territories</h3>
            <div className="flex flex-wrap justify-between gap-2 mb-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={handleAutoApprove} disabled={isSaving}><Star className="mr-2 h-4 w-4" /> Auto Approve {installerCountry === 'Canada' ? '35km' : '25 miles'}</Button>
                <Button variant="outline" className={cn(bulkActionType === 'approve' ? "bg-green-600 text-white" : "text-green-600")} onClick={() => setBulkActionType('approve')} disabled={isSaving}>Bulk Free Mileage</Button>
                <Button variant="outline" className={cn(bulkActionType === 'needs_approval' ? "bg-orange-600 text-white" : "text-orange-600")} onClick={() => setBulkActionType('needs_approval')} disabled={isSaving}>Bulk Paid Mileage</Button>
                <Button variant="outline" onClick={handleClearAllAssignedZips} disabled={isSaving}><Eraser className="mr-2 h-4 w-4" /> Clear All</Button>
              </div>
            </div>
            <div className="h-[800px] w-full border rounded-lg overflow-hidden">
              <TerritoryMap country={installerCountry} isOpen={true} centerLocation={memoizedCenterLocation} onZipCodeClick={handleMapZipCodeClick} selectedZipCodes={selectedMapZipCodes} currentDisplayRadius={mapDisplayRadius} showRadiusCircles={true} territoryStatuses={territoryStatuses} highlightedZipCodes={highlightedZipCodes} isBulkSelecting={!!bulkActionType} onBulkSelectionComplete={handleBulkSelectionComplete} refreshKey={mapRefreshKey} />
            </div>
            <InstallerTerritoryList assignedZipCodes={selectedMapZipCodes} onZipCodeClick={handleMapZipCodeClick} mapClickStates={highlightedZipCodes} installerLocation={memoizedCenterLocation} listDisplayRadius={listDisplayRadius} />
          </div>
        </div>
      </div>
      {isDirty && (
        <div className="fixed bottom-0 left-0 w-full z-[1000] bg-white border-t p-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => loadAllData()} disabled={isSaving}>Discard</Button>
          <Button onClick={() => handleSubmit()} disabled={isSaving} className="bg-green-600">
            {isSaving ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />} Save
          </Button>
        </div>
      )}
    </>
  );
};

export default EditInstallerPage;