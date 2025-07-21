import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save, XCircle, ArrowLeft, MousePointerClick, Eraser, Upload, Download } from "lucide-react";
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
import * as turf from '@turf/turf'; // Import turf for centroid calculation
import proj4 from 'proj4'; // Import proj4 for coordinate transformation

// Define the projection for EPSG:3857 (Web Mercator)
proj4.defs("EPSG:3857", "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs");
// Define the projection for EPSG:4326 (WGS84 Geographic)
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

// Helper to convert Supabase boolean-like values to actual booleans
const toBoolean = (value: any): boolean => {
  if (typeof value === 'string') {
    return value.toLowerCase() === '1' || value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';
  }
  return value === 1 || value === true;
};

// Helper to convert boolean to Supabase-compatible values
const fromBooleanToSupabase = (key: string, value: boolean): string | number => {
  if (['PowerView'].includes(key)) {
    return value ? '1' : '0';
  }
  if (['Shipment'].includes(key)) {
    return value ? 'Yes' : 'No';
  }
  return value ? 1 : 0;
};

// Define field groups for better organization
const contactAddressFields = [
  "name", "email",
  "primary_phone", "secondary_phone",
  "address1", "add2",
  "city", "state",
  "postalcode", "Country"
];

const brandCheckboxes = [
  { key: "Hunter_Douglas", label: "Hunter Douglas" },
  { key: "Alta", label: "Alta" },
  { key: "Carole", label: "Carole" },
  { key: "Architectural", label: "Architectural" },
  { key: "Levolor", label: "Levolor" },
  { key: "Three_Day_Blinds", label: "Three Day Blinds" },
];

const productSkillCheckboxes = [
  { key: "Blinds_and_Shades", label: "Blinds & Shades" },
  { key: "Shutters", label: "Shutters" },
  { key: "Draperies", label: "Drapery" },
  { key: "PowerView", label: "Motorization" },
  { key: "Service_Call", label: "Service Call" },
  { key: "Tall_Window", label: "Tall Window" },
  { key: "Fixture_Displays", label: "Fixture Displays" },
  { key: "Outdoor", label: "Outdoor" },
  { key: "High_Voltage_Hardwired", label: "High Voltage Hardwired" },
];

const certificationCheckboxes = [
  { label: "Motorization Pro Certified", dbColumn: "Powerview_Certification", value: "Motorization Pro" },
  { label: "ShutterPro Certified", dbColumn: "Shutter_Certification_Level", value: "ShutterPro Certified" },
  { label: "Master Shutter", dbColumn: "Shutter_Certification_Level", value: "Master Shutter" },
  { label: "Master Installer", dbColumn: "PIP_Certification_Level", value: "Master Installer" },
  { label: "Certified Installer", dbColumn: "PIP_Certification_Level", value: "Certified Installer" },
  { label: "Drapery Certified", dbColumn: "Draperies_Certification_Level", value: "Drapery Certified" },
];

const otherFields = [
  "Installer_Vendor_ID", "Star_Rating", "Shipment"
];

const textAreaFields = [
  "comments", "specialnote"
];

const frontendKeyToDbColumnMap: { [key: string]: string } = {
  "Hunter_Douglas": "hunter_douglas",
  "Alta": "Alta",
  "Carole": "carole",
  "Architectural": "architectural",
  "Levolor": "levolor",
  "Three_Day_Blinds": "three_day_blinds",
  "Blinds_and_Shades": "Blinds_and_Shades",
  "PowerView": "PowerView",
  "Service_Call": "Service_Call",
  "Shutters": "Shutters",
  "Draperies": "Draperies",
  "alta_motorization": "alta_motorization",
  "Tall_Window": "tall_window",
  "Fixture_Displays": "fixture_displays",
  "Outdoor": "outdoor",
  "High_Voltage_Hardwired": "high_voltage_hardwired",
  "Installer_Vendor_ID": "Installer_Vendor_ID",
  "Shipment": "Shipment",
  "Star_Rating": "Star_Rating",
  "PIP_Certification_Level": "PIP_Certification_Level",
  "Shutter_Certification_Level": "Shutter_Certification_Level",
  "Powerview_Certification": "Powerview_Certification",
  "Draperies_Certification_Level": "Draperies_Certification_Level",
  "Sales_Org": "Sales_Org",
  "name": "name",
  "email": "email",
  "primary_phone": "primary_phone",
  "secondary_phone": "secondary_phone",
  "address1": "address1",
  "add2": "add2",
  "city": "city",
  "state": "state",
  "postalcode": "postalcode",
  "Country": "Country",
  "specialnote": "specialnote",
  "comments": "comments",
  "latitude": "latitude",
  "longitude": "longitude",
  "account_id": "account_id",
};

const EditInstallerPage: React.FC = () => {
  const { installerId } = useParams<{ installerId: string }>();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<any>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedMapZipCodes, setSelectedMapZipCodes] = useState<Array<{ zipCode: string, assignedStatus: TerritoryStatus, stateProvince: string, centroid_latitude: number | null, centroid_longitude: number | null }>>([]);
  const [mapDisplayRadius, setMapDisplayRadius] = useState<number | 'all'>(150);
  const [allInstallerZipAssignments, setAllInstallerZipAssignments] = useState<InstallerZipAssignment[]>([]);
  const [currentInstaller, setCurrentInstaller] = useState<Installer | null>(null);
  const [bulkActionType, setBulkActionType] = useState<'approve' | 'needs_approval' | null>(null);
  const [isImportTerritoriesModalOpen, setIsImportTerritoriesModalOpen] = useState(false);
  const [listDisplayRadius, setListDisplayRadius] = useState<string | 'all'>('all');

  const { profile, loading: sessionLoading } = useSession();

  const installerCountry = useMemo(() => {
    const country = currentInstaller?.rawSupabaseData?.Country?.toUpperCase();
    if (country === 'CANADA' || country === 'CA' || country === 'CAN') {
      return 'Canada';
    }
    return 'USA';
  }, [currentInstaller?.rawSupabaseData?.Country]);

  const zipCodeCentroids = useMemo(() => {
    const map = new Map<string, { lat: number, lng: number, state: string }>();
    const geoJsonToProcess = installerCountry === 'Canada' ? canadaGeoJson : usGeoJson;

    if (geoJsonToProcess && geoJsonToProcess.features) {
      geoJsonToProcess.features.forEach(feature => {
        let zipCode: string | null = null;
        let state: string | null = null;
        let lat: number | null = null;
        let lng: number | null = null;

        if (installerCountry === 'Canada') {
          zipCode = feature.properties.CFSAUID;
          state = feature.properties.PRNAME;
          try {
            // Calculate centroid from the original feature (which is in EPSG:3857 for Canada)
            const centroid = turf.centroid(feature);
            if (centroid && centroid.geometry && centroid.geometry.coordinates) {
                // Reproject centroid coordinates from EPSG:3857 to EPSG:4326
                const reprojectedCoords = proj4('EPSG:3857', 'EPSG:4326', centroid.geometry.coordinates);
                lng = reprojectedCoords[0];
                lat = reprojectedCoords[1];
            }
          } catch (e) {
            console.warn("Error calculating centroid for Canadian feature:", feature, e);
          }
        } else { // USA
          zipCode = feature.properties.ZCTA5CE20;
          state = feature.properties.STUSPS;
          lat = parseFloat(feature.properties.INTPTLAT20);
          lng = parseFloat(feature.properties.INTPTLON20);
        }

        if (zipCode && lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
          map.set(zipCode, { lat, lng, state: state || 'Unknown' });
        }
      });
    }
    return map;
  }, [installerCountry]);

  const columnDisplayNames: { [key: string]: string } = useMemo(() => ({
    name: "Name",
    email: "Email",
    primary_phone: "Phone",
    secondary_phone: "Secondary Phone",
    address1: "Address Line 1",
    add2: "Address Line 2",
    city: "City",
    state: "State",
    postalcode: installerCountry === 'Canada' ? 'Postal Code' : 'Zip Code', // Dynamic label
    Country: "Country",
    Hunter_Douglas: "Hunter Douglas",
    Alta: "Alta",
    Carole: "Carole",
    Architectural: "Architectural",
    Levolor: "Levolor",
    Three_Day_Blinds: "Three Day Blinds",
    Blinds_and_Shades: "Blinds & Shades",
    PowerView: "Motorization",
    Service_Call: "Service Call",
    Shutters: "Shutters",
    Draperies: "Drapery",
    alta_motorization: "Alta Motorization",
    Tall_Window: "Tall Window",
    Fixture_Displays: "Fixture Displays",
    Outdoor: "Outdoor",
    High_Voltage_Hardwired: "High Voltage Hardwired",
    PIP_Certification_Level: "PIP Certification",
    Shutter_Certification_Level: "Shutter Certification Level",
    Powerview_Certification: "Motorization Certification",
    Draperies_Certification_Level: "Drapery Certification",
    Installer_Vendor_ID: "Installer Vendor ID",
    Shipment: "Accepts Shipments",
    Star_Rating: "Star Rating",
    specialnote: "Special Note",
    comments: "Comments",
    Sales_Org: "Sales Org",
  }), [installerCountry]);

  const requiredFields = [
    "name", "email", "primary_phone", "address1", "city", "state", "postalcode"
  ];

  const fetchAllInstallerZipAssignments = useCallback(async () => {
    const { data, error } = await supabase
      .from('installer_zip_codes')
      .select('id, zip_code, status, state_province, field_ops_rep_id, field_service_manager_id, installer_id');

    if (error) {
      console.error("Error fetching all installer zip assignments:", error);
      toast.error("Failed to load all territory data for map.");
      setAllInstallerZipAssignments([]);
      return [];
    } else {
      setAllInstallerZipAssignments(data || []);
      return data || [];
    }
  }, []);

  const fetchInstallerZipCodes = useCallback(async (id: string) => {
    if (!id) {
      console.warn("No installer ID provided to fetchInstallerZipCodes.");
      setSelectedMapZipCodes([]);
      return;
    }
    const { data, error } = await supabase
      .from('installer_zip_codes')
      .select('zip_code, status, state_province')
      .eq('installer_id', id);

    if (error) {
      console.error("Error fetching installer zip codes:", error);
      toast.error("Failed to load installer's assigned ZIP codes.");
      setSelectedMapZipCodes([]);
    } else {
      const enrichedZips = (data || []).map(item => {
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
    }
  }, [zipCodeCentroids]);

  // Effect 1: Load core installer data
  useEffect(() => {
    const loadInstallerData = async () => {
      if (!installerId) {
        toast.error("No installer ID provided.");
        navigate("/installers");
        return;
      }

      setLoading(true);
      const { data: installerData, error: fetchError } = await supabase
        .from('installers')
        .select('*')
        .eq('id', installerId)
        .single();

      if (fetchError || !installerData) {
        console.error("Error fetching installer:", fetchError);
        toast.error("Failed to load installer data.");
        navigate("/installers");
        setLoading(false);
        return;
      }

      const mappedInstaller: Installer = {
        id: installerData.id,
        name: installerData.name || installerData.H,
        address: `${installerData.address1 || ''} ${installerData.add2 || ''}, ${installerData.city || ''}, ${installerData.state || ''} ${installerData.postalcode || ''}`.trim(),
        zipCode: installerData.postalcode,
        phone: installerData.primary_phone,
        email: installerData.email,
        skills: [],
        brands: [],
        certifications: [],
        latitude: installerData.latitude,
        longitude: installerData.longitude,
        installerVendorId: installerData.Installer_Vendor_ID?.toString(),
        acceptsShipments: installerData.Shipment === 'Yes',
        Blinds_and_Shades_Raw: installerData.Blinds_and_Shades,
        PIP_Certification_Level_Raw: installerData.PIP_Certification_Level,
        PowerView_Raw: installerData.PowerView,
        Powerview_Certification_Raw: installerData.Powerview_Certification,
        Draperies_Raw: installerData.Draperies,
        Draperies_Certification_Level_Raw: installerData.Draperies_Certification_Level,
        Shutters_Raw: installerData.Shutters,
        Shutter_Certification_Level_Raw: installerData.Shutter_Certification_Level,
        Alta_Raw: installerData.Alta,
        alta_motorization_Raw: installerData.alta_motorization,
        Hunter_Douglas_Raw: installerData.hunter_douglas,
        Carole_Raw: installerData.carole,
        Architectural_Raw: installerData.architectural,
        Levolor_Raw: installerData.levolor,
        Three_Day_Blinds_Raw: installerData.three_day_blinds,
        Tall_Window_Raw: installerData.tall_window,
        Fixture_Displays_Raw: installerData.fixture_displays,
        Outdoor_Raw: installerData.outdoor,
        High_Voltage_Hardwired_Raw: installerData.high_voltage_hardwired,
        rawSupabaseData: installerData,
      };

      if (toBoolean(installerData.Blinds_and_Shades)) mappedInstaller.skills.push("Blinds & Shades");
      if (toBoolean(installerData.PowerView)) mappedInstaller.skills.push("Motorization");
      if (toBoolean(installerData.Shutters)) mappedInstaller.skills.push("Shutters");
      if (toBoolean(installerData.Draperies)) mappedInstaller.skills.push("Drapery");
      if (toBoolean(installerData.Service_Call)) mappedInstaller.skills.push("Service Call");
      if (toBoolean(installerData.tall_window)) mappedInstaller.skills.push("Tall Window");
      if (toBoolean(installerData.fixture_displays)) mappedInstaller.skills.push("Fixture Displays");
      if (toBoolean(installerData.outdoor)) mappedInstaller.skills.push("Outdoor");
      if (toBoolean(installerData.high_voltage_hardwired)) mappedInstaller.skills.push("High Voltage Hardwired");

      if (toBoolean(installerData.hunter_douglas)) mappedInstaller.brands.push("Hunter Douglas");
      if (toBoolean(installerData.Alta)) mappedInstaller.brands.push("Alta");
      if (toBoolean(installerData.carole)) mappedInstaller.brands.push("Carole");
      if (toBoolean(installerData.architectural)) mappedInstaller.brands.push("Architectural");
      if (toBoolean(installerData.levolor)) mappedInstaller.brands.push("Levolor");
      if (toBoolean(installerData.three_day_blinds)) mappedInstaller.brands.push("Three Day Blinds");

      const standardizeCertificationName = (cert: string | null | undefined): any | null => {
        if (!cert) return null;
        const normalizedCert = cert.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
        const validCertificationsMap: { [key: string]: any } = {
          "powerview pro": "Motorization Pro",
          "certified installer": "Certified Installer",
          "master installer": "Master Installer",
          "shutter pro": "Shutter Pro",
          "drapery pro": "Drapery Pro",
          "pip certified": "PIP Certified",
        };
        return validCertificationsMap[normalizedCert] || null;
      };

      const pvCert = standardizeCertificationName(installerData.Powerview_Certification);
      if (pvCert) mappedInstaller.certifications.push(pvCert);
      const shutterCert = standardizeCertificationName(installerData.Shutter_Certification_Level);
      if (shutterCert) mappedInstaller.certifications.push(shutterCert);
      const draperyCert = standardizeCertificationName(installerData.Draperies_Certification_Level);
      if (draperyCert) mappedInstaller.certifications.push(draperyCert);
      const pipCert = standardizeCertificationName(installerData.PIP_Certification_Level);
      if (pipCert) mappedInstaller.certifications.push(pipCert);

      setCurrentInstaller(mappedInstaller);

      const initialFormData: any = {};
      for (const key in installerData) {
        if (Object.prototype.hasOwnProperty.call(installerData, key)) {
          let value = installerData[key];
          const frontendKey = Object.keys(frontendKeyToDbColumnMap).find(k => frontendKeyToDbColumnMap[k] === key);

          if (frontendKey && (brandCheckboxes.some(b => b.key === frontendKey) || productSkillCheckboxes.some(p => p.key === frontendKey) || frontendKey === 'Shipment')) {
            initialFormData[frontendKey] = toBoolean(value);
          } else if (['Powerview_Certification', 'Shutter_Certification_Level', 'Draperies_Certification_Level', 'PIP_Certification_Level'].includes(key)) {
            initialFormData[key] = value ? String(value).split(', ').filter(Boolean) : [];
          } else {
            initialFormData[key] = value;
          }
        }
      }
      setFormData(initialFormData);
      setErrors({});
    };

    if (!sessionLoading && installerId) {
      loadInstallerData();
    } else if (!installerId) {
      setLoading(false);
    }
  }, [installerId, navigate, sessionLoading]);

  // Effect 2: Load territory data once the installer's core data is available
  useEffect(() => {
    const loadTerritoryData = async () => {
      if (installerId && currentInstaller) {
        // setLoading(true) is already set by the first effect
        await fetchAllInstallerZipAssignments(); // For map context of other installers
        await fetchInstallerZipCodes(installerId); // For this installer's selections
        setLoading(false); // All data is loaded, stop loading indicator
      }
    };

    loadTerritoryData();
  }, [currentInstaller, installerId, fetchAllInstallerZipAssignments, fetchInstallerZipCodes]);

  const memoizedCenterLocation = useMemo(() => {
    if (currentInstaller?.latitude != null && currentInstaller?.longitude != null) {
      return { lat: currentInstaller.latitude, lng: currentInstaller.longitude };
    }
    return null;
  }, [currentInstaller?.latitude, currentInstaller?.longitude]);

  const handleMapZipCodeClick = useCallback(async (zipCode: string, stateProvince: string) => {
    setSelectedMapZipCodes(prevSelected => {
      const existingEntryIndex = prevSelected.findIndex(item => item.zipCode === zipCode);
      let newSelected: Array<{ zipCode: string, assignedStatus: TerritoryStatus, stateProvince: string, centroid_latitude: number | null, centroid_longitude: number | null }>;

      const centroid = zipCodeCentroids.get(zipCode);
      const centroid_latitude = centroid?.lat || null;
      const centroid_longitude = centroid?.lng || null;

      if (existingEntryIndex !== -1) {
        const currentEntry = prevSelected[existingEntryIndex];
        if (currentEntry.assignedStatus === 'Approved') {
          newSelected = [
            ...prevSelected.slice(0, existingEntryIndex),
            { ...currentEntry, assignedStatus: 'Needs Approval' },
            ...prevSelected.slice(existingEntryIndex + 1)
          ];
        } else {
          newSelected = prevSelected.filter(item => item.zipCode !== zipCode);
        }
      } else {
        newSelected = [...prevSelected, { zipCode, assignedStatus: 'Approved', stateProvince, centroid_latitude, centroid_longitude }];
      }
      return newSelected;
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleCheckboxChange = (name: string, checked: boolean) => {
    setFormData((prev: any) => ({ ...prev, [name]: checked }));
  };

  const handleCertificationCheckboxChange = (dbColumn: string, value: string, checked: boolean) => {
    setFormData((prev: any) => {
      const currentCerts = Array.isArray(prev[dbColumn]) ? prev[dbColumn] : (prev[dbColumn] ? String(prev[dbColumn]).split(', ').filter(Boolean) : []);
      let newCerts;
      if (checked) {
        newCerts = [...new Set([...currentCerts, value])];
      } else {
        newCerts = currentCerts.filter((cert: string) => cert !== value);
      }
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

  const handleSubmit = async () => {
    if (!validateForm()) {
      toast.error("Please fill in all required fields.");
      return;
    }

    if (!currentInstaller?.id) {
      toast.error("Installer ID is missing. Cannot save changes.");
      return;
    }

    setLoading(true);
    const loadingToastId = toast.loading("Saving installer changes...");

    try {
      if (profile?.role !== 'admin') {
        console.error("User is not an admin. Current role:", profile?.role);
        toast.error("You do not have permission to modify territories. Only administrators can do this.", { id: loadingToastId });
        setLoading(false);
        return;
      }

      const formattedData: any = {};
      for (const key in formData) {
        if (Object.prototype.hasOwnProperty.call(formData, key)) {
          const value = formData[key];
          const dbColumnName = frontendKeyToDbColumnMap[key] || key;

          if (brandCheckboxes.some(b => b.key === key) || productSkillCheckboxes.some(p => p.key === key) || key === 'Shipment') {
            formattedData[dbColumnName] = fromBooleanToSupabase(key, value);
          } else if (['Powerview_Certification', 'Shutter_Certification_Level', 'Draperies_Certification_Level', 'PIP_Certification_Level'].includes(key)) {
            formattedData[dbColumnName] = Array.isArray(value) ? value.join(', ') : value;
          } else if (['Installer_Vendor_ID', 'Star_Rating'].includes(key) && typeof value === 'string' && value !== '') {
            formattedData[dbColumnName] = parseFloat(value);
          } else if (value === "") {
            formattedData[dbColumnName] = null;
          } else if (key === 'Sales_Org') {
            continue;
          }
          else {
            formattedData[dbColumnName] = value;
          }
        }
      }

      const addressFields = ["address1", "add2", "city", "state", "postalcode", "Country"];
      let addressChanged = false;
      const originalRawData = currentInstaller.rawSupabaseData || {};

      for (const field of addressFields) {
        const dbField = frontendKeyToDbColumnMap[field] || field;
        if (String(originalRawData[dbField] || '') !== String(formattedData[dbField] || '')) {
          addressChanged = true;
          break;
        }
      }

      if (addressChanged) {
        toast.info("Address changed, updating coordinates...", { id: loadingToastId });
        const fullAddress = `${formattedData.address1 || ''}, ${formattedData.city || ''}, ${formattedData.state || ''} ${formattedData.postalcode || ''}, ${formattedData.Country || ''}`.trim();
        const coords = await getCoordinates({ searchText: fullAddress });

        if (coords.lat != null && coords.lng != null) {
          formattedData.latitude = coords.lat;
          formattedData.longitude = coords.lng;
          toast.success("Coordinates updated successfully!", { id: loadingToastId });
        } else {
          formattedData.latitude = null;
          formattedData.longitude = null;
          toast.warning("Could not find coordinates for the new address. Latitude and longitude cleared.", { id: loadingToastId });
        }
      }

      const { error: updateInstallerError } = await supabase
        .from("installers")
        .update(formattedData)
        .eq("id", currentInstaller.id);

      if (updateInstallerError) {
        console.error("Error updating installer data:", updateInstallerError);
        throw new Error(`Supabase Update Error: ${updateInstallerError.message}`);
      }

      // --- TERRITORY MANAGEMENT LOGIC (REFACTORED) ---
      // A more robust approach: fetch existing data, delete all for this installer, then re-insert the new state.
      
      // 1. Fetch current assignments to preserve rep IDs
      const { data: currentAssignmentsData, error: fetchAssignmentsError } = await supabase
        .from('installer_zip_codes')
        .select('zip_code, field_ops_rep_id, field_service_manager_id')
        .eq('installer_id', currentInstaller.id);

      if (fetchAssignmentsError) {
        throw new Error(`Failed to fetch current assignments to preserve reps: ${fetchAssignmentsError.message}`);
      }
      const currentAssignmentsMap = new Map((currentAssignmentsData || []).map(item => [item.zip_code, item]));

      // 2. Delete all existing assignments for this installer
      const { error: deleteError } = await supabase
        .from('installer_zip_codes')
        .delete()
        .eq('installer_id', currentInstaller.id);

      if (deleteError) {
        throw new Error(`Failed to clear existing territories: ${deleteError.message}`);
      }

      // 3. Prepare new assignments to be inserted, preserving rep IDs if they existed before
      const zipsToInsert = selectedMapZipCodes.map(item => {
        const existingAssignment = currentAssignmentsMap.get(item.zipCode);
        return {
          installer_id: currentInstaller.id,
          zip_code: item.zipCode,
          state_province: item.stateProvince,
          status: item.assignedStatus,
          field_ops_rep_id: existingAssignment ? existingAssignment.field_ops_rep_id : null,
          field_service_manager_id: existingAssignment ? existingAssignment.field_service_manager_id : null,
        };
      });

      // 4. Insert the new assignments if there are any
      if (zipsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('installer_zip_codes')
          .insert(zipsToInsert);

        if (insertError) {
          throw new Error(`Failed to save new territories: ${insertError.message}`);
        }
      }

      toast.success("Installer and ZIP code associations updated successfully!", { id: loadingToastId });
      navigate("/installers");
    } catch (err: any) {
      console.error("Error saving installer and/or ZIP associations:", err);
      toast.error(`Failed to save changes: ${err.message || err.toString()}`, { id: loadingToastId });
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
        toast.info(`Bulk ${action === 'approve' ? 'approval' : 'needs approval'} mode activated. Click and drag on the map.`);
        return action;
      }
    });
  };

  const handleClearAllAssignedZips = () => {
    setSelectedMapZipCodes([]);
    toast.info("All assigned ZIP codes cleared from selection.");
  };

  const handleImportInstallerTerritories = async (file: File, mode: "overwrite" | "append") => {
    if (!installerId) {
      toast.error("Installer ID is missing. Cannot import territories.");
      return;
    }

    setLoading(true);
    const loadingToastId = toast.loading(`Importing territories from ${file.name} in ${mode} mode...`);
    let importedCount = 0;
    let skippedCount = 0;

    try {
      if (profile?.role !== 'admin') {
        console.error("User is not an admin. Current role:", profile?.role);
        toast.error("You do not have permission to import territories. Only administrators can do this.", { id: loadingToastId });
        setLoading(false);
        return;
      }

      const text = await file.text();
      const cleanedText = text.startsWith('\ufeff') ? text.substring(1) : text;

      const { data, errors: parseErrors, meta } = Papa.parse(cleanedText, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
      });

      if (parseErrors.length > 0) {
        console.error("CSV parsing errors:", parseErrors);
        toast.error(`CSV parsing errors found. First error: ${parseErrors[0].message}`, { id: loadingToastId });
        setLoading(false);
        return;
      }

      const expectedHeaders = ["ZipCode", "Status", "StateProvince"];
      const csvHeaders = meta.fields || [];
      const missingHeaders = expectedHeaders.filter(header => !csvHeaders.includes(header));

      if (missingHeaders.length > 0) {
        toast.error(`Missing required CSV headers: ${missingHeaders.join(', ')}. Expected: ${expectedHeaders.join(', ')}`, { id: loadingToastId, duration: 8000 });
        setLoading(false);
        return;
      }

      if (mode === "overwrite") {
        toast.info("Overwriting existing territories for this installer...", { id: loadingToastId });
        const { error: deleteError } = await supabase
          .from('installer_zip_codes')
          .delete()
          .eq('installer_id', installerId);
        if (deleteError) {
          throw new Error(`Failed to clear existing territories: ${deleteError.message}`);
        }
        toast.success("Existing territories cleared.", { id: loadingToastId });
      }

      const territoriesToUpsert: any[] = [];
      const validStatuses: TerritoryStatus[] = ["Approved", "Needs Approval"];

      for (const row of data) {
        const zipCode = row.ZipCode?.trim();
        const status = row.Status?.trim();
        const stateProvince = row.StateProvince?.trim();

        if (!zipCode || !status || !stateProvince) {
          console.warn("Skipping row due to missing required fields:", row);
          skippedCount++;
          continue;
        }

        if (!validStatuses.includes(status as TerritoryStatus)) {
          console.warn(`Skipping row for ZIP ${zipCode} due to invalid status: ${status}. Must be 'Approved' or 'Needs Approval'.`);
          skippedCount++;
          continue;
        }

        territoriesToUpsert.push({
          installer_id: installerId,
          zip_code: zipCode,
          status: status as TerritoryStatus,
          state_province: stateProvince,
        });
      }

      if (territoriesToUpsert.length === 0) {
        toast.info("No valid territories found in the CSV to import.", { id: loadingToastId });
        setLoading(false);
        setIsImportTerritoriesModalOpen(false);
        return;
      }

      const { error: upsertError } = await supabase
        .from('installer_zip_codes')
        .upsert(territoriesToUpsert, { onConflict: 'installer_id,zip_code' });

      if (upsertError) {
        throw new Error(`Failed to upsert territories: ${upsertError.message}`);
      }

      importedCount = territoriesToUpsert.length;
      toast.success(`Successfully imported ${importedCount} territories. ${skippedCount > 0 ? `${skippedCount} rows skipped.` : ''}`, { id: loadingToastId, duration: 5000 });
      
      await fetchAllInstallerZipAssignments();
      await fetchInstallerZipCodes(installerId);

    } catch (err: any) {
      console.error("Error during territory import:", err);
      toast.error(`Territory import failed: ${err.message || err.toString()}`, { id: loadingToastId, duration: 8000 });
    } finally {
      setLoading(false);
      setIsImportTerritoriesModalOpen(false);
    }
  };

  const handleExportInstallerTerritories = async () => {
    if (!installerId) {
      toast.error("Installer ID is missing. Cannot export territories.");
      return;
    }

    setLoading(true);
    const loadingToastId = toast.loading("Preparing territories for export...");

    try {
      const { data, error } = await supabase
        .from('installer_zip_codes')
        .select('zip_code, status, state_province')
        .eq('installer_id', installerId);

      if (error) {
        throw new Error(`Supabase Fetch Error: ${error.message}`);
      }

      if (!data || data.length === 0) {
        toast.info("No territories found for this installer to export.", { id: loadingToastId });
        return;
      }

      const dataToExport = data.map(item => ({
        ZipCode: item.zip_code,
        Status: item.status,
        StateProvince: item.state_province,
      }));

      const csv = Papa.unparse(dataToExport);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.setAttribute("download", `installer_${currentInstaller?.name.replace(/\s/g, '_') || 'unknown'}_territories.csv`);
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

  if (loading || sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        <p className="text-gray-500 ml-2">Loading installer data...</p>
      </div>
    );
  }

  if (!currentInstaller) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-gray-500">
        <p className="text-xl mb-4">Installer not found or an error occurred.</p>
        <Button onClick={() => navigate("/installers")}>Go back to Installers</Button>
      </div>
    );
  }

  const isAdmin = profile?.role === 'admin';

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="outline" size="sm" onClick={() => navigate("/installers")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold text-gray-700">
          Edit Installer: {currentInstaller.name}
        </h1>
      </div>

      <div className="grid gap-6 py-4">
        <h3 className="text-lg font-semibold col-span-full mt-4 mb-2">Contact & Address Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 col-span-full">
          {contactAddressFields.map((key) => {
            const value = formData[key];
            const isRequired = requiredFields.includes(key);
            return (
              <div key={key} className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor={key} className="text-right">
                  {columnDisplayNames[key] || key.replace(/_/g, ' ')}
                  {isRequired && <span className="text-red-500 ml-1">*</span>}:
                </Label>
                <Input
                  id={key}
                  name={key}
                  value={value !== null && value !== undefined ? value.toString() : ''}
                  onChange={handleInputChange}
                  className={`col-span-3 ${errors[key] ? 'border-red-500' : ''}`}
                  type="text"
                  disabled={!isAdmin}
                />
                {errors[key] && <p className="col-span-4 text-right text-red-500 text-sm">{errors[key]}</p>}
              </div>
            );
          })}
        </div>

        <h3 className="text-lg font-semibold col-span-full mt-4 mb-2">Brands & Skills</h3>
        
        <div className="col-span-full">
          <h4 className="font-medium text-base mb-2">Brands (Level 1)</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {brandCheckboxes
              .sort((a, b) => a.label.localeCompare(b.label))
              .map((item) => {
                const value = formData[item.key];
                return (
                  <div key={item.key} className="flex items-center space-x-2">
                    <Checkbox
                      id={item.key}
                      name={item.key}
                      checked={toBoolean(value)}
                      onCheckedChange={(checked) => handleCheckboxChange(item.key, checked as boolean)}
                      disabled={!isAdmin}
                    />
                    <Label htmlFor={item.key}>{item.label}</Label>
                  </div>
                );
              })}
          </div>
        </div>

        <div className="col-span-full mt-4">
          <h4 className="font-medium text-base mb-2">Product Skills (Level 2)</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {productSkillCheckboxes
              .sort((a, b) => a.label.localeCompare(b.label))
              .map((item) => {
                const value = formData[item.key];
                return (
                  <div key={item.key} className="flex items-center space-x-2">
                    <Checkbox
                      id={item.key}
                      name={item.key}
                      checked={toBoolean(value)}
                      onCheckedChange={(checked) => handleCheckboxChange(item.key, checked as boolean)}
                      disabled={!isAdmin}
                    />
                    <Label htmlFor={item.key}>{item.label}</Label>
                  </div>
                );
              })}
          </div>
        </div>

        <h3 className="text-lg font-semibold col-span-full mt-4 mb-2">Certifications</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 col-span-full">
          {certificationCheckboxes
            .sort((a, b) => a.label.localeCompare(b.label))
            .map((cert) => {
              const currentCerts = Array.isArray(formData[cert.dbColumn]) ? formData[cert.dbColumn] : (formData[cert.dbColumn] ? String(formData[cert.dbColumn]).split(', ').filter(Boolean) : []);
              const isChecked = currentCerts.includes(cert.value);
              return (
                <div key={cert.label} className="flex items-center space-x-2">
                  <Checkbox
                    id={cert.label}
                    name={cert.label}
                    checked={isChecked}
                    onCheckedChange={(checked) => handleCertificationCheckboxChange(cert.dbColumn, cert.value, checked as boolean)}
                    disabled={!isAdmin}
                  />
                  <Label htmlFor={cert.label}>{cert.label}</Label>
                </div>
              );
            })}
        </div>

        <h3 className="text-lg font-semibold col-span-full mt-4 mb-2">Other Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 col-span-full">
          {otherFields
            .sort((a, b) => columnDisplayNames[a]?.localeCompare(columnDisplayNames[b] || b) || a.localeCompare(b))
            .map((key) => {
              const value = formData[key];
              const isNumeric = ['Installer_Vendor_ID', 'Star_Rating'].includes(key);
              const isBoolean = ['Shipment'].includes(key);
              return (
                <div key={key} className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor={key} className="text-right">
                    {columnDisplayNames[key] || key.replace(/_/g, ' ')}:
                  </Label>
                  {isBoolean ? (
                    <Checkbox
                      id={key}
                      name={key}
                      checked={toBoolean(value)}
                      onCheckedChange={(checked) => handleCheckboxChange(key, checked as boolean)}
                      className="col-span-3"
                      disabled={!isAdmin}
                    />
                  ) : (
                    <Input
                      id={key}
                      name={key}
                      value={value !== null && value !== undefined ? value.toString() : ''}
                      onChange={handleInputChange}
                      className="col-span-3"
                      type={isNumeric ? 'number' : 'text'}
                      disabled={!isAdmin}
                    />
                  )}
                </div>
              );
            })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 col-span-full">
          {textAreaFields
            .sort((a, b) => columnDisplayNames[a]?.localeCompare(columnDisplayNames[b] || b) || a.localeCompare(b))
            .map((key) => {
              const value = formData[key];
              return (
                <div key={key} className="grid grid-cols-4 items-start gap-4">
                  <Label htmlFor={key} className="text-right pt-2">
                    {columnDisplayNames[key] || key.replace(/_/g, ' ')}:
                  </Label>
                  <Textarea
                    id={key}
                    name={key}
                    value={value !== null && value !== undefined ? value.toString() : ''}
                    onChange={handleInputChange}
                    className="col-span-3 min-h-[80px]"
                    disabled={!isAdmin}
                  />
                </div>
              );
            })}
        </div>

        {isAdmin ? (
          currentInstaller?.latitude != null && currentInstaller?.longitude != null ? (
            <div className="col-span-full mt-6">
              <h3 className="text-lg font-semibold mb-2">Assigned Territories</h3>
              <div className="flex flex-wrap justify-between gap-2 mb-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsImportTerritoriesModalOpen(true)}
                    disabled={loading}
                  >
                    <Upload className="h-4 w-4 mr-2" /> Import Territories
                  </Button>
                  <Button onClick={handleExportInstallerTerritories} disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-2" />} Export Territories
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className={cn(
                      bulkActionType === 'approve' ? "bg-green-600 text-white hover:bg-green-700" : "border-green-600 text-green-600 hover:bg-green-100"
                    )}
                    onClick={() => handleToggleBulkSelect('approve')}
                    disabled={loading}
                  >
                    <MousePointerClick className="mr-2 h-4 w-4" /> {bulkActionType === 'approve' ? "Exit Bulk Approve" : "Bulk Approve"}
                  </Button>
                  <Button
                    variant="outline"
                    className={cn(
                      bulkActionType === 'needs_approval' ? "bg-orange-600 text-white hover:bg-orange-700" : "border-orange-600 text-orange-600 hover:bg-orange-100"
                    )}
                    onClick={() => handleToggleBulkSelect('needs_approval')}
                    disabled={loading}
                  >
                    <MousePointerClick className="mr-2 h-4 w-4" /> {bulkActionType === 'needs_approval' ? "Exit Bulk Needs Approval" : "Bulk Needs Approval"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleClearAllAssignedZips}
                    disabled={loading || selectedMapZipCodes.length === 0}
                  >
                    <Eraser className="mr-2 h-4 w-4" /> Clear All Assigned
                  </Button>
                </div>
              </div>
              <div className="h-[800px] w-full rounded-lg overflow-hidden shadow-sm border">
                <TerritoryMap
                  country={installerCountry} // Pass the installer's country
                  isOpen={true}
                  centerLocation={memoizedCenterLocation}
                  onZipCodeClick={handleMapZipCodeClick}
                  selectedZipCodes={selectedMapZipCodes} // Pass selected zips for this installer
                  currentDisplayRadius={mapDisplayRadius}
                  showRadiusCircles={true}
                  existingTerritories={allInstallerZipAssignments} // All assignments for general context
                  highlightedZipCodes={highlightedZipCodes}
                  isBulkSelecting={bulkActionType !== null}
                  onBulkSelectionComplete={handleBulkSelectionComplete}
                />
              </div>
              <p className="text-sm text-gray-500 mt-2">Click on ZIP code areas to assign/unassign them to this installer. In bulk select mode, click and drag to select multiple ZIP codes.</p>
              
              <div className="mt-6 p-4 border rounded-lg shadow-sm bg-card">
                <h4 className="font-semibold text-lg mb-3">Filter Assigned ZIPs by Radius (from Installer)</h4>
                <RadioGroup
                  value={listDisplayRadius}
                  onValueChange={(value) => setListDisplayRadius(value)}
                  className="flex flex-wrap gap-4"
                >
                  {['0-25', '25-50', '50-75', '75-100', '100-125', '125-150'].map(range => (
                    <div key={range} className="flex items-center space-x-2">
                      <RadioGroupItem value={range} id={`list-radius-${range}`} />
                      <Label htmlFor={`list-radius-${range}`}>{range} miles</Label>
                    </div>
                  ))}
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="all" id="list-radius-all" />
                    <Label htmlFor="list-radius-all">All</Label>
                  </div>
                </RadioGroup>
              </div>

              <InstallerTerritoryList
                assignedZipCodes={selectedMapZipCodes}
                allTerritories={allInstallerZipAssignments}
                onZipCodeClick={handleMapZipCodeClick}
                mapClickStates={highlightedZipCodes}
                installerLocation={memoizedCenterLocation}
                listDisplayRadius={listDisplayRadius}
              />
            </div>
          ) : (
            <div className="col-span-full mt-6 text-center text-gray-500">
              <p>Map not available: Installer address does not have valid coordinates.</p>
              <p className="text-sm">Please ensure address fields are complete and valid to enable map functionality.</p>
            </div>
          )
        ) : (
          <div className="col-span-full mt-6 text-center text-red-500">
            <p>You do not have permission to manage territories.</p>
          </div>
        )}
      </div>
      {isAdmin && (
        <div className="flex justify-end gap-2 mt-8">
          <Button variant="outline" onClick={() => navigate("/installers")} disabled={loading}>
            <XCircle className="mr-2 h-4 w-4" /> Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save Changes
          </Button>
        </div>
      )}

      <ImportInstallerTerritoriesModal
        isOpen={isImportTerritoriesModalOpen}
        onClose={() => setIsImportTerritoriesModalOpen(false)}
        onImport={handleImportInstallerTerritories}
        loading={loading}
      />
    </div>
  );
};

export default EditInstallerPage;