"use client";

import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save, XCircle, ArrowLeft, MousePointerClick, Eraser, Upload, Download, Home, LogOut, Copy, Star, ChevronsUpDown, Share2 } from "lucide-react";
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
import {
  useInstaller,
  useInstallerZipCodes,
  useSaveInstaller,
  useCanadianFsaPostalCounts,
  fetchCanadianPostalsForFsa,
} from "@/hooks/useInstallerData";

proj4.defs("EPSG:3857", "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs");
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");
proj4.defs("EPSG:3347", "+proj=lcc +lat_1=49 +lat_2=77 +lat_0=63.390675 +lon_0=-91.86666666666666 +x_0=6200000 +y_0=3000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");

const toBoolean = (value: any): boolean => {
  if (typeof value === 'string') return value.toLowerCase() === '1' || value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';
  return value === 1 || value === true;
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

/** Admin maps use their own localStorage key so a prior "postal codes" choice on /territory-editor does not force a heavy load on /installers/edit. */
const CANADA_MAP_MODE_STORAGE_ADMIN = "territory-map-canada-display-mode-admin";

const EditInstallerPage: React.FC = () => {
  const { installerId } = useParams<{ installerId: string }>();
  const navigate = useNavigate();
  
  const { data: installerData, isLoading: isLoadingInstaller, error: installerError } = useInstaller(installerId!);
  const { data: zipCodeData, isLoading: isLoadingZips, error: zipsError } = useInstallerZipCodes(installerId!);
  const saveMutation = useSaveInstaller();

  const [formData, setFormData] = useState<any>({});
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [initialSelectedMapZipCodes, setInitialSelectedMapZipCodes] = useState<any[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mapRefreshKey, setMapRefreshKey] = useState<number>(0); 
  const [selectedMapZipCodes, setSelectedMapZipCodes] = useState<Array<{ zipCode: string, assignedStatus: TerritoryStatus, stateProvince: string, centroid_latitude: number | null, centroid_longitude: number | null }>>([]);
  const [territoryStatuses, setTerritoryStatuses] = useState<Map<string, TerritoryStatus>>(new Map());
  const [bulkActionType, setBulkActionType] = useState<'approve' | 'needs_approval' | 'deselect' | null>(null);
  const [isImportTerritoriesModalOpen, setIsImportTerritoriesModalOpen] = useState(false);
  const [listDisplayRadius, setListDisplayRadius] = useState<string | 'all'>('all');
  const { profile, user, loading: sessionLoading } = useSession();

  const installerBlockingLoad = isLoadingInstaller;

  const currentInstaller = useMemo((): Installer | null => {
    if (!installerData) return null;
    return {
      ...installerData,
      id: installerData.id,
      name: installerData.name,
      skills: [],
      brands: [],
      certifications: [],
      rawSupabaseData: installerData,
    } as Installer;
  }, [installerData]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleShare = () => {
    if (currentInstaller?.id && formData.territory_access_token) {
      const shareUrl = `${window.location.origin}/territory-editor/${currentInstaller.id}/${formData.territory_access_token}`;
      navigator.clipboard.writeText(shareUrl).then(() => {
        toast.success("Sharable territory editor link copied to clipboard!");
      }).catch(err => {
        console.error('Failed to copy: ', err);
        toast.error("Failed to copy link.");
      });
    } else {
      toast.error("Could not generate share link. Token missing.");
    }
  };

  const handleClone = () => {
    toast.info("Clone functionality is not yet implemented.");
  };

  const installerCountry = useMemo(() => {
    const c = formData?.country?.toUpperCase();
    return (c === 'CANADA' || c === 'CA') ? 'Canada' : 'USA';
  }, [formData?.country]);

  // Loaded once and cached forever (~3.8k FSA → count entries). Drives
  // the "fully covered vs partial" colouring on Canadian FSA polygons.
  const { data: fsaTotalPostalCounts, isLoading: isFsaTotalPostalCountsLoading } = useCanadianFsaPostalCounts(
    installerCountry === 'Canada',
  );

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

  const memoizedCenterLocation = useMemo(() => {
    if (currentInstaller?.latitude != null && currentInstaller?.longitude != null) {
      return { lat: currentInstaller.latitude, lng: currentInstaller.longitude };
    }
    return null;
  }, [currentInstaller?.latitude, currentInstaller?.longitude]);

  // Canadian postals come from the database as e.g. "T4X 2J3" (with a
  // space) but the FSA bulk-add path stores them as "T4X2J3". Normalize
  // both sides so the postal-codes layer colours every dot whose
  // canonical form has been assigned, regardless of stored whitespace
  // or case.
  const highlightedZipCodes = useMemo(() => {
    const highlights = new Map<string, 'green' | 'orange'>();
    selectedMapZipCodes.forEach(item => {
      const key = item.zipCode.toUpperCase().replace(/\s+/g, '');
      highlights.set(key, item.assignedStatus === 'Approved' ? 'green' : 'orange');
    });
    return highlights;
  }, [selectedMapZipCodes]);

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
    // Uses the SECURITY DEFINER RPC which returns one deduplicated row per
    // zip code (Approved > Needs Approval > else). Replaces the previous
    // global SELECT that pulled hundreds of thousands of rows on every load.
    const { data, error } = await supabase.rpc('get_global_territory_statuses');
    const statusMap = new Map<string, TerritoryStatus>();
    if (error) {
      console.error('Error fetching global territory statuses:', error);
    } else if (data) {
      for (const item of data as Array<{ zip_code: string; status: string }>) {
        if (item.zip_code) {
          statusMap.set(item.zip_code, item.status as TerritoryStatus);
        }
      }
    }
    setTerritoryStatuses(statusMap);
    return statusMap;
  }, []);

  useLayoutEffect(() => {
    if (!installerData) return;
    setFormData(installerData);
    setInitialFormData(JSON.parse(JSON.stringify(installerData)));
    setIsDirty(false);
  }, [installerData]);

  useEffect(() => {
    if (!installerId) return;
    setSelectedMapZipCodes([]);
    setInitialSelectedMapZipCodes([]);
  }, [installerId]);

  useEffect(() => {
    if (zipCodeData === undefined || !installerData || installerData.id !== installerId) return;

    const enrichedZips = zipCodeData.map((item) => {
      const centroid = zipCodeCentroids.get(item.zip_code);
      return {
        zipCode: item.zip_code,
        assignedStatus: item.status as TerritoryStatus,
        stateProvince: item.state_province,
        centroid_latitude: centroid?.lat || null,
        centroid_longitude: centroid?.lng || null,
      };
    });

    setSelectedMapZipCodes(enrichedZips);
    setInitialSelectedMapZipCodes(JSON.parse(JSON.stringify(enrichedZips)));

    fetchTerritoryStatuses();
  }, [installerData, installerId, zipCodeData, zipCodeCentroids, fetchTerritoryStatuses]);

  useEffect(() => {
    if (installerBlockingLoad || sessionLoading || !initialFormData) return;
    const normalizeZips = (zips: any[]) => zips.map(({ zipCode, assignedStatus }) => ({ zipCode, assignedStatus })).sort((a, b) => a.zipCode.localeCompare(b.zipCode));
    const zipCodesChanged = JSON.stringify(normalizeZips(selectedMapZipCodes)) !== JSON.stringify(normalizeZips(initialSelectedMapZipCodes));
    setIsDirty(JSON.stringify(formData) !== JSON.stringify(initialFormData) || zipCodesChanged);
  }, [formData, selectedMapZipCodes, initialFormData, initialSelectedMapZipCodes, installerBlockingLoad, sessionLoading]);

  // FSA bulk action: replace every assignment in the FSA with the chosen
  // status (Free/Paid) or remove them all. Persists immediately to the
  // database via the same edge function the regular Save button uses,
  // but only for the diff scoped to this FSA - any other unsaved form
  // edits or single-postal toggles stay pending under the bottom Save
  // button.
  //
  // Implementation:
  //   1. Compute the diff (added / updated / removed) for THIS FSA only
  //      by comparing the new FSA assignments against the persisted
  //      initialSelectedMapZipCodes baseline.
  //   2. Send the diff to save-public-territory-data in chunks (matches
  //      the existing save flow's chunking).
  //   3. On success, update both selectedMapZipCodes and
  //      initialSelectedMapZipCodes so the form's dirty state reflects
  //      only the user's other unsaved changes.
  const handleFsaBulkAction = useCallback(
    async (
      fsa: string,
      action: 'free' | 'paid' | 'remove',
      stateProvinceFromMap: string,
    ) => {
      if (!installerId) return;
      const fsaUpper = fsa.toUpperCase();
      // Normalize: uppercase + strip all whitespace. Existing rows in
      // the DB tend to be "T4X 2J3"; fresh ones from the FSA RPC are
      // "T4X2J3". Always match on the normalized form.
      const norm = (s: string) => (s ?? '').toUpperCase().replace(/\s+/g, '');
      const startsWithFsa = (z: string) => norm(z).startsWith(fsaUpper);

      let nextEntries: Array<{
        zipCode: string;
        assignedStatus: TerritoryStatus;
        stateProvince: string;
        centroid_latitude: number | null;
        centroid_longitude: number | null;
      }> = [];

      if (action === 'remove') {
        nextEntries = [];
      } else {
        let postals;
        try {
          postals = await fetchCanadianPostalsForFsa(fsa);
        } catch (err: any) {
          console.error('Failed to fetch FSA postals:', err);
          toast.error(`Could not load postals for ${fsa}: ${err?.message ?? 'unknown error'}`);
          throw err;
        }
        if (!postals.length) {
          toast.info(`No postals found for ${fsa}.`);
          return;
        }
        const newStatus: TerritoryStatus = action === 'free' ? 'Approved' : 'Needs Approval';
        nextEntries = postals.map(p => ({
          zipCode: p.postal_code.toUpperCase(),
          assignedStatus: newStatus,
          stateProvince: p.province_abbr || stateProvinceFromMap || 'Unknown',
          centroid_latitude: p.latitude ?? null,
          centroid_longitude: p.longitude ?? null,
        }));
      }

      // Diff against the persisted baseline so we only push what
      // actually changed for THIS FSA. Both maps are keyed by the
      // normalized postal code so e.g. "T4X 1A1" (existing) and
      // "T4X1A1" (incoming) match cleanly.
      const baselineForFsa = new Map(
        initialSelectedMapZipCodes
          .filter(z => startsWithFsa(z.zipCode))
          .map(z => [norm(z.zipCode), z]),
      );
      const nextForFsa = new Map(nextEntries.map(z => [norm(z.zipCode), z]));

      const addedZips = nextEntries
        .filter(z => !baselineForFsa.has(norm(z.zipCode)))
        .map(z => ({ zip_code: z.zipCode, state_province: z.stateProvince, assigned_status: z.assignedStatus }));
      // Status updates: use the BASELINE's stored zipCode string so we
      // hit the right row in the DB (the table column is the raw text,
      // including any space).
      const updatedZips = nextEntries
        .map(z => {
          const b = baselineForFsa.get(norm(z.zipCode));
          if (!b || b.assignedStatus === z.assignedStatus) return null;
          return { zip_code: b.zipCode, assigned_status: z.assignedStatus };
        })
        .filter((x): x is { zip_code: string; assigned_status: TerritoryStatus } => x !== null);
      const removedZips = Array.from(baselineForFsa.values())
        .filter(z => !nextForFsa.has(norm(z.zipCode)))
        .map(z => ({ zipCode: z.zipCode }));

      if (addedZips.length === 0 && updatedZips.length === 0 && removedZips.length === 0) {
        if (action === 'remove') {
          toast.info(`No assignments to remove in ${fsa}.`);
        } else {
          toast.info(`${fsa} is already set as ${action === 'free' ? 'Free' : 'Paid'}.`);
        }
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const CHUNK_SIZE = 200;
      const processChanges = async (
        type: 'added' | 'updated' | 'removed',
        items: any[],
      ) => {
        if (items.length === 0) return;
        for (let i = 0; i < items.length; i += CHUNK_SIZE) {
          const chunk = items.slice(i, i + CHUNK_SIZE);
          const body: any = {
            installerId,
            addedZips: type === 'added' ? chunk : [],
            updatedZips: type === 'updated' ? chunk : [],
            removedZips: type === 'removed' ? chunk : [],
          };
          const { error } = await supabase.functions.invoke('save-public-territory-data', {
            headers: { Authorization: `Bearer ${session?.access_token}` },
            body,
          });
          if (error) throw new Error(`Failed during ${type} step: ${error.message}`);
        }
      };

      try {
        await processChanges('removed', removedZips);
        await processChanges('updated', updatedZips);
        await processChanges('added', addedZips);
      } catch (err: any) {
        console.error('FSA bulk save failed:', err);
        toast.error(`Could not save ${fsa}: ${err?.message ?? 'unknown error'}`);
        throw err;
      }

      // Apply the same diff to both the working copy and the persisted
      // baseline so the form's dirty state stays accurate (only the
      // user's other unrelated edits remain pending).
      // For postals already in the baseline we keep the BASELINE's
      // zipCode string (preserves whatever format is in the DB) and
      // only swap the assignedStatus. New postals carry the normalized
      // string from the FSA RPC.
      const applyDiff = (
        prev: typeof selectedMapZipCodes,
      ): typeof selectedMapZipCodes => {
        const remaining = prev.filter(item => !startsWithFsa(item.zipCode));
        const merged = nextEntries.map(next => {
          const b = baselineForFsa.get(norm(next.zipCode));
          if (b) {
            return { ...b, assignedStatus: next.assignedStatus };
          }
          return next;
        });
        return [...remaining, ...merged];
      };
      setSelectedMapZipCodes(applyDiff);
      setInitialSelectedMapZipCodes(prev => applyDiff(prev));
      setMapRefreshKey(p => p + 1);

      if (action === 'remove') {
        toast.success(`Removed ${removedZips.length.toLocaleString()} postals from ${fsa}.`);
      } else {
        const total = nextEntries.length;
        toast.success(
          `Saved ${total.toLocaleString()} postals in ${fsa} as ${action === 'free' ? 'Free' : 'Paid'}.`,
        );
      }
    },
    [installerId, initialSelectedMapZipCodes],
  );

  const handleMapZipCodeClick = useCallback((zipCode: string, stateProvince: string) => {
    setSelectedMapZipCodes(prev => {
      const idx = prev.findIndex(item => item.zipCode === zipCode);
      const c = zipCodeCentroids.get(zipCode);
      if (idx !== -1) {
        if (prev[idx].assignedStatus === 'Approved') {
          return [...prev.slice(0, idx), { ...prev[idx], assignedStatus: 'Needs Approval' }, ...prev.slice(idx + 1)];
        }
        return prev.filter(item => item.zipCode !== zipCode);
      }
      return [...prev, { zipCode, assignedStatus: 'Approved', stateProvince, centroid_latitude: c?.lat || null, centroid_longitude: c?.lng || null }];
    });
    setMapRefreshKey(p => p + 1);
  }, [zipCodeCentroids]);

  const handleAddZipCode = useCallback((zipCode: string, status: TerritoryStatus) => {
    const isCanada = installerCountry === 'Canada';
    const lookupCode = isCanada ? zipCode.substring(0, 3).toUpperCase() : zipCode;
    const centroid = zipCodeCentroids.get(lookupCode);
    
    setSelectedMapZipCodes(prev => {
      if (prev.some(z => z.zipCode === zipCode)) {
        toast.info(`${zipCode} is already assigned.`);
        return prev;
      }
      
      return [...prev, {
        zipCode: zipCode.toUpperCase(),
        assignedStatus: status,
        stateProvince: centroid?.state || 'Unknown',
        centroid_latitude: centroid?.lat || null,
        centroid_longitude: centroid?.lng || null,
      }];
    });
    setMapRefreshKey(p => p + 1);
  }, [installerCountry, zipCodeCentroids]);

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

  const handleSubmit = async (territoriesOverride?: any[]) => {
    if (!validateForm() || !currentInstaller?.id) return;
    
    const loadingToastId = toast.loading("Saving changes...");
    const territoriesToProcess = territoriesOverride || selectedMapZipCodes;

    saveMutation.mutate({
        installerId: currentInstaller.id,
        formData,
        initialFormData,
        selectedMapZipCodes: territoriesToProcess,
        initialSelectedMapZipCodes,
    }, {
        onSuccess: () => {
            toast.success("Changes saved successfully! Data is refreshing.", { id: loadingToastId });
        },
        onError: (err: any) => {
            toast.error(`Save failed: ${err.message}`, { id: loadingToastId });
        }
    });
  };

  const handleAutoApprove = async () => {
    if (!currentInstaller?.latitude || !currentInstaller?.longitude) return;
    
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
      
      if (loadingToastId) toast.dismiss(loadingToastId);
      
      await handleSubmit(final);
    } catch (err: any) {
      toast.error(`Auto-approve failed: ${err.message}`, { id: loadingToastId });
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

  const handleImportTerritories = async (file: File, mode: "overwrite" | "append") => {
    const loadingToastId = toast.loading(`Importing territories from ${file.name}...`);

    try {
      const results = await new Promise<any[]>((resolve, reject) => {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (res) => resolve(res.data),
          error: (err) => reject(err),
        });
      });

      const newTerritories = results.map(row => {
        const zipCode = row['ZIP Code'];
        const statusRaw = row['Status'];
        const stateProvince = row['State/Province'];

        if (!zipCode || !statusRaw || !stateProvince) {
          console.warn("Skipping invalid row (missing required fields):", row);
          return null;
        }

        let assignedStatus: TerritoryStatus;
        if (statusRaw.toLowerCase() === 'free_mileage') {
          assignedStatus = 'Approved';
        } else if (statusRaw.toLowerCase() === 'paid_mileage') {
          assignedStatus = 'Needs Approval';
        } else {
          console.warn(`Skipping row with invalid status "${statusRaw}":`, row);
          return null;
        }
        
        const centroid = zipCodeCentroids.get(zipCode);

        return {
          zipCode: String(zipCode),
          assignedStatus: assignedStatus,
          stateProvince: String(stateProvince),
          centroid_latitude: centroid?.lat || null,
          centroid_longitude: centroid?.lng || null,
        };
      }).filter(Boolean) as Array<{ zipCode: string, assignedStatus: TerritoryStatus, stateProvince: string, centroid_latitude: number | null, centroid_longitude: number | null }>;

      if (mode === 'overwrite') {
        setSelectedMapZipCodes(newTerritories);
        toast.success(`Prepared ${newTerritories.length} territories for import. Click Save to confirm.`, { id: loadingToastId });
      } else { // append
        setSelectedMapZipCodes(prev => {
          const existingZips = new Map(prev.map(z => [z.zipCode, z]));
          newTerritories.forEach(newZip => {
            existingZips.set(newZip.zipCode, newZip);
          });
          return Array.from(existingZips.values());
        });
        toast.success(`Prepared ${newTerritories.length} new/updated territories for import. Click Save to confirm.`, { id: loadingToastId });
      }
      
      setMapRefreshKey(p => p + 1); // Refresh map view
      setIsImportTerritoriesModalOpen(false);

    } catch (err: any) {
      console.error("Error importing territories:", err);
      toast.error(`Import failed: ${err.message}`, { id: loadingToastId });
    }
  };

  const handleExportTerritories = () => {
    if (selectedMapZipCodes.length === 0) {
      toast.info("No territories assigned to this installer to export.");
      return;
    }

    const dataToExport = selectedMapZipCodes.map(({ zipCode, assignedStatus, stateProvince }) => ({
      'State/Province': stateProvince,
      'ZIP Code': zipCode,
      'Status': assignedStatus === 'Approved' ? 'Free_Mileage' : 'Paid_Mileage',
    }));

    const csv = Papa.unparse(dataToExport, {
      fields: ['State/Province', 'ZIP Code', 'Status']
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `${currentInstaller?.name}_territories.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success("Territories exported successfully!");
  };

  const loadAllData = useCallback(() => {
    if (initialFormData) {
      setFormData(JSON.parse(JSON.stringify(initialFormData)));
    }
    setSelectedMapZipCodes(JSON.parse(JSON.stringify(initialSelectedMapZipCodes)));
    setMapRefreshKey((p) => p + 1);
    setIsDirty(false);
  }, [initialFormData, initialSelectedMapZipCodes]);

  if (sessionLoading || installerBlockingLoad) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <LoadingSayings />
      </div>
    );
  }
  if (installerError) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500">
        Error: {installerError.message}
      </div>
    );
  }
  if (!currentInstaller) return null;

  const canEdit = profile?.role === 'admin' || (profile?.role === 'installer' && currentInstaller.rawSupabaseData?.account_id === user?.id);

  const territoryActionsDisabled =
    saveMutation.isPending || !canEdit || isLoadingZips || !!zipsError;

  return (
    <>
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 pb-24">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-4">
            {profile?.role === 'admin' && <Button variant="outline" size="sm" onClick={() => navigate("/installers")} className="mr-2"><ArrowLeft className="h-4 w-4" /></Button>}
            <div><h1 className="text-2xl font-bold text-gray-700">{currentInstaller.name}</h1></div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => navigate("/locator")}>
              <Home className="mr-2 h-4 w-4" /> Locator
            </Button>
            <Button variant="outline" onClick={handleClone}>
              <Copy className="mr-2 h-4 w-4" /> Clone
            </Button>
            <Button variant="outline" onClick={handleShare}>
              <Share2 className="mr-2 h-4 w-4" /> Share
            </Button>
            <Button variant="outline" onClick={handleLogout}><LogOut className="mr-2 h-4 w-4" /> Log Out</Button>
          </div>
        </div>

        <Collapsible defaultOpen={false} className="mb-8">
          <CollapsibleTrigger asChild>
            <div className="flex justify-between items-center p-4 border rounded-lg shadow-sm bg-card cursor-pointer">
              <h2 className="text-xl font-semibold">Installer Profile Details</h2>
              <Button variant="outline" size="sm">
                <ChevronsUpDown className="h-4 w-4" />
                <span className="ml-2">Show/Hide Details</span>
              </Button>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid gap-6 py-4 border-x border-b rounded-b-lg p-4">
              <div className="flex justify-between items-center col-span-full mt-4 mb-2">
                <h3 className="text-lg font-semibold">Contact & Address Information</h3>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_active"
                    name="is_active"
                    checked={toBoolean(formData.is_active)}
                    onCheckedChange={(checked) => handleCheckboxChange('is_active', checked as boolean)}
                    disabled={!canEdit}
                    className={cn(
                      toBoolean(formData.is_active) ? 'switch-active' : 'switch-inactive'
                    )}
                  />
                  <Label htmlFor="is_active" className={cn(
                    "font-semibold",
                    toBoolean(formData.is_active) ? 'text-green-700' : 'text-red-700'
                  )}>
                    {toBoolean(formData.is_active) ? 'Active' : 'Inactive'}
                  </Label>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 col-span-full">
                {contactAddressFields.map((key) => (
                  <div key={key} className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor={key} className="text-right">{columnDisplayNames[key] || key.replace(/_/g, ' ')}{requiredFields.includes(key) && <span className="text-red-500 ml-1">*</span>}:</Label>
                    <Input id={key} name={key} value={formData[key] ?? ''} onChange={handleInputChange} className={`col-span-3 ${errors[key] ? 'border-red-500' : ''}`} type="text" disabled={!canEdit} />
                    {errors[key] && <p className="col-span-4 text-right text-red-500 text-sm">{errors[key]}</p>}
                  </div>
                ))}
              </div>
              <h3 className="text-lg font-semibold col-span-full mt-4 mb-2">Brands & Skills</h3>
              <div className="col-span-full">
                <h4 className="font-medium text-base mb-2">Brands (Level 1)</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {brandCheckboxes.sort((a, b) => a.label.localeCompare(b.label)).map((item) => (
                    <div key={item.key} className="flex items-center space-x-2">
                      <Checkbox id={item.key} name={item.key} checked={toBoolean(formData[item.key])} onCheckedChange={(checked) => handleCheckboxChange(item.key, checked as boolean)} disabled={!canEdit} />
                      <Label htmlFor={item.key}>{item.label}</Label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="col-span-full mt-4">
                <h4 className="font-medium text-base mb-2">Product Skills (Level 2)</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {productSkillCheckboxes.sort((a, b) => a.label.localeCompare(b.label)).map((item) => (
                    <div key={item.key} className="flex items-center space-x-2">
                      <Checkbox id={item.key} name={item.key} checked={toBoolean(formData[item.key])} onCheckedChange={(checked) => handleCheckboxChange(item.key, checked as boolean)} disabled={!canEdit} />
                      <Label htmlFor={item.key}>{item.label}</Label>
                    </div>
                  ))}
                </div>
              </div>
              <h3 className="text-lg font-semibold col-span-full mt-4 mb-2">Certifications</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 col-span-full">
                {certificationCheckboxes.sort((a, b) => a.label.localeCompare(b.label)).map((cert) => {
                  const currentCerts = formData[cert.dbColumn] ? String(formData[cert.dbColumn]).split(', ').filter(Boolean) : [];
                  const isChecked = currentCerts.includes(cert.value);
                  return (
                    <div key={cert.label} className="flex items-center space-x-2">
                      <Checkbox id={cert.label} name={cert.label} checked={isChecked} onCheckedChange={(checked) => handleCertificationCheckboxChange(cert.dbColumn, cert.value, checked as boolean)} disabled={!canEdit} />
                      <Label htmlFor={cert.label}>{cert.label}</Label>
                    </div>
                  );
                })}
              </div>
              <h3 className="text-lg font-semibold col-span-full mt-4 mb-2">Other Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 col-span-full">
                {otherFields.sort((a, b) => (columnDisplayNames[a]?.localeCompare(columnDisplayNames[b] || b) || a.localeCompare(b))).map((key) => (
                  <div key={key} className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor={key} className="text-right">{columnDisplayNames[key] || key.replace(/_/g, ' ')}:</Label>
                    {key === 'shipment' ? (
                      <Checkbox id={key} name={key} checked={toBoolean(formData[key])} onCheckedChange={(checked) => handleCheckboxChange(key, checked as boolean)} className="col-span-3" disabled={!canEdit} />
                    ) : (
                      <Input id={key} name={key} value={formData[key] ?? ''} onChange={handleInputChange} className="col-span-3" type={['installer_vendor_id', 'star_rating'].includes(key) ? 'number' : 'text'} disabled={!canEdit} />
                    )}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 col-span-full">
                {textAreaFields.sort((a, b) => (columnDisplayNames[a]?.localeCompare(columnDisplayNames[b] || b) || a.localeCompare(b))).map((key) => (
                  <div key={key} className="grid grid-cols-4 items-start gap-4">
                    <Label htmlFor={key} className="text-right pt-2">{columnDisplayNames[key] || key.replace(/_/g, ' ')}:</Label>
                    <Textarea id={key} name={key} value={formData[key] ?? ''} onChange={handleInputChange} className="col-span-3 min-h-[80px]" disabled={!canEdit} />
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="grid gap-6 py-4">
          <div className="col-span-full mt-6">
            <h3 className="text-lg font-semibold mb-2">Assigned Territories</h3>
            <div className="flex flex-wrap justify-between gap-2 mb-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={handleAutoApprove} disabled={territoryActionsDisabled}><Star className="mr-2 h-4 w-4" /> Auto Approve {installerCountry === 'Canada' ? '35km' : '25 miles'}</Button>
                <Button variant="outline" className={cn(bulkActionType === 'approve' ? "bg-green-600 text-white" : "text-green-600")} onClick={() => setBulkActionType('approve')} disabled={territoryActionsDisabled}>Bulk Free Mileage</Button>
                <Button variant="outline" className={cn(bulkActionType === 'needs_approval' ? "bg-orange-600 text-white" : "text-orange-600")} onClick={() => setBulkActionType('needs_approval')} disabled={territoryActionsDisabled}>Bulk Paid Mileage</Button>
                {installerCountry === 'Canada' ? (
                  <Button variant="outline" className={cn(bulkActionType === 'deselect' ? "bg-red-600 text-white" : "text-red-600")} onClick={() => setBulkActionType('deselect')} disabled={territoryActionsDisabled}>
                    <Eraser className="mr-2 h-4 w-4" /> Bulk Deselect
                  </Button>
                ) : (
                  <Button variant="outline" onClick={handleClearAllAssignedZips} disabled={territoryActionsDisabled}>
                    <Eraser className="mr-2 h-4 w-4" /> Clear All
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setIsImportTerritoriesModalOpen(true)} disabled={territoryActionsDisabled}>
                  <Upload className="mr-2 h-4 w-4" /> Import
                </Button>
                <Button variant="outline" onClick={handleExportTerritories} disabled={saveMutation.isPending || isLoadingZips}>
                  <Download className="mr-2 h-4 w-4" /> Export
                </Button>
              </div>
            </div>
            {zipsError && (
              <p className="text-sm text-red-600 mb-2" role="alert">
                Territory assignments failed to load: {zipsError.message}
              </p>
            )}
            {isLoadingZips ? (
              <div className="h-[800px] w-full border rounded-lg overflow-hidden flex flex-col items-center justify-center bg-muted/20 gap-3 text-muted-foreground">
                <Loader2 className="h-10 w-10 animate-spin" />
                <p className="text-sm font-medium text-center max-w-md px-4">
                  Loading territory assignments&hellip; Large installers can take up to a minute while rows arrive from the database.
                </p>
              </div>
            ) : (
              <>
                <div className="h-[800px] w-full border rounded-lg overflow-hidden">
                  <TerritoryMap
                    country={installerCountry}
                    isOpen={true}
                    centerLocation={memoizedCenterLocation}
                    onZipCodeClick={handleMapZipCodeClick}
                    selectedZipCodes={selectedMapZipCodes}
                    currentDisplayRadius={mapDisplayRadius}
                    showRadiusCircles={true}
                    territoryStatuses={territoryStatuses}
                    highlightedZipCodes={highlightedZipCodes}
                    isBulkSelecting={!!bulkActionType}
                    onBulkSelectionComplete={handleBulkSelectionComplete}
                    refreshKey={mapRefreshKey}
                    canadaDisplayModeStorageKey={installerCountry === 'Canada' ? CANADA_MAP_MODE_STORAGE_ADMIN : undefined}
                    fsaTotalPostalCounts={fsaTotalPostalCounts}
                    fsaTotalPostalCountsLoading={isFsaTotalPostalCountsLoading}
                    onFsaBulkAction={installerCountry === 'Canada' ? handleFsaBulkAction : undefined}
                  />
                </div>
                <InstallerTerritoryList
                  assignedZipCodes={selectedMapZipCodes}
                  onZipCodeClick={handleMapZipCodeClick}
                  onAddZipCode={handleAddZipCode}
                  mapClickStates={highlightedZipCodes}
                  installerLocation={memoizedCenterLocation}
                  listDisplayRadius={listDisplayRadius}
                />
              </>
            )}
          </div>
        </div>
      </div>
      {isDirty && (
        <div className="fixed bottom-0 left-0 w-full z-[1000] bg-white border-t p-4 flex justify-end gap-2">
          <Button variant="outline" onClick={loadAllData} disabled={saveMutation.isPending}>Discard</Button>
          <Button
            onClick={() => handleSubmit()}
            disabled={saveMutation.isPending || isLoadingZips || !!zipsError}
            className="bg-green-600"
          >
            {saveMutation.isPending ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />} Save
          </Button>
        </div>
      )}
      <ImportInstallerTerritoriesModal
        isOpen={isImportTerritoriesModalOpen}
        onClose={() => setIsImportTerritoriesModalOpen(false)}
        onImport={handleImportTerritories}
        loading={saveMutation.isPending}
      />
    </>
  );
};

export default EditInstallerPage;