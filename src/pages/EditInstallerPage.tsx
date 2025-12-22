import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save, XCircle, ArrowLeft, MousePointerClick, Eraser, Upload, Download, Home, LogOut, Copy, Star, ChevronsUpDown } from "lucide-react";
import { Installer, InstallerBrand, InstallerSkill } from "@/types/installer";
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

const defaultFormState = {
  name: "", email: "", primary_phone: "", secondary_phone: "", address1: "", add2: "", city: "", state: "", postalcode: "", country: "USA",
  hunter_douglas: false, alta: false, carole: false, architectural: false, levolor: false, three_day_blinds: false,
  blinds_and_shades: false, power_view: false, service_call: false, shutters: false, draperies: false,
  tall_window: false, fixture_displays: false, outdoor: false, high_voltage_hardwired: false,
  pip_certification_level: "", shutter_certification_level: "", powerview_certification: "", draperies_certification_level: "",
  installer_vendor_id: "", shipment: false, star_rating: "", specialnote: "", comments: "",
  is_active: true,
};

const EditInstallerPage: React.FC = () => {
  const { installerId } = useParams<{ installerId: string }>();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<any>({});
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [initialSelectedMapZipCodes, setInitialSelectedMapZipCodes] = useState<any[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedMapZipCodes, setSelectedMapZipCodes] = useState<Array<{ zipCode: string, assignedStatus: TerritoryStatus, stateProvince: string, centroid_latitude: number | null, centroid_longitude: number | null }>>([]);
  const [territoryStatuses, setTerritoryStatuses] = useState<Map<string, TerritoryStatus>>(new Map());
  const [currentInstaller, setCurrentInstaller] = useState<Installer | null>(null);
  const [bulkActionType, setBulkActionType] = useState<'approve' | 'needs_approval' | null>(null);
  const [isImportTerritoriesModalOpen, setIsImportTerritoriesModalOpen] = useState(false);
  const [listDisplayRadius, setListDisplayRadius] = useState<string | 'all'>('all');
  const { profile, user, loading: sessionLoading } = useSession();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Logout failed: " + error.message);
    } else {
      toast.success("You have been logged out.");
      navigate('/login');
    }
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
              currentCoord[0] = lon;
              currentCoord[1] = lat;
            });
            const centroid = turf.centroid(transformedGeometry);
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
    const { data, error } = await supabase.from('installer_zip_codes').select('zip_code, status');
    if (error) {
      console.error("Error fetching all territory statuses:", error);
      toast.error("Failed to load map territory statuses.");
      return new Map();
    } else {
      const statusMap = new Map<string, TerritoryStatus>();
      for (const item of data) {
        if (item.zip_code) {
          const existingStatus = statusMap.get(item.zip_code);
          if (item.status === 'Approved' || !existingStatus) {
            statusMap.set(item.zip_code, item.status as TerritoryStatus);
          }
        }
      }
      setTerritoryStatuses(statusMap);
      return statusMap;
    }
  }, []);

  const loadAllData = useCallback(async () => {
    if (!installerId) {
      toast.error("No installer ID provided.");
      navigate("/installers");
      return;
    }
    setLoading(true);
    
    const { data: installerData, error: fetchError } = await supabase.from('installers').select('*').eq('id', installerId).single();
    if (fetchError || !installerData) {
      console.error("Error fetching installer:", fetchError);
      toast.error("Failed to load installer data.");
      navigate("/installers");
      setLoading(false);
      return;
    }

    const country = installerData.country?.toUpperCase();
    const isCanada = country === 'CANADA' || country === 'CA' || country === 'CAN';
    const currentInstallerCountry = isCanada ? 'Canada' : 'USA';

    const centroids = new Map<string, { lat: number, lng: number, state: string }>();
    const geoJsonToProcess = currentInstallerCountry === 'Canada' ? canadaGeoJson : usGeoJson;
    if (geoJsonToProcess && geoJsonToProcess.features) {
      geoJsonToProcess.features.forEach(feature => {
        let zipCode: string | null = null, state: string | null = null, lat: number | null = null, lng: number | null = null;
        if (currentInstallerCountry === 'Canada') {
          zipCode = feature.properties.CFSAUID; state = feature.properties.PRNAME;
          try {
            const transformedGeometry = turf.clone(feature.geometry);
            turf.coordEach(transformedGeometry, (currentCoord) => {
              const [lon, lat] = proj4('EPSG:3347', 'EPSG:4326').forward(currentCoord);
              currentCoord[0] = lon;
              currentCoord[1] = lat;
            });
            const centroid = turf.centroid(transformedGeometry);
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
          centroids.set(zipCode, { lat, lng, state: state || 'Unknown' });
        }
      });
    }

    let allZipData: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;
    while(hasMore) {
      const { data: zipData, error: zipError } = await supabase
        .from('installer_zip_codes')
        .select('zip_code, status, state_province')
        .eq('installer_id', installerId)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (zipError) {
        console.error("Error fetching installer zip codes:", zipError);
        toast.error("Failed to load installer's assigned ZIP codes.");
        hasMore = false;
      } else {
        if (zipData) {
          allZipData = allZipData.concat(zipData);
        }
        if (!zipData || zipData.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      }
    }

    const enrichedZips = (allZipData || []).map(item => {
      const centroid = centroids.get(item.zip_code);
      return {
        zipCode: item.zip_code, assignedStatus: item.status as TerritoryStatus, stateProvince: item.state_province,
        centroid_latitude: centroid?.lat || null, centroid_longitude: centroid?.lng || null,
      };
    });

    await fetchTerritoryStatuses();

    const mappedInstaller: Installer = {
      id: installerData.id, name: installerData.name,
      address: `${installerData.address1 || ''} ${installerData.add2 || ''}, ${installerData.city || ''}, ${installerData.state || ''} ${installerData.postalcode || ''}`.trim(),
      zipCode: installerData.postalcode, phone: installerData.primary_phone, email: installerData.email,
      skills: [], brands: [], certifications: [],
      latitude: installerData.latitude, longitude: installerData.longitude,
      installerVendorId: installerData.installer_vendor_id?.toString(),
      acceptsShipments: toBoolean(installerData.shipment),
      is_active: toBoolean(installerData.is_active),
      rawSupabaseData: installerData,
    };
    setFormData(installerData);
    setInitialFormData(JSON.parse(JSON.stringify(installerData)));
    setCurrentInstaller(mappedInstaller);
    setErrors({});
    setSelectedMapZipCodes(enrichedZips);
    setInitialSelectedMapZipCodes(JSON.parse(JSON.stringify(enrichedZips)));
    setIsDirty(false);

    setLoading(false);
  }, [installerId, navigate, fetchTerritoryStatuses]);

  useEffect(() => {
    if (!sessionLoading && installerId) {
      loadAllData();
    } else if (!installerId) {
      setLoading(false);
    }
  }, [installerId, sessionLoading, loadAllData]);

  useEffect(() => {
    if (loading || sessionLoading || !initialFormData) return;

    const formDataChanged = JSON.stringify(formData) !== JSON.stringify(initialFormData);

    const normalizeZips = (zips: any[]) => zips.map(({ zipCode, assignedStatus }) => ({ zipCode, assignedStatus })).sort((a, b) => a.zipCode.localeCompare(b.zipCode));
    const zipCodesChanged = JSON.stringify(normalizeZips(selectedMapZipCodes)) !== JSON.stringify(normalizeZips(initialSelectedMapZipCodes));

    setIsDirty(formDataChanged || zipCodesChanged);
  }, [formData, selectedMapZipCodes, initialFormData, initialSelectedMapZipCodes, loading, sessionLoading]);

  const memoizedCenterLocation = useMemo(() => {
    if (currentInstaller?.latitude != null && currentInstaller?.longitude != null) {
      return { lat: currentInstaller.latitude, lng: currentInstaller.longitude };
    }
    return null;
  }, [currentInstaller?.latitude, currentInstaller?.longitude]);

  const handleMapZipCodeClick = useCallback((zipCode: string, stateProvince: string) => {
    setSelectedMapZipCodes(prevSelected => {
      const existingEntryIndex = prevSelected.findIndex(item => item.zipCode === zipCode);
      const centroid = new Map<string, { lat: number, lng: number, state: string }>().get(zipCode); // This is a placeholder, as we don't have access to the full map here.
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
  }, []);

  const handleBulkZipCodeUpdate = useCallback((updates: Array<{ zipCode: string, stateProvince: string, newStatus: TerritoryStatus | null }>) => {
    setSelectedMapZipCodes(prevSelected => {
      const newSelectedMap = new Map(prevSelected.map(item => [item.zipCode, item]));
      updates.forEach(update => {
        if (update.newStatus === null) {
          newSelectedMap.delete(update.zipCode);
        } else {
          const centroid = zipCodeCentroids.get(update.zipCode);
          newSelectedMap.set(update.zipCode, {
            zipCode: update.zipCode,
            assignedStatus: update.newStatus,
            stateProvince: update.stateProvince,
            centroid_latitude: centroid?.lat || null,
            centroid_longitude: centroid?.lng || null,
          });
        }
      });
      return Array.from(newSelectedMap.values());
    });
  }, [zipCodeCentroids]);

  const handleBulkSelectionComplete = useCallback((selectedZips: Array<{ zipCode: string, stateProvince: string }>) => {
    setSelectedMapZipCodes(prevSelected => {
      const prevSelectedMap = new Map(prevSelected.map(item => [item.zipCode, item]));
      const newSelectedMap = new Map(prevSelectedMap);
      selectedZips.forEach(zipInfo => {
        const existing = prevSelectedMap.get(zipInfo.zipCode);
        const centroid = new Map<string, { lat: number, lng: number, state: string }>().get(zipInfo.zipCode); // Placeholder
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
  }, [bulkActionType]);

  const highlightedZipCodes = useMemo(() => {
    const highlights = new Map<string, 'green' | 'orange'>();
    selectedMapZipCodes.forEach(item => {
      highlights.set(item.zipCode, item.assignedStatus === 'Approved' ? 'green' : 'orange');
    });
    return highlights;
  }, [selectedMapZipCodes]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => { const newErrors = { ...prev }; delete newErrors[name]; return newErrors; });
  };

  const handleCheckboxChange = (name: string, checked: boolean) => setFormData((prev: any) => ({ ...prev, [name]: checked }));

  const handleCertificationCheckboxChange = (dbColumn: string, value: string, checked: boolean) => {
    setFormData((prev: any) => {
      const currentCerts = Array.isArray(prev[dbColumn]) ? prev[dbColumn] : (prev[dbColumn] ? String(prev[dbColumn]).split(', ').filter(Boolean) : []);
      const newCerts = checked ? [...new Set([...currentCerts, value])] : currentCerts.filter((cert: string) => cert !== value);
      return { ...prev, [dbColumn]: newCerts };
    });
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    requiredFields.forEach(field => {
      if (!formData[field] || String(formData[field]).trim() === "") {
        newErrors[field] = `${columnDisplayNames[field] || field.replace(/_/g, ' ')} is required.`;
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isAdmin = profile?.role === 'admin';
  const canEdit = isAdmin || (profile?.role === 'installer' && currentInstaller?.rawSupabaseData.account_id === profile.id);

  const handleSubmit = async (territoriesOverride?: any[]) => {
    if (!validateForm()) { toast.error("Please fill in all required fields."); return; }
    if (!currentInstaller?.id) { toast.error("Installer ID is missing. Cannot save changes."); return; }
    setLoading(true);
    const loadingToastId = toast.loading("Saving installer changes...");
    try {
      const formattedData: any = {};
      for (const key in formData) {
        if (Object.prototype.hasOwnProperty.call(formData, key)) {
          const value = formData[key];
          if (typeof value === 'boolean') {
            formattedData[key] = fromBooleanToSupabase(key, value);
          } else if (['powerview_certification', 'shutter_certification_level', 'draperies_certification_level', 'pip_certification_level'].includes(key)) {
            formattedData[key] = Array.isArray(value) ? value.join(', ') : value;
          } else if (['installer_vendor_id', 'star_rating'].includes(key) && typeof value === 'string' && value !== '') {
            formattedData[key] = parseFloat(value);
          } else if (value === "") {
            formattedData[key] = null;
          } else {
            formattedData[key] = value;
          }
        }
      }
      const addressFields = ["address1", "add2", "city", "state", "postalcode", "country"];
      let addressChanged = false;
      const originalRawData = currentInstaller.rawSupabaseData || {};
      for (const field of addressFields) {
        if (String(originalRawData[field] || '') !== String(formattedData[field] || '')) {
          addressChanged = true; break;
        }
      }
      if (addressChanged) {
        toast.info("Address changed, updating coordinates...", { id: loadingToastId });
        const fullAddress = `${formattedData.address1 || ''}, ${formattedData.city || ''}, ${formattedData.state || ''} ${formattedData.postalcode || ''}, ${formattedData.country || ''}`.trim();
        const coords = await getCoordinates({ searchText: fullAddress });
        if (coords.lat != null && coords.lng != null) {
          formattedData.latitude = coords.lat; formattedData.longitude = coords.lng;
          toast.success("Coordinates updated successfully!", { id: loadingToastId });
        } else {
          formattedData.latitude = null; formattedData.longitude = null;
          toast.warning("Could not find coordinates for the new address. Latitude and longitude cleared.", { id: loadingToastId });
        }
      }
      const { error: updateInstallerError } = await supabase.from("installers").update(formattedData).eq("id", currentInstaller.id);
      if (updateInstallerError) throw new Error(`Supabase Update Error: ${updateInstallerError.message}`);
      
      if (canEdit) {
        const { data: idsToDelete, error: countError } = await supabase
          .from('installer_zip_codes')
          .select('id')
          .eq('installer_id', currentInstaller.id);

        if (countError) throw new Error(`Failed to fetch territory IDs for deletion: ${countError.message}`);

        if (idsToDelete && idsToDelete.length > 0) {
          const totalCount = idsToDelete.length;
          let deletedCount = 0;
          const batchSize = 500;
          
          toast.info(`Clearing ${totalCount.toLocaleString()} existing territories...`, { id: loadingToastId });

          for (let i = 0; i < totalCount; i += batchSize) {
            const batch = idsToDelete.slice(i, i + batchSize).map(r => r.id);
            
            const { error: deleteError } = await supabase
              .from('installer_zip_codes')
              .delete()
              .in('id', batch);

            if (deleteError) throw new Error(`Failed to delete batch: ${deleteError.message}`);

            deletedCount += batch.length;
            toast.info(`Clearing territories...`, { id: loadingToastId });
          }
        }

        const territoriesToProcess = territoriesOverride || selectedMapZipCodes;
        toast.info(`Saving ${territoriesToProcess.length} new territory assignments...`, { id: loadingToastId });

        const { data: functionData, error: territoryError } = await supabase.functions.invoke('save-public-territory-data', {
          body: { installerId: currentInstaller.id, zipCodes: territoriesToProcess },
        });

        if (territoryError) {
          console.error("Detailed error from save-public-territory-data function:", territoryError);
          console.error("Function response data (if any):", functionData);
          let errorMessage = territoryError.message;
          if (functionData?.error) {
            errorMessage = functionData.error.message || errorMessage;
            console.error("Edge function error details:", functionData.error.details);
          }
          throw new Error(`Territory Save Error: ${errorMessage}`);
        }
      }
      
      toast.success("Changes saved successfully! Refreshing data...", { id: loadingToastId });
      await loadAllData();
      toast.success("Save complete. Data is up to date.", { id: loadingToastId, duration: 4000 });
    } catch (err: any) {
      console.error("Error saving installer and/or ZIP associations:", err);
      toast.error(`Failed to save changes: ${err.message || err.toString()}`, { id: loadingToastId });
    } finally {
      setLoading(false);
    }
  };

  const handleClone = async () => {
    if (!currentInstaller?.id) {
      toast.error("Cannot clone. Original installer data is not available.");
      return;
    }

    setLoading(true);
    const loadingToastId = toast.loading("Cloning installer...");

    try {
      const clonedData: any = {};
      for (const key in formData) {
        if (Object.prototype.hasOwnProperty.call(formData, key)) {
          const value = formData[key];
          if (typeof value === 'boolean') {
            clonedData[key] = fromBooleanToSupabase(key, value);
          } else if (['powerview_certification', 'shutter_certification_level', 'draperies_certification_level', 'pip_certification_level'].includes(key)) {
            clonedData[key] = Array.isArray(value) ? value.join(', ') : value;
          } else if (['installer_vendor_id', 'star_rating'].includes(key) && typeof value === 'string' && value !== '') {
            clonedData[key] = parseFloat(value);
          } else if (value === "") {
            clonedData[key] = null;
          } else {
            clonedData[key] = value;
          }
        }
      }

      clonedData.name = `${formData.name || 'Installer'} - Copy`;
      clonedData.address1 = "";
      clonedData.add2 = null;
      clonedData.city = "";
      clonedData.state = "";
      clonedData.postalcode = "";
      clonedData.latitude = null;
      clonedData.longitude = null;
      delete clonedData.id;
      delete clonedData.created_at;
      delete clonedData.updated_at;
      clonedData.account_id = null;

      const { data: newInstaller, error: insertError } = await supabase
        .from('installers')
        .insert([clonedData])
        .select('id')
        .single();

      if (insertError) {
        throw new Error(`Failed to create clone: ${insertError.message}`);
      }

      if (!newInstaller) {
        throw new Error("Failed to retrieve the new installer record after creation.");
      }

      toast.success(`Installer cloned successfully. You are now editing the copy. Please fill in the required address details.`, { id: loadingToastId });
      navigate(`/installers/edit/${newInstaller.id}`);

    } catch (err: any) {
      console.error("Error cloning installer:", err);
      toast.error(`Failed to clone installer: ${err.message}`, { id: loadingToastId });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleBulkSelect = (action: 'approve' | 'needs_approval') => {
    setBulkActionType(prev => {
      if (prev === action) {
        toast.info("Bulk selection mode deactivated.");
        return null;
      } else {
        toast.info(`Bulk ${action === 'approve' ? 'Free Mileage' : 'Paid Mileage'} mode activated. Click and drag on the map.`);
        return action;
      }
    });
  };

  const handleClearAllAssignedZips = () => {
    setSelectedMapZipCodes([]);
    toast.info("All assigned ZIP codes cleared from selection.");
  };

  const handleImportInstallerTerritories = async (file: File, mode: "overwrite" | "append") => {
    if (!installerId) { toast.error("Installer ID is missing. Cannot import territories."); return; }
    setLoading(true);
    const loadingToastId = toast.loading(`Importing territories from ${file.name} in ${mode} mode...`);
    let importedCount = 0, skippedCount = 0;
    try {
      if (!canEdit) {
        toast.error("You do not have permission to import territories.", { id: loadingToastId });
        setLoading(false); return;
      }
      const text = await file.text();
      const cleanedText = text.startsWith('\ufeff') ? text.substring(1) : text;
      const { data, errors: parseErrors, meta } = Papa.parse(cleanedText, { header: true, skipEmptyLines: true, dynamicTyping: false });
      if (parseErrors.length > 0) {
        toast.error(`CSV parsing errors found: ${parseErrors[0].message}`, { id: loadingToastId });
        setLoading(false); return;
      }
      const expectedHeaders = ["ZipCode", "Status", "StateProvince"];
      const csvHeaders = meta.fields || [];
      const missingHeaders = expectedHeaders.filter(header => !csvHeaders.includes(header));
      if (missingHeaders.length > 0) {
        toast.error(`Missing required CSV headers: ${missingHeaders.join(', ')}.`, { id: loadingToastId, duration: 8000 });
        setLoading(false); return;
      }
      if (mode === "overwrite") {
        toast.info("Overwriting existing territories for this installer...", { id: loadingToastId });
        const { error: deleteError } = await supabase.from('installer_zip_codes').delete().eq('installer_id', installerId);
        if (deleteError) throw new Error(`Failed to clear existing territories: ${deleteError.message}`);
        toast.success("Existing territories cleared.", { id: loadingToastId });
      }
      const territoriesToUpsert: any[] = [];
      const statusMap: { [key: string]: TerritoryStatus } = {
        'Free_Mileage': 'Approved',
        'Paid_Mileage': 'Needs Approval',
        'Approved': 'Approved',
        'Needs Approval': 'Needs Approval'
      };
      for (const row of data) {
        const zipCode = row.ZipCode?.trim(), statusRaw = row.Status?.trim(), stateProvince = row.StateProvince?.trim();
        if (!zipCode || !statusRaw || !stateProvince) { skippedCount++; continue; }
        const status = statusMap[statusRaw];
        if (!status) { skippedCount++; continue; }
        territoriesToUpsert.push({ installer_id: installerId, zip_code: zipCode, status: status, state_province: stateProvince });
      }
      if (territoriesToUpsert.length === 0) {
        toast.info("No valid territories found in the CSV to import.", { id: loadingToastId });
        setLoading(false); setIsImportTerritoriesModalOpen(false); return;
      }
      const { error: upsertError } = await supabase.from('installer_zip_codes').upsert(territoriesToUpsert, { onConflict: 'installer_id,zip_code' });
      if (upsertError) throw new Error(`Failed to upsert territories: ${upsertError.message}`);
      importedCount = territoriesToUpsert.length;
      toast.success(`Successfully imported ${importedCount} territories. ${skippedCount > 0 ? `${skippedCount} rows skipped.` : ''}`, { id: loadingToastId, duration: 5000 });
      await fetchTerritoryStatuses();
      await loadAllData(); // Reload all data to get enriched zips
    } catch (err: any) {
      console.error("Error during territory import:", err);
      toast.error(`Territory import failed: ${err.message || err.toString()}`, { id: loadingToastId, duration: 8000 });
    } finally {
      setLoading(false);
      setIsImportTerritoriesModalOpen(false);
    }
  };

  const handleExportInstallerTerritories = async () => {
    if (!installerId) { toast.error("Installer ID is missing."); return; }
    setLoading(true);
    const loadingToastId = toast.loading("Preparing territories for export...");
    try {
      const { data, error } = await supabase.from('installer_zip_codes').select('zip_code, status, state_province').eq('installer_id', installerId);
      if (error) throw new Error(`Supabase Fetch Error: ${error.message}`);
      if (!data || data.length === 0) { toast.info("No territories found for this installer to export.", { id: loadingToastId }); return; }
      const dataToExport = data.map(item => {
        const statusMap: { [key in TerritoryStatus]: string } = {
          'Approved': 'Free_Mileage',
          'Needs Approval': 'Paid_Mileage'
        };
        return {
          'State/Province': item.state_province,
          'ZIP Code': item.zip_code,
          'Status': statusMap[item.status as TerritoryStatus] || item.status
        };
      });
      const csv = Papa.unparse(dataToExport);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      
      const sanitize = (str: string | number | null | undefined) => String(str || '').replace(/[^a-zA-Z0-9_-]/g, '');
      const vendorNumber = sanitize(formData.installer_vendor_id) || 'NoVendorID';
      const nameParts = (formData.name || 'Unknown Installer').split(' ');
      const firstName = sanitize(nameParts[0]);
      const lastName = sanitize(nameParts.slice(1).join(' '));
      const filename = `${vendorNumber}_${firstName}_${lastName}_territories.csv`;

      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Territories exported successfully!", { id: loadingToastId });
    } catch (err: any) {
      console.error("Error during territory export:", err);
      toast.error(`Failed to export territories: ${err.message}`, { id: loadingToastId });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyShareableLink = async () => {
    if (!installerId) return;
    const loadingToastId = toast.loading("Generating link...");
    try {
      const { data, error } = await supabase
        .from('installers')
        .select('territory_access_token')
        .eq('id', installerId)
        .single();

      if (error || !data?.territory_access_token) {
        throw new Error(error?.message || "Could not retrieve access token.");
      }

      const token = data.territory_access_token;
      const url = `${window.location.origin}/territory-editor/${installerId}/${token}`;
      
      await navigator.clipboard.writeText(url);
      toast.success("Sharable link copied to clipboard!", { id: loadingToastId });
    } catch (err: any) {
      console.error("Error generating shareable link:", err);
      toast.error(`Failed to generate link: ${err.message}`, { id: loadingToastId });
    }
  };

  const handleAutoApprove = async () => {
    if (!currentInstaller?.latitude || !currentInstaller?.longitude) {
      toast.error("Installer location is not set. Cannot auto-approve.");
      return;
    }
  
    setLoading(true);
    const isCanada = installerCountry === 'Canada';
    const radiusMeters = isCanada ? 35000 : 25 * 1609.34;
    
    let loadingToastId: string | number | undefined;
  
    try {
      let zipsToApprove: Array<{ zipCode: string, stateProvince: string, centroid_latitude: number | null, centroid_longitude: number | null }> = [];
  
      if (isCanada) {
        loadingToastId = toast.loading("Fetching all territories within 35km radius...");

        const { data, error } = await supabase.functions.invoke('get-territories-in-radius', {
          body: { 
            country: 'Canada', 
            center: { lat: currentInstaller.latitude, lng: currentInstaller.longitude }, 
            radius: radiusMeters 
          },
        });

        if (error) {
          throw new Error(`Failed to fetch Canadian postal codes: ${error.message}`);
        }
        if (data.error) {
          throw new Error(`Failed to fetch Canadian postal codes: ${data.error}`);
        }

        if (!data.data || data.data.length === 0) {
          toast.info("No Canadian postal codes found within the 35km radius.", { id: loadingToastId });
          setLoading(false);
          return;
        }

        zipsToApprove = (data.data || []).map((p: any) => ({
          zipCode: p.POSTAL_CODE,
          stateProvince: p.PROVINCE_ABBR,
          centroid_latitude: p.LATITUDE,
          centroid_longitude: p.LONGITUDE,
        }));
      } else { // USA
        loadingToastId = toast.loading(`Finding territories within 25 miles...`);
        toast.info("Performing intersection check for all US ZIP codes. This may take a moment...", { id: loadingToastId });
        const center = turf.point([currentInstaller.longitude, currentInstaller.latitude]);
        const radiusKm = 25 * 1.60934; // 25 miles in km
        const options = { steps: 64, units: 'kilometers' as const };
        const radiusCircle = turf.circle(center, radiusKm, options);

        usGeoJson.features.forEach(feature => {
          if (feature.geometry) {
            try {
              // booleanIntersects is faster as it stops on first intersection
              if (turf.booleanIntersects(radiusCircle, feature as any)) {
                const zipCode = feature.properties.ZCTA5CE20;
                const state = feature.properties.STUSPS;
                const centroid = zipCodeCentroids.get(zipCode);
                zipsToApprove.push({
                  zipCode,
                  stateProvince: state,
                  centroid_latitude: centroid?.lat || null,
                  centroid_longitude: centroid?.lng || null,
                });
              }
            } catch (e) {
              // Log error for a specific feature but continue
              console.warn(`Could not process feature for ZIP ${feature.properties.ZCTA5CE20}:`, e);
            }
          }
        });
      }
  
      const newSelectedMap = new Map(selectedMapZipCodes.map(item => [item.zipCode, item]));
      zipsToApprove.forEach(zipInfo => {
        newSelectedMap.set(zipInfo.zipCode, {
          ...zipInfo,
          assignedStatus: 'Approved',
        });
      });
      const finalListOfZips = Array.from(newSelectedMap.values());
  
      await handleSubmit(finalListOfZips);
  
    } catch (err: any) {
      console.error("Error during auto-approve:", err);
      if (loadingToastId) {
        toast.error(`Auto-approve failed: ${err.message}`, { id: loadingToastId });
      } else {
        toast.error(`Auto-approve failed: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSayings />
      </div>
    );
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
                <Button variant="outline" onClick={handleAutoApprove} disabled={loading}>
                  <Star className="mr-2 h-4 w-4" /> Auto Approve {installerCountry === 'Canada' ? '35km' : '25 miles'}
                </Button>
                <Button variant="outline" className={cn(bulkActionType === 'approve' ? "bg-green-600 text-white hover:bg-green-700" : "border-green-600 text-green-600 hover:bg-green-100")} onClick={() => handleToggleBulkSelect('approve')} disabled={loading}><MousePointerClick className="mr-2 h-4 w-4" /> {bulkActionType === 'approve' ? "Exit Bulk Free Mileage" : "Bulk Free Mileage"}</Button>
                <Button variant="outline" className={cn(bulkActionType === 'needs_approval' ? "bg-orange-600 text-white hover:bg-orange-700" : "border-orange-600 text-orange-600 hover:bg-orange-100")} onClick={() => handleToggleBulkSelect('needs_approval')} disabled={loading}><MousePointerClick className="mr-2 h-4 w-4" /> {bulkActionType === 'needs_approval' ? "Exit Bulk Paid Mileage" : "Bulk Paid Mileage"}</Button>
                <Button variant="outline" onClick={handleClearAllAssignedZips} disabled={loading || selectedMapZipCodes.length === 0}><Eraser className="mr-2 h-4 w-4" /> Clear All Assigned</Button>
              </div>
            </div>
            <div className="h-[800px] w-full rounded-lg overflow-hidden shadow-sm border">
              <TerritoryMap
                country={installerCountry}
                isOpen={true}
                centerLocation={memoizedCenterLocation}
                onZipCodeClick={handleMapZipCodeClick}
                onBulkZipCodeUpdate={handleBulkZipCodeUpdate}
                selectedZipCodes={selectedMapZipCodes}
                currentDisplayRadius={mapDisplayRadius}
                showRadiusCircles={true}
                territoryStatuses={territoryStatuses}
                highlightedZipCodes={highlightedZipCodes}
                isBulkSelecting={bulkActionType !== null}
                onBulkSelectionComplete={handleBulkSelectionComplete}
              />
            </div>
            <p className="text-sm text-gray-500 mt-2">Click on ZIP code areas to assign/unassign them. In bulk select mode, click and drag to select multiple ZIP codes.</p>
            <div className="mt-6 p-4 border rounded-lg shadow-sm bg-card">
              <h4 className="font-semibold text-lg mb-3">Filter Assigned ZIPs by Radius (from Installer)</h4>
              <RadioGroup value={listDisplayRadius} onValueChange={(value) => setListDisplayRadius(value)} className="flex flex-wrap gap-4">
                {['0-25', '25-50', '50-75', '75-100', '100-125', '125-150'].map(range => (<div key={range} className="flex items-center space-x-2"><RadioGroupItem value={range} id={`list-radius-${range}`} /><Label htmlFor={`list-radius-${range}`}>{range} miles</Label></div>))}
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
            <Button onClick={() => handleSubmit()} disabled={loading} className="bg-green-600 hover:bg-green-700">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save Territory Changes
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

export default PublicTerritoryEditor;