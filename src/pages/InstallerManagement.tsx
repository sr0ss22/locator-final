import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlusCircle, Edit, Trash2, Download, Eye, Upload, Search, Loader2, ArrowUp, ArrowDown, ArrowLeft, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client"; // Updated import
import { Installer, InstallerCertification, InstallerBrand, InstallerSkill } from "@/types/installer"; // Import new types
import { toast } from "sonner";
import Papa from "papaparse";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ImportInstallersModal from "@/components/ImportInstallersModal";
// import EditInstallerModal from "@/components/EditInstallerModal"; // REMOVED
import AddInstallerModal from "@/components/AddInstallerModal";
import DeleteConfirmationModal from "@/components/DeleteConfirmationModal";
import { run as getCoordinates } from "@/functions/getCoordinates";
import { Input } from "@/components/ui/input";
import { useCountrySettings } from "@/hooks/useCountrySettings";
import { useNavigate } from "react-router-dom";
import InstallerFilterModal from "@/components/InstallerFilterModal";

// Define the columns for the table, including their display name and data key
interface TableColumn {
  key: keyof Installer | 'actions' | 'city' | 'state' | 'blindsAndShades' | 'pipCertification' | 'motorization' | 'motorizationCertification' | 'draperies' | 'draperiesCertification' | 'shutters' | 'shutterCertificationLevel' | 'alta' | 'altaMotorization' | 'hunterDouglas' | 'carole' | 'architectural' | 'levolor' | 'threeDayBlinds' | 'tallWindow' | 'fixtureDisplays' | 'outdoor' | 'highVoltageHardwired';
  header: string;
  accessor?: (installer: Installer) => React.ReactNode; // Optional accessor for custom rendering
  exportKey?: string; // Key for CSV export if different from 'key'
  dbColumn?: string; // New: Database column name for sorting
}

// Helper to convert Supabase boolean-like values to actual booleans
const toBoolean = (value: any): boolean => {
  if (typeof value === 'string') {
    return value.toLowerCase() === '1' || value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';
  }
  return value === 1 || value === true;
};

// Define columns outside to avoid re-creation on every render, but use a function to allow dynamic header
const getColumns = (postalCodeLabel: string): TableColumn[] => [
  { key: "actions", header: "Actions" },
  { key: "name", header: "Name", dbColumn: "name" },
  { key: "email", header: "Email", accessor: (installer) => installer.email || '-', dbColumn: "email" },
  { key: "phone", header: "Phone", dbColumn: "primary_phone" },
  { key: "address", header: "Address" },
  { key: "city", header: "City", accessor: (installer) => installer.rawSupabaseData?.city || '-', dbColumn: "city" },
  { key: "state", header: "State", accessor: (installer) => installer.rawSupabaseData?.state || '-', dbColumn: "state" },
  { key: "zipCode", header: postalCodeLabel, dbColumn: "postalcode" }, // Dynamic header
  // Brands
  { 
    key: "hunterDouglas", 
    header: "Hunter Douglas", 
    accessor: (installer) => toBoolean(installer.Hunter_Douglas_Raw) ? "Yes" : "No",
    exportKey: "Hunter_Douglas",
    dbColumn: "hunter_douglas" // Corrected DB column name
  },
  { 
    key: "alta", 
    header: "Alta", 
    accessor: (installer) => toBoolean(installer.Alta_Raw) ? "Yes" : "No",
    exportKey: "Alta",
    dbColumn: "Alta"
  },
  { 
    key: "carole", 
    header: "Carole", 
    accessor: (installer) => toBoolean(installer.Carole_Raw) ? "Yes" : "No",
    exportKey: "Carole",
    dbColumn: "carole" // Corrected DB column name
  },
  { 
    key: "architectural", 
    header: "Architectural", 
    accessor: (installer) => toBoolean(installer.Architectural_Raw) ? "Yes" : "No",
    exportKey: "Architectural",
    dbColumn: "architectural" // Corrected DB column name
  },
  { 
    key: "levolor", 
    header: "Levolor", 
    accessor: (installer) => toBoolean(installer.Levolor_Raw) ? "Yes" : "No",
    exportKey: "Levolor",
    dbColumn: "levolor" // Corrected DB column name
  },
  { 
    key: "threeDayBlinds", 
    header: "Three Day Blinds", 
    accessor: (installer) => toBoolean(installer.Three_Day_Blinds_Raw) ? "Yes" : "No",
    exportKey: "Three_Day_Blinds",
    dbColumn: "three_day_blinds" // Corrected DB column name
  },
  // Product Skills
  { 
    key: "blindsAndShades", 
    header: "Blinds & Shades", 
    accessor: (installer) => toBoolean(installer.Blinds_and_Shades_Raw) ? "Yes" : "No",
    exportKey: "Blinds_and_Shades",
    dbColumn: "Blinds_and_Shades"
  },
  { 
    key: "shutters", 
    header: "Shutters", 
    accessor: (installer) => toBoolean(installer.Shutters_Raw) ? "Yes" : "No",
    exportKey: "Shutters",
    dbColumn: "Shutters"
  },
  { 
    key: "draperies", 
    header: "Draperies", 
    accessor: (installer) => toBoolean(installer.Draperies_Raw) ? "Yes" : "No",
    exportKey: "Draperies",
    dbColumn: "Draperies"
  },
  { 
    key: "motorization", // Renamed key
    header: "Motorization", // Renamed header
    accessor: (installer) => toBoolean(installer.PowerView_Raw) ? "Yes" : "No", // Accesses PowerView_Raw
    exportKey: "PowerView", // Still exports as PowerView
    dbColumn: "PowerView"
  },
  { 
    key: "altaMotorization", 
    header: "Alta Motorization", 
    accessor: (installer) => toBoolean(installer.alta_motorization_Raw) ? "Yes" : "No",
    exportKey: "alta_motorization",
    dbColumn: "alta_motorization"
  },
  { 
    key: "tallWindow", 
    header: "Tall Window", 
    accessor: (installer) => toBoolean(installer.Tall_Window_Raw) ? "Yes" : "No",
    exportKey: "Tall_Window",
    dbColumn: "tall_window" // Corrected DB column name
  },
  { 
    key: "fixtureDisplays", 
    header: "Fixture Displays", 
    accessor: (installer) => toBoolean(installer.Fixture_Displays_Raw) ? "Yes" : "No",
    exportKey: "Fixture_Displays",
    dbColumn: "fixture_displays" // Corrected DB column name
  },
  { 
    key: "outdoor", 
    header: "Outdoor", 
    accessor: (installer) => toBoolean(installer.Outdoor_Raw) ? "Yes" : "No",
    exportKey: "Outdoor",
    dbColumn: "outdoor" // Corrected DB column name
  },
  { 
    key: "highVoltageHardwired", 
    header: "High Voltage Hardwired", 
    accessor: (installer) => toBoolean(installer.High_Voltage_Hardwired_Raw) ? "Yes" : "No",
    exportKey: "High_Voltage_Hardwired",
    dbColumn: "high_voltage_hardwired" // Corrected DB column name
  },
  { 
    key: "pipCertification", 
    header: "PIP Certification", 
    accessor: (installer) => installer.PIP_Certification_Level_Raw || '-',
    exportKey: "PIP_Certification_Level",
    dbColumn: "PIP_Certification_Level"
  },
  { 
    key: "motorizationCertification", // Renamed key
    header: "Motorization Certification", // Renamed header
    accessor: (installer) => installer.Powerview_Certification_Raw || '-', // Accesses Powerview_Certification_Raw
    exportKey: "Powerview_Certification", // Still exports as Powerview_Certification
    dbColumn: "Powerview_Certification"
  },
  { 
    key: "draperiesCertification", 
    header: "Draperies Certification", 
    accessor: (installer) => installer.Draperies_Certification_Level_Raw || '-',
    exportKey: "Draperies_Certification_Level",
    dbColumn: "Draperies_Certification_Level"
  },
  { 
    key: "shutterCertificationLevel", 
    header: "Shutter Certification Level", 
    accessor: (installer) => installer.Shutter_Certification_Level_Raw || '-',
    exportKey: "Shutter_Certification_Level",
    dbColumn: "Shutter_Certification_Level"
  },
  { key: "installerVendorId", header: "Vendor ID", dbColumn: "Installer_Vendor_ID" },
  { 
    key: "acceptsShipments", 
    header: "Accepts Shipments", 
    accessor: (installer) => (installer.acceptsShipments ? "Yes" : "No"),
    exportKey: "Shipment",
    dbColumn: "Shipment"
  },
  { key: "latitude", header: "Latitude", dbColumn: "latitude" },
  { key: "longitude", header: "Longitude", dbColumn: "longitude" },
];

const defaultVisibleColumnKeys = new Set([
  "actions",
  "name", "email", "phone", "address", "city", "state", "zipCode",
  "hunterDouglas", "alta", "carole", "architectural", "levolor", "threeDayBlinds",
  "blindsAndShades", "shutters", "draperies", "motorization", "altaMotorization", "tallWindow", "fixtureDisplays", "outdoor", "highVoltageHardwired",
  "pipCertification", "motorizationCertification", "draperiesCertification", "shutterCertificationLevel",
]);

// Define expected CSV headers and their corresponding database column names
// This mapping helps in validating and transforming CSV data
const csvHeaderToDbColumnMap: { [key: string]: string } = {
  "Name": "name",
  "Address1": "address1",
  "Add2": "add2",
  "City": "city",
  "State": "state",
  "Postalcode": "postalcode",
  "Primary_Phone": "primary_phone",
  "Secondary_Phone": "secondary_phone",
  "Country": "Country",
  // Brands
  "Hunter_Douglas": "hunter_douglas", // Corrected DB column name
  "Alta": "Alta",
  "Carole": "carole", // Corrected DB column name
  "Architectural": "architectural", // Corrected DB column name
  "Levolor": "levolor", // Corrected DB column name
  "Three_Day_Blinds": "three_day_blinds", // Corrected DB column name
  // Product Skills
  "Blinds_and_Shades": "Blinds_and_Shades", // Expects 'Yes'/'No' or 1/0
  "PowerView": "PowerView", // Expects 'Yes'/'No' or 1/0 (DB column name remains PowerView)
  "Service_Call": "Service_Call", // Expects 'Yes'/'No' or 1/0
  "Shutters": "Shutters", // Expects 'Yes'/'No' or 1/0
  "Draperies": "Draperies", // Expects 'Yes'/'No' or 1/0
  "Alta_Motorization": "alta_motorization", // Expects 'Yes'/'No' or 1/0
  "Tall_Window": "tall_window", // Corrected DB column name
  "Fixture_Displays": "fixture_displays", // Corrected DB column name
  "Outdoor": "outdoor", // Corrected DB column name
  "High_Voltage_Hardwired": "high_voltage_hardwired", // Corrected DB column name
  // Other
  "Shipment": "Shipment", // Expects 'Yes'/'No'
  "Email": "email",
  "Specialnote": "specialnote",
  "Comments": "comments",
  "Installer_Vendor_ID": "Installer_Vendor_ID",
  "PIP_Certification_Level": "PIP_Certification_Level",
  "Shutter_Certification_Level": "Shutter_Certification_Level",
  "Powerview_Certification": "Powerview_Certification", // DB column name remains Powerview_Certification
  "Draperies_Certification_Level": "Draperies_Certification_Level",
  "Sales_Org": "Sales_Org",
  "Star_Rating": "Star_Rating",
};

const InstallerManagement: React.FC = () => {
  const [installers, setInstallers] = useState<Installer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => new Set<string>(defaultVisibleColumnKeys));
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalInstallers, setTotalInstallers] = useState(0);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  // const [isEditModalOpen, setIsEditModalOpen] = useState(false); // REMOVED
  // const [currentInstallerToEdit, setCurrentInstallerToEdit] = useState<Installer | null>(null); // REMOVED
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [sortColumn, setSortColumn] = useState<string | null>("name"); // Default sort by name
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc"); // Default sort ascending

  // State for delete confirmation modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [installerToDelete, setInstallerToDelete] = useState<{ id: string; name: string } | null>(null);

  // States for filter modal
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [filterBrands, setFilterBrands] = useState<InstallerBrand[]>([]); // New filter state
  const [filterProductSkills, setFilterProductSkills] = useState<InstallerSkill[]>([]); // New filter state
  const [filterCertifications, setFilterCertifications] = useState<InstallerCertification[]>([]);
  const [filterStates, setFilterStates] = useState<string[]>([]);
  const [filterAcceptsShipments, setFilterAcceptsShipments] = useState<'any' | 'yes' | 'no'>('any');
  const [allStatesProvinces, setAllStatesProvinces] = useState<string[]>([]);

  const { postalCodeLabel } = useCountrySettings();
  const navigate = useNavigate();

  // Memoize columns to prevent re-creation on every render
  const columns = useMemo(() => getColumns(postalCodeLabel), [postalCodeLabel]);

  const totalPages = Math.ceil(totalInstallers / itemsPerPage);

  // Helper function to standardize certification names
  const standardizeCertificationName = (cert: string | null | undefined): InstallerCertification | null => {
    if (!cert) return null;
    const normalizedCert = cert
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    const validCertificationsMap: { [key: string]: InstallerCertification } = {
      "motorization pro": "Motorization Pro", // Renamed here
      "certified installer": "Certified Installer",
      "master installer": "Master Installer",
      "master shutter": "Shutter Pro", // Mapped to new type
      "drapery pro": "Drapery Pro",
      "pip certified": "PIP Certified",
    };
    return validCertificationsMap[normalizedCert] || null;
  };

  const fetchInstallers = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage - 1;

    let query = supabase.from('installers').select('*', { count: 'exact' });

    console.log("Applying filters:", {
      searchTerm,
      filterBrands, // New filter
      filterProductSkills, // New filter
      filterCertifications,
      filterStates,
      filterAcceptsShipments,
      sortColumn,
      sortDirection,
      currentPage,
      itemsPerPage
    });

    // Apply search term filter
    if (searchTerm) {
      const searchPattern = `%${searchTerm}%`;
      query = query.or(
        `name.ilike.${searchPattern},` +
        `primary_phone.ilike.${searchPattern},` +
        `email.ilike.${searchPattern},` +
        `city.ilike.${searchPattern},` +
        `state.ilike.${searchPattern},` +
        `postalcode.ilike.${searchPattern}`
      );
    }

    // Apply brand filters (AND logic for multiple selected brands)
    if (filterBrands.length > 0) {
      filterBrands.forEach(brand => {
        if (brand === "Hunter Douglas") query = query.filter("hunter_douglas", "eq", 1); // Corrected DB column name
        else if (brand === "Alta") query = query.filter("Alta", "eq", 1);
        else if (brand === "Carole") query = query.filter("carole", "eq", 1); // Corrected DB column name
        else if (brand === "Architectural") query = query.filter("architectural", "eq", 1); // Corrected DB column name
        else if (brand === "Levolor") query = query.filter("levolor", "eq", 1); // Corrected DB column name
        else if (brand === "Three Day Blinds") query = query.filter("three_day_blinds", "eq", 1); // Corrected DB column name
      });
    }

    // Apply product skill filters (AND logic for multiple selected product skills)
    if (filterProductSkills.length > 0) {
      filterProductSkills.forEach(skill => {
        if (skill === "Blinds & Shades") query = query.filter("Blinds_and_Shades", "eq", 1);
        else if (skill === "Motorization") query = query.filter("PowerView", "eq", '1'); // DB column is PowerView
        else if (skill === "Service Call") query = query.filter("Service_Call", "eq", 1);
        else if (skill === "Shutters") query = query.filter("Shutters", "eq", 1);
        else if (skill === "Drapery") query = query.filter("Draperies", "eq", 1);
        // Removed Alta Motorization: else if (skill === "Alta Motorization") query = query.filter("alta_motorization", "eq", 1);
        else if (skill === "Tall Window") query = query.filter("tall_window", "eq", 1); // Corrected DB column name
        else if (skill === "Fixture Displays") query = query.filter("fixture_displays", "eq", 1); // Corrected DB column name
        else if (skill === "Outdoor") query = query.filter("outdoor", "eq", 1); // Corrected DB column name
        else if (skill === "High Voltage Hardwired") query = query.filter("high_voltage_hardwired", "eq", 1); // Corrected DB column name
      });
    }

    // Apply certification filters (AND logic for multiple selected certifications)
    if (filterCertifications.length > 0) {
      filterCertifications.forEach(cert => {
        const searchPattern = `%${cert}%`;
        if (cert === "Motorization Pro") query = query.filter("Powerview_Certification", "ilike", searchPattern); // DB column is Powerview_Certification
        else if (cert === "Shutter Pro") query = query.filter("Shutter_Certification_Level", "ilike", searchPattern);
        else if (cert === "Master Installer" || cert === "Certified Installer" || cert === "PIP Certified") query = query.filter("PIP_Certification_Level", "ilike", searchPattern);
        else if (cert === "Drapery Pro") query = query.filter("Draperies_Certification_Level", "ilike", searchPattern);
      });
    }

    // Apply state filters (OR logic within states, AND logic with other filters)
    if (filterStates.length > 0) {
      // Construct an OR condition for multiple states
      const stateConditions = filterStates.map(state => `state.eq.${state}`);
      query = query.or(stateConditions.join(','));
    }

    // Apply 'Accepts Shipments' filter
    if (filterAcceptsShipments === 'yes') {
      query = query.filter("Shipment", "eq", "Yes");
    } else if (filterAcceptsShipments === 'no') {
      query = query.filter("Shipment", "eq", "No");
    }

    // Apply sorting
    if (sortColumn) {
      const columnDef = columns.find(col => col.key === sortColumn);
      const dbColumnName = columnDef?.dbColumn;
      if (dbColumnName && dbColumnName !== 'actions' && dbColumnName !== 'address') { // Exclude non-sortable columns
        query = query.order(dbColumnName, { ascending: sortDirection === "asc" });
      }
    }

    const { data, error, count } = await query.range(startIndex, endIndex);

    if (error) {
      console.error("Error fetching installers from Supabase:", error);
      setError(`Failed to load installers. Details: ${error.message}. Please try again.`);
      setInstallers([]);
      toast.error(`Failed to load installers: ${error.message}`);
    } else {
      const mappedInstallers: Installer[] = (data || []).map((rawInstaller: any) => {
        const skills: InstallerSkill[] = [];
        if (toBoolean(rawInstaller.Blinds_and_Shades)) skills.push("Blinds & Shades");
        if (toBoolean(rawInstaller.PowerView)) skills.push("Motorization"); // Mapped from PowerView_Raw
        if (toBoolean(rawInstaller.Shutters)) skills.push("Shutters");
        if (toBoolean(rawInstaller.Draperies)) skills.push("Drapery");
        if (toBoolean(rawInstaller.Service_Call)) skills.push("Service Call");
        // Removed Alta Motorization: if (toBoolean(rawInstaller.alta_motorization)) skills.push("Alta Motorization");
        if (toBoolean(rawInstaller.tall_window)) skills.push("Tall Window"); // Use DB column name
        if (toBoolean(rawInstaller.fixture_displays)) skills.push("Fixture Displays"); // Use DB column name
        if (toBoolean(rawInstaller.outdoor)) skills.push("Outdoor"); // Use DB column name
        if (toBoolean(rawInstaller.high_voltage_hardwired)) skills.push("High Voltage Hardwired"); // Use DB column name

        const brands: InstallerBrand[] = [];
        if (toBoolean(rawInstaller.hunter_douglas)) brands.push("Hunter Douglas"); // Use DB column name
        if (toBoolean(rawInstaller.Alta)) brands.push("Alta");
        if (toBoolean(rawInstaller.carole)) brands.push("Carole"); // Use DB column name
        if (toBoolean(rawInstaller.architectural)) brands.push("Architectural"); // Use DB column name
        if (toBoolean(rawInstaller.levolor)) brands.push("Levolor"); // Use DB column name
        if (toBoolean(rawInstaller.three_day_blinds)) brands.push("Three Day Blinds"); // Use DB column name

        const certifications: InstallerCertification[] = [];
        const pvCert = standardizeCertificationName(rawInstaller.Powerview_Certification);
        if (pvCert) certifications.push(pvCert);
        
        const shutterCert = standardizeCertificationName(rawInstaller.Shutter_Certification_Level);
        if (shutterCert) certifications.push(shutterCert);

        const draperyCert = standardizeCertificationName(rawInstaller.Draperies_Certification_Level);
        if (draperyCert) certifications.push(draperyCert);

        const pipCert = standardizeCertificationName(rawInstaller.PIP_Certification_Level);
        if (pipCert) certifications.push(pipCert);

        return {
          id: rawInstaller.id,
          name: rawInstaller.name || rawInstaller.H,
          address: `${rawInstaller.address1 || ''} ${rawInstaller.add2 || ''}, ${rawInstaller.city || ''}, ${rawInstaller.state || ''} ${rawInstaller.postalcode || ''}`.trim(),
          zipCode: rawInstaller.postalcode,
          phone: rawInstaller.primary_phone,
          email: rawInstaller.email,
          skills: skills,
          brands: brands, // New
          certifications: certifications,
          latitude: rawInstaller.latitude,
          longitude: rawInstaller.longitude,
          installerVendorId: rawInstaller.Installer_Vendor_ID?.toString(),
          acceptsShipments: rawInstaller.Shipment === 'Yes',
          Blinds_and_Shades_Raw: rawInstaller.Blinds_and_Shades,
          PIP_Certification_Level_Raw: rawInstaller.PIP_Certification_Level,
          PowerView_Raw: rawInstaller.PowerView,
          Powerview_Certification_Raw: rawInstaller.Powerview_Certification,
          Draperies_Raw: rawInstaller.Draperies,
          Draperies_Certification_Level_Raw: rawInstaller.Draperies_Certification_Level,
          Shutters_Raw: rawInstaller.Shutters,
          Shutter_Certification_Level_Raw: rawInstaller.Shutter_Certification_Level,
          Alta_Raw: rawInstaller.Alta,
          alta_motorization_Raw: rawInstaller.alta_motorization,
          Hunter_Douglas_Raw: rawInstaller.hunter_douglas, // Corrected DB column name
          Carole_Raw: rawInstaller.carole, // Corrected DB column name
          Architectural_Raw: rawInstaller.architectural, // Corrected DB column name
          Levolor_Raw: rawInstaller.levolor, // Corrected DB column name
          Three_Day_Blinds_Raw: rawInstaller.three_day_blinds, // Corrected DB column name
          Tall_Window_Raw: rawInstaller.tall_window, // Corrected DB column name
          Fixture_Displays_Raw: rawInstaller.fixture_displays, // Corrected DB column name
          Outdoor_Raw: rawInstaller.outdoor, // Corrected DB column name
          High_Voltage_Hardwired_Raw: rawInstaller.high_voltage_hardwired, // Corrected DB column name
          rawSupabaseData: rawInstaller,
        };
      });
      setInstallers(mappedInstallers);
      setTotalInstallers(count || 0);

      // Extract unique states/provinces for the MultiSelect in filter modal
      const uniqueStates = new Set<string>();
      (data || []).forEach((rawInstaller: any) => {
          if (rawInstaller.state) {
              uniqueStates.add(rawInstaller.state);
          }
      });
      setAllStatesProvinces(Array.from(uniqueStates).sort());
    }
    setLoading(false);
  }, [currentPage, itemsPerPage, searchTerm, sortColumn, sortDirection, columns, filterBrands, filterProductSkills, filterCertifications, filterStates, filterAcceptsShipments]);

  useEffect(() => {
    fetchInstallers();
  }, [fetchInstallers]);

  const handleAddInstaller = () => {
    setIsAddModalOpen(true);
  };

  const handleSaveNewInstaller = async (newInstallerData: any) => {
    setLoading(true);
    const loadingToastId = toast.loading("Adding new installer...");

    try {
      const { data: insertedData, error: insertError } = await supabase
        .from("installers")
        .insert([newInstallerData])
        .select();

      if (insertError) {
        throw new Error(`Supabase Insert Error: ${insertError.message}`);
      }

      const newInstallerId = insertedData?.[0]?.id;
      if (!newInstallerId) {
        throw new Error("Failed to retrieve new installer ID after insertion.");
      }

      toast.success("Installer added successfully! Fetching coordinates...", { id: loadingToastId });

      const fullAddress = `${newInstallerData.address1 || ''}, ${newInstallerData.city || ''}, ${newInstallerData.state || ''} ${newInstallerData.postalcode || ''}, ${newInstallerData.Country || ''}`.trim();
      const coords = await getCoordinates({ searchText: fullAddress });

      if (coords.lat !== null && coords.lng !== null) {
        const { error: updateError } = await supabase
          .from("installers")
          .update({ latitude: coords.lat, longitude: coords.lng })
          .eq("id", newInstallerId);

        if (updateError) {
          throw new Error(`Supabase Update Error (coordinates): ${updateError.message}`);
        }
        toast.success("Installer added and coordinates updated successfully!", { id: loadingToastId });
      } else {
        toast.warning("Installer added, but could not find coordinates for the address. Please check the address.", { id: loadingToastId });
      }

      setIsAddModalOpen(false);
      fetchInstallers();
    } catch (err: any) {
      console.error("Error adding new installer:", err);
      toast.error(`Failed to add installer: ${err.message}`, { id: loadingToastId });
    } finally {
      setLoading(false);
    }
  };

  const handleEditInstallerClick = (installer: Installer) => {
    // Navigate to the new dedicated edit page
    navigate(`/installers/edit/${installer.id}`);
  };

  // REMOVED handleSaveEditedInstaller as it's now handled by EditInstallerPage
  // const handleSaveEditedInstaller = async (updatedData: any) => { ... };

  // Function to open the delete confirmation modal
  const confirmDeleteInstaller = (id: string, name: string) => {
    setInstallerToDelete({ id, name });
    setIsDeleteModalOpen(true);
  };

  // Actual delete logic, called after confirmation
  const handleDeleteConfirmed = async () => {
    if (!installerToDelete) return;

    setLoading(true);
    const loadingToastId = toast.loading(`Deleting installer '${installerToDelete.name}'...`);
    const { error } = await supabase
      .from('installers')
      .delete()
      .eq('id', installerToDelete.id);

    if (error) {
      console.error("Error deleting installer:", error);
      toast.error("Failed to delete installer.", { id: loadingToastId });
    } else {
      fetchInstallers(); 
      toast.success("Installer deleted successfully!", { id: loadingToastId });
    }
    setIsDeleteModalOpen(false);
    setInstallerToDelete(null);
    setLoading(false);
  };

  const handleExportInstallers = async () => {
    setLoading(true);
    const loadingToastId = toast.loading("Preparing export data...");

    try {
      let query = supabase.from('installers').select('*'); // Fetch all data, then filter/map client-side

      // Apply search term filter (same logic as fetchInstallers)
      if (searchTerm) {
        const searchPattern = `%${searchTerm}%`;
        query = query.or(
          `name.ilike.${searchPattern},` +
          `primary_phone.ilike.${searchPattern},` +
          `email.ilike.${searchPattern},` +
          `city.ilike.${searchPattern},` +
          `state.ilike.${searchPattern},` +
          `postalcode.ilike.${searchPattern}`
        );
      }

      // Apply brand filters (AND logic for multiple selected brands)
      if (filterBrands.length > 0) {
        filterBrands.forEach(brand => {
          if (brand === "Hunter Douglas") query = query.filter("hunter_douglas", "eq", 1); // Corrected DB column name
          else if (brand === "Alta") query = query.filter("Alta", "eq", 1);
          else if (brand === "Carole") query = query.filter("carole", "eq", 1); // Corrected DB column name
          else if (brand === "Architectural") query = query.filter("architectural", "eq", 1); // Corrected DB column name
          else if (brand === "Levolor") query = query.filter("levolor", "eq", 1); // Corrected DB column name
          else if (brand === "Three Day Blinds") query = query.filter("three_day_blinds", "eq", 1); // Corrected DB column name
        });
      }

      // Apply product skill filters (AND logic for multiple selected product skills)
      if (filterProductSkills.length > 0) {
        filterProductSkills.forEach(skill => {
          if (skill === "Blinds & Shades") query = query.filter("Blinds_and_Shades", "eq", 1);
          else if (skill === "Motorization") query = query.filter("PowerView", "eq", '1'); // DB column is PowerView
          else if (skill === "Service Call") query = query.filter("Service_Call", "eq", 1);
          else if (skill === "Shutters") query = query.filter("Shutters", "eq", 1);
          else if (skill === "Drapery") query = query.filter("Draperies", "eq", 1);
          // Removed Alta Motorization: else if (skill === "Alta Motorization") query = query.filter("alta_motorization", "eq", 1);
          else if (skill === "Tall Window") query = query.filter("tall_window", "eq", 1); // Corrected DB column name
          else if (skill === "Fixture Displays") query = query.filter("fixture_displays", "eq", 1); // Corrected DB column name
          else if (skill === "Outdoor") query = query.filter("outdoor", "eq", 1); // Corrected DB column name
          else if (skill === "High Voltage Hardwired") query = query.filter("high_voltage_hardwired", "eq", 1); // Corrected DB column name
        });
      }

      // Apply certification filters (AND logic for multiple selected certifications)
      if (filterCertifications.length > 0) {
        filterCertifications.forEach(cert => {
          const searchPattern = `%${cert}%`;
          if (cert === "Motorization Pro") query = query.filter("Powerview_Certification", "ilike", searchPattern); // DB column is Powerview_Certification
          else if (cert === "Shutter Pro") query = query.filter("Shutter_Certification_Level", "ilike", searchPattern);
          else if (cert === "Master Installer" || cert === "Certified Installer" || cert === "PIP Certified") query = query.filter("PIP_Certification_Level", "ilike", searchPattern);
          else if (cert === "Drapery Pro") query = query.filter("Draperies_Certification_Level", "ilike", searchPattern);
      });
      }

      // Apply state filters (OR logic within states, AND logic with other filters)
      if (filterStates.length > 0) {
        const stateConditions = filterStates.map(state => `state.eq.${state}`);
        query = query.or(stateConditions.join(','));
      }

      // Apply 'Accepts Shipments' filter for export
      if (filterAcceptsShipments === 'yes') {
        query = query.filter("Shipment", "eq", "Yes");
      } else if (filterAcceptsShipments === 'no') {
        query = query.filter("Shipment", "eq", "No");
      }

      const { data, error } = await query; // Fetch all filtered data

      if (error) {
        throw new Error(`Supabase Fetch Error: ${error.message}`);
      }

      if (!data || data.length === 0) {
        toast.info("No installers found matching current filters to export.", { id: loadingToastId });
        return;
      }

      const dataToExport = data.map((rawInstaller: any) => {
        const row: { [key: string]: any } = {};
        columns.filter(col => visibleColumns.has(col.key) && col.key !== 'actions').forEach(column => {
          let value;
          if (column.key === 'address') {
            // Combine address fields for the 'Address' column
            value = `${rawInstaller.address1 || ''} ${rawInstaller.add2 || ''}, ${rawInstaller.city || ''}, ${rawInstaller.state || ''} ${rawInstaller.postalcode || ''}`.trim();
          } else if (column.accessor) {
            // Create a temporary Installer object to use the accessor for formatted values
            const tempInstaller: Installer = {
                id: rawInstaller.id,
                name: rawInstaller.name,
                address: `${rawInstaller.address1 || ''} ${rawInstaller.add2 || ''}, ${rawInstaller.city || ''}, ${rawInstaller.state || ''} ${rawInstaller.postalcode || ''}`.trim(),
                zipCode: rawInstaller.postalcode,
                phone: rawInstaller.primary_phone,
                email: rawInstaller.email,
                skills: [], // Not directly exported as a single column, but needed for some accessors
                brands: [], // Not directly exported as a single column, but needed for some accessors
                certifications: [], // Not directly exported as a single column, but needed for some accessors
                latitude: rawInstaller.latitude,
                longitude: rawInstaller.longitude,
                installerVendorId: rawInstaller.Installer_Vendor_ID?.toString(),
                acceptsShipments: rawInstaller.Shipment === 'Yes',
                Blinds_and_Shades_Raw: rawInstaller.Blinds_and_Shades,
                PIP_Certification_Level_Raw: rawInstaller.PIP_Certification_Level,
                PowerView_Raw: rawInstaller.PowerView,
                Powerview_Certification_Raw: rawInstaller.Powerview_Certification,
                Draperies_Raw: rawInstaller.Draperies,
                Draperies_Certification_Level_Raw: rawInstaller.Draperies_Certification_Level,
                Shutters_Raw: rawInstaller.Shutters,
                Shutter_Certification_Level_Raw: rawInstaller.Shutter_Certification_Level,
                Alta_Raw: rawInstaller.Alta,
                alta_motorization_Raw: rawInstaller.alta_motorization,
                Hunter_Douglas_Raw: rawInstaller.hunter_douglas, // Corrected DB column name
                Carole_Raw: rawInstaller.carole, // Corrected DB column name
                Architectural_Raw: rawInstaller.architectural, // Corrected DB column name
                Levolor_Raw: rawInstaller.levolor, // Corrected DB column name
                Three_Day_Blinds_Raw: rawInstaller.three_day_blinds, // Corrected DB column name
                Tall_Window_Raw: rawInstaller.tall_window, // Corrected DB column name
                Fixture_Displays_Raw: rawInstaller.fixture_displays, // Corrected DB column name
                Outdoor_Raw: rawInstaller.outdoor, // Corrected DB column name
                High_Voltage_Hardwired_Raw: rawInstaller.high_voltage_hardwired, // Corrected DB column name
                rawSupabaseData: rawInstaller, // Pass raw data for accessors that might need it
            };
            value = column.accessor(tempInstaller);
          } else if (column.dbColumn) {
            value = rawInstaller[column.dbColumn];
          } else {
            value = rawInstaller[column.key]; // Fallback for direct key mapping
          }
          row[column.header] = value; // Use column header as CSV header
        });
        return row;
      });

      const csv = Papa.unparse(dataToExport);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.setAttribute("download", "installers_filtered.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Filtered installers exported successfully!", { id: loadingToastId });
    } catch (err: any) {
      console.error("Error during export:", err);
      toast.error(`Failed to export installers: ${err.message}`, { id: loadingToastId });
    } finally {
      setLoading(false);
    }
  };

  const handleImportInstallers = async (file: File, mode: "overwrite" | "append") => {
    setLoading(true);
    const loadingToastId = toast.loading(`Importing installers from ${file.name} in ${mode} mode...`);
    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    try {
      const text = await file.text();
      // Remove BOM if present
      const cleanedText = text.startsWith('\ufeff') ? text.substring(1) : text;

      const { data, errors: parseErrors, meta } = Papa.parse(cleanedText, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false, // Keep as string for manual conversion
      });

      if (parseErrors.length > 0) {
        console.error("CSV parsing errors:", parseErrors);
        toast.error(`CSV parsing errors found. First error: ${parseErrors[0].message}`, { id: loadingToastId });
        setLoading(false);
        return;
      }

      const csvHeaders = meta.fields || [];
      const expectedHeaders = Object.keys(csvHeaderToDbColumnMap);
      const missingHeaders = expectedHeaders.filter(header => !csvHeaders.includes(header));

      if (missingHeaders.length > 0) {
        toast.error(`Missing required CSV headers: ${missingHeaders.join(', ')}. Please ensure your CSV matches the expected format.`, { id: loadingToastId, duration: 8000 });
        setLoading(false);
        return;
      }

      if (mode === "overwrite") {
        toast.info("Overwriting existing installers...", { id: loadingToastId });
        const { error: deleteError } = await supabase.from('installers').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows
        if (deleteError) {
          throw new Error(`Failed to clear existing data: ${deleteError.message}`);
        }
        toast.success("Existing installers cleared.", { id: loadingToastId });
      }

      const installersToInsert: any[] = [];
      const geolocationPromises: Promise<void>[] = [];

      for (const row of data) {
        const newInstallerData: any = {};
        let isValidRow = true;

        for (const csvHeader in row) {
          const dbColumn = csvHeaderToDbColumnMap[csvHeader];
          if (dbColumn) {
            let value = row[csvHeader];

            // Convert boolean-like strings to appropriate DB types
            if (['Blinds_and_Shades', 'Service_Call', 'Shutters', 'Draperies', 'Alta', 'alta_motorization'].includes(dbColumn)) {
              newInstallerData[dbColumn] = (value?.toLowerCase() === 'yes' || value === '1') ? 1 : 0;
            } else if (['hunter_douglas', 'carole', 'architectural', 'levolor', 'three_day_blinds', 'tall_window', 'fixture_displays', 'outdoor', 'high_voltage_hardwired'].includes(dbColumn)) { // Corrected DB column names
              newInstallerData[dbColumn] = (value?.toLowerCase() === 'yes' || value === '1') ? 1 : 0;
            } else if (['PowerView'].includes(dbColumn)) {
              newInstallerData[dbColumn] = (value?.toLowerCase() === 'yes' || value === '1') ? '1' : '0';
            } else if (['Shipment'].includes(dbColumn)) {
              newInstallerData[dbColumn] = (value?.toLowerCase() === 'yes' || value === '1') ? 'Yes' : 'No';
            } else if (['Installer_Vendor_ID', 'Star_Rating'].includes(dbColumn)) {
              newInstallerData[dbColumn] = value ? parseFloat(value) : null;
            } else if (value === "") {
              newInstallerData[dbColumn] = null; // Convert empty strings to null
            }
            else {
              newInstallerData[dbColumn] = value;
            }
          }
        }

        // Basic validation for required fields (name, address1, city, state, postalcode)
        if (!newInstallerData.name || !newInstallerData.address1 || !newInstallerData.city || !newInstallerData.state || !newInstallerData.postalcode) {
          console.warn("Skipping row due to missing required fields:", row);
          skippedCount++;
          isValidRow = false;
        }

        if (isValidRow) {
          installersToInsert.push(newInstallerData);
          geolocationPromises.push((async () => {
            // Construct address for geolocation, explicitly excluding 'add2'
            const addressForGeo = `${newInstallerData.address1 || ''}, ${newInstallerData.city || ''}, ${newInstallerData.state || ''} ${newInstallerData.postalcode || ''}, ${newInstallerData.Country || ''}`.trim();
            const coords = await getCoordinates({ searchText: addressForGeo });
            newInstallerData.latitude = coords.lat;
            newInstallerData.longitude = coords.lng;
            if (coords.lat === null || coords.lng === null) {
              console.warn(`Could not find coordinates for installer '${newInstallerData.name}'. Address: ${addressForGeo}`);
              toast.warning(`Could not find coordinates for '${newInstallerData.name}'.`, { id: loadingToastId });
            }
          })());
        }
      }

      // Wait for all geolocation calls to complete
      await Promise.all(geolocationPromises);

      // Batch insert into Supabase
      const { error: insertError } = await supabase
        .from('installers')
        .insert(installersToInsert);

      if (insertError) {
        throw new Error(`Failed to insert data into Supabase: ${insertError.message}`);
      }

      importedCount = installersToInsert.length;
      toast.success(`Successfully imported ${importedCount} installers. ${skippedCount > 0 ? `${skippedCount} rows skipped.` : ''}`, { id: loadingToastId, duration: 5000 });
      fetchInstallers(); // Re-fetch data to update the table
    } catch (err: any) {
      console.error("Error during import:", err);
      errorCount++;
      toast.error(`Import failed: ${err.message}`, { id: loadingToastId, duration: 8000 });
    } finally {
      setLoading(false);
      setIsImportModalOpen(false);
    }
  };

  const handleColumnToggle = (key: string, checked: boolean) => {
    setVisibleColumns(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(key);
      } else {
        newSet.delete(key);
      }
      return newSet;
    });
  };

  const handleClearAllColumns = () => {
    setVisibleColumns(new Set(["actions"])); // Keep only actions column visible
  };

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  const handleSort = (columnKey: string) => {
    // Only sort if the column has a dbColumn defined and is not 'actions' or 'address'
    const columnDef = columns.find(col => col.key === columnKey);
    if (!columnDef?.dbColumn || columnKey === 'actions' || columnKey === 'address') {
      return;
    }

    if (sortColumn === columnKey) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(columnKey);
      setSortDirection("asc"); // Default to ascending when a new column is selected
    }
    setCurrentPage(1); // Reset to first page on sort change
  };

  const handleApplyFilters = (filters: {
    brands: InstallerBrand[]; // New filter
    productSkills: InstallerSkill[]; // New filter
    certifications: InstallerCertification[];
    states: string[];
    acceptsShipments: 'any' | 'yes' | 'no';
  }) => {
    setFilterBrands(filters.brands);
    setFilterProductSkills(filters.productSkills);
    setFilterCertifications(filters.certifications);
    setFilterStates(filters.states);
    setFilterAcceptsShipments(filters.acceptsShipments);
    setCurrentPage(1); // Reset to first page when filters change
  };

  const handleClearAllFilters = () => {
    setFilterBrands([]);
    setFilterProductSkills([]);
    setFilterCertifications([]);
    setFilterStates([]);
    setFilterAcceptsShipments('any');
    setCurrentPage(1); // Reset to first page when filters are cleared
  };

  return (
    <div className="flex flex-col min-h-screen container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <Button variant="outline" size="sm" onClick={() => navigate("/locator")} className="mr-2">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-gray-700 whitespace-nowrap">
            Installer Management
          </h1>
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              type="text"
              placeholder="Search installers..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1); // Reset to first page on new search
              }}
              className="pl-9 pr-3 py-2 w-full"
            />
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setIsFilterModalOpen(true)}>
            <Filter className="h-4 w-4 mr-2" /> Filter
          </Button>
          <Button variant="outline" onClick={() => setIsImportModalOpen(true)}>
            <Upload className="h-4 w-4 mr-2" /> Import
          </Button>
          <Button onClick={handleExportInstallers} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-2" />} Export
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Eye className="h-4 w-4 mr-2" /> Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuItem onClick={handleClearAllColumns}>
                Clear All
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {columns.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.key}
                  className="capitalize"
                  checked={visibleColumns.has(column.key)}
                  onCheckedChange={(checked) => handleColumnToggle(column.key, checked)}
                  // Disable toggling for the 'actions' column
                  disabled={column.key === 'actions'}
                  onSelect={(e) => e.preventDefault()} // Prevent dropdown from closing
                >
                  {column.header}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={handleAddInstaller}>
            <PlusCircle className="h-4 w-4 mr-2" /> Add
          </Button>
        </div>
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center mt-8">
          <p className="text-red-500">{error}</p>
          <Button onClick={fetchInstallers} className="mt-4">Retry Loading</Button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.filter(col => visibleColumns.has(col.key)).map((column) => (
                    <TableHead 
                      key={column.key}
                      className={column.dbColumn && column.key !== 'actions' && column.key !== 'address' ? "cursor-pointer select-none" : ""}
                      onClick={() => handleSort(column.key)}
                    >
                      <div className="flex items-center">
                        {column.header}
                        {sortColumn === column.key && (
                          sortDirection === "asc" ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={columns.filter(col => visibleColumns.has(col.key)).length} className="h-24 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-gray-500" />
                      <p className="text-gray-500 mt-2">Loading installers...</p>
                    </TableCell>
                  </TableRow>
                ) : installers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.filter(col => visibleColumns.has(col.key)).length} className="h-24 text-center text-gray-500">
                      {searchTerm || filterBrands.length > 0 || filterProductSkills.length > 0 || filterCertifications.length > 0 || filterStates.length > 0 || filterAcceptsShipments !== 'any' ? "No installers found matching your criteria." : "No installers found. Click 'Add New Installer' to get started."}
                    </TableCell>
                  </TableRow>
                ) : (
                  installers.map((installer) => (
                    <TableRow key={installer.id}>
                      {columns.filter(col => visibleColumns.has(col.key)).map((column) => (
                        <TableCell key={`${installer.id}-${column.key}`}>
                          {column.key === "actions" ? (
                            <div className="flex space-x-2">
                              <Button variant="outline" size="sm" onClick={() => handleEditInstallerClick(installer)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="destructive" size="sm" onClick={() => confirmDeleteInstaller(installer.id, installer.name)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : column.accessor ? (
                            column.accessor(installer)
                          ) : (
                            (installer as any)[column.key]
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-700">Rows per page:</span>
              <Select value={String(itemsPerPage)} onValueChange={handleItemsPerPageChange}>
                <SelectTrigger className="w-[80px]">
                  <SelectValue placeholder="25" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    onClick={() => handlePageChange(currentPage - 1)} 
                    className={currentPage === 1 ? "pointer-events-none opacity-50" : undefined}
                  />
                </PaginationItem>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <PaginationItem key={page}>
                    <PaginationLink 
                      onClick={() => handlePageChange(page)} 
                      isActive={currentPage === page}
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext 
                    onClick={() => handlePageChange(currentPage + 1)} 
                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : undefined}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </>
      )}
      <ImportInstallersModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={handleImportInstallers}
      />
      {/* REMOVED EditInstallerModal */}
      {/* {currentInstallerToEdit && (
        <EditInstallerModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          installer={currentInstallerToEdit}
          onSave={handleSaveEditedInstaller}
          loading={loading}
        />
      )} */}
      <AddInstallerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleSaveNewInstaller}
        loading={loading}
      />
      {installerToDelete && (
        <DeleteConfirmationModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={handleDeleteConfirmed}
          itemName={`installer '${installerToDelete.name}'`}
          loading={loading}
        />
      )}
      <InstallerFilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        allStatesProvinces={allStatesProvinces}
        currentFilters={{
          brands: filterBrands, // New
          productSkills: filterProductSkills, // New
          certifications: filterCertifications,
          states: filterStates,
          acceptsShipments: filterAcceptsShipments,
        }}
        onApplyFilters={handleApplyFilters}
        onClearAllFilters={handleClearAllFilters}
      />
    </div>
  );
};

export default InstallerManagement;