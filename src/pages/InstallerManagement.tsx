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
import { supabase } from "@/integrations/supabase/client";
import { Installer, InstallerCertification, InstallerBrand, InstallerSkill } from "@/types/installer";
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
import AddInstallerModal from "@/components/AddInstallerModal";
import DeleteConfirmationModal from "@/components/DeleteConfirmationModal";
import { run as getCoordinates } from "@/functions/getCoordinates";
import { Input } from "@/components/ui/input";
import { useCountrySettings } from "@/hooks/useCountrySettings";
import { useNavigate } from "react-router-dom";
import InstallerFilterModal from "@/components/InstallerFilterModal";

interface TableColumn {
  key: keyof Installer | 'actions' | 'city' | 'state' | 'blindsAndShades' | 'pipCertification' | 'motorization' | 'motorizationCertification' | 'draperies' | 'draperiesCertification' | 'shutters' | 'shutterCertificationLevel' | 'alta' | 'altaMotorization' | 'hunterDouglas' | 'carole' | 'architectural' | 'levolor' | 'threeDayBlinds' | 'tallWindow' | 'fixtureDisplays' | 'outdoor' | 'highVoltageHardwired';
  header: string;
  accessor?: (installer: Installer) => React.ReactNode;
  exportKey?: string;
  dbColumn?: string;
}

const toBoolean = (value: any): boolean => {
  if (typeof value === 'string') {
    return value.toLowerCase() === '1' || value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';
  }
  return value === 1 || value === true;
};

const getColumns = (postalCodeLabel: string): TableColumn[] => [
  { key: "actions", header: "Actions" },
  { key: "name", header: "Name", dbColumn: "name" },
  { key: "email", header: "Email", accessor: (installer) => installer.email || '-', dbColumn: "email" },
  { key: "phone", header: "Phone", dbColumn: "primary_phone" },
  { key: "address", header: "Address" },
  { key: "city", header: "City", accessor: (installer) => installer.rawSupabaseData?.city || '-', dbColumn: "city" },
  { key: "state", header: "State", accessor: (installer) => installer.rawSupabaseData?.state || '-', dbColumn: "state" },
  { key: "zipCode", header: postalCodeLabel, dbColumn: "postalcode" },
  { key: "hunterDouglas", header: "Hunter Douglas", accessor: (installer) => toBoolean(installer.hunter_douglas_raw) ? "Yes" : "No", exportKey: "hunter_douglas", dbColumn: "hunter_douglas" },
  { key: "alta", header: "Alta", accessor: (installer) => toBoolean(installer.alta_raw) ? "Yes" : "No", exportKey: "alta", dbColumn: "alta" },
  { key: "carole", header: "Carole", accessor: (installer) => toBoolean(installer.carole_raw) ? "Yes" : "No", exportKey: "carole", dbColumn: "carole" },
  { key: "architectural", header: "Architectural", accessor: (installer) => toBoolean(installer.architectural_raw) ? "Yes" : "No", exportKey: "architectural", dbColumn: "architectural" },
  { key: "levolor", header: "Levolor", accessor: (installer) => toBoolean(installer.levolor_raw) ? "Yes" : "No", exportKey: "levolor", dbColumn: "levolor" },
  { key: "threeDayBlinds", header: "Three Day Blinds", accessor: (installer) => toBoolean(installer.three_day_blinds_raw) ? "Yes" : "No", exportKey: "three_day_blinds", dbColumn: "three_day_blinds" },
  { key: "blindsAndShades", header: "Blinds & Shades", accessor: (installer) => toBoolean(installer.blinds_and_shades_raw) ? "Yes" : "No", exportKey: "blinds_and_shades", dbColumn: "blinds_and_shades" },
  { key: "shutters", header: "Shutters", accessor: (installer) => toBoolean(installer.shutters_raw) ? "Yes" : "No", exportKey: "shutters", dbColumn: "shutters" },
  { key: "draperies", header: "Draperies", accessor: (installer) => toBoolean(installer.draperies_raw) ? "Yes" : "No", exportKey: "draperies", dbColumn: "draperies" },
  { key: "motorization", header: "Motorization", accessor: (installer) => toBoolean(installer.power_view_raw) ? "Yes" : "No", exportKey: "power_view", dbColumn: "power_view" },
  { key: "altaMotorization", header: "Alta Motorization", accessor: (installer) => toBoolean(installer.alta_motorization_raw) ? "Yes" : "No", exportKey: "alta_motorization", dbColumn: "alta_motorization" },
  { key: "tallWindow", header: "Tall Window", accessor: (installer) => toBoolean(installer.tall_window_raw) ? "Yes" : "No", exportKey: "tall_window", dbColumn: "tall_window" },
  { key: "fixtureDisplays", header: "Fixture Displays", accessor: (installer) => toBoolean(installer.fixture_displays_raw) ? "Yes" : "No", exportKey: "fixture_displays", dbColumn: "fixture_displays" },
  { key: "outdoor", header: "Outdoor", accessor: (installer) => toBoolean(installer.outdoor_raw) ? "Yes" : "No", exportKey: "outdoor", dbColumn: "outdoor" },
  { key: "highVoltageHardwired", header: "High Voltage Hardwired", accessor: (installer) => toBoolean(installer.high_voltage_hardwired_raw) ? "Yes" : "No", exportKey: "high_voltage_hardwired", dbColumn: "high_voltage_hardwired" },
  { key: "pipCertification", header: "PIP Certification", accessor: (installer) => installer.pip_certification_level_raw || '-', exportKey: "pip_certification_level", dbColumn: "pip_certification_level" },
  { key: "motorizationCertification", header: "Motorization Certification", accessor: (installer) => installer.powerview_certification_raw || '-', exportKey: "powerview_certification", dbColumn: "powerview_certification" },
  { key: "draperiesCertification", header: "Draperies Certification", accessor: (installer) => installer.draperies_certification_level_raw || '-', exportKey: "draperies_certification_level", dbColumn: "draperies_certification_level" },
  { key: "shutterCertificationLevel", header: "Shutter Certification Level", accessor: (installer) => installer.shutter_certification_level_raw || '-', exportKey: "shutter_certification_level", dbColumn: "shutter_certification_level" },
  { key: "installerVendorId", header: "Vendor ID", dbColumn: "installer_vendor_id" },
  { key: "acceptsShipments", header: "Accepts Shipments", accessor: (installer) => (installer.acceptsShipments ? "Yes" : "No"), exportKey: "shipment", dbColumn: "shipment" },
  { key: "latitude", header: "Latitude", dbColumn: "latitude" },
  { key: "longitude", header: "Longitude", dbColumn: "longitude" },
];

const defaultVisibleColumnKeys = new Set([
  "actions", "name", "email", "phone", "address", "city", "state", "zipCode",
  "hunterDouglas", "alta", "carole", "architectural", "levolor", "threeDayBlinds",
  "blindsAndShades", "shutters", "draperies", "motorization", "altaMotorization", "tallWindow", "fixtureDisplays", "outdoor", "highVoltageHardwired",
  "pipCertification", "motorizationCertification", "draperiesCertification", "shutterCertificationLevel",
]);

const csvHeaderToDbColumnMap: { [key: string]: string } = {
  "Name": "name", "Address1": "address1", "Add2": "add2", "City": "city", "State": "state", "Postalcode": "postalcode",
  "Primary_Phone": "primary_phone", "Secondary_Phone": "secondary_phone", "Country": "country", "Hunter_Douglas": "hunter_douglas",
  "Alta": "alta", "Carole": "carole", "Architectural": "architectural", "Levolor": "levolor", "Three_Day_Blinds": "three_day_blinds",
  "Blinds_and_Shades": "blinds_and_shades", "PowerView": "power_view", "Service_Call": "service_call", "Shutters": "shutters",
  "Draperies": "draperies", "Alta_Motorization": "alta_motorization", "Tall_Window": "tall_window", "Fixture_Displays": "fixture_displays",
  "Outdoor": "outdoor", "High_Voltage_Hardwired": "high_voltage_hardwired", "Shipment": "shipment", "Email": "email",
  "Specialnote": "specialnote", "Comments": "comments", "Installer_Vendor_ID": "installer_vendor_id",
  "PIP_Certification_Level": "pip_certification_level", "Shutter_Certification_Level": "shutter_certification_level",
  "Powerview_Certification": "powerview_certification", "Draperies_Certification_Level": "draperies_certification_level",
  "Sales_Org": "sales_org", "Star_Rating": "star_rating",
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
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [sortColumn, setSortColumn] = useState<string | null>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [installerToDelete, setInstallerToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [filterBrands, setFilterBrands] = useState<InstallerBrand[]>([]);
  const [filterProductSkills, setFilterProductSkills] = useState<InstallerSkill[]>([]);
  const [filterCertifications, setFilterCertifications] = useState<InstallerCertification[]>([]);
  const [filterStates, setFilterStates] = useState<string[]>([]);
  const [filterAcceptsShipments, setFilterAcceptsShipments] = useState<'any' | 'yes' | 'no'>('any');
  const [allStatesProvinces, setAllStatesProvinces] = useState<string[]>([]);
  const { postalCodeLabel } = useCountrySettings();
  const navigate = useNavigate();
  const columns = useMemo(() => getColumns(postalCodeLabel), [postalCodeLabel]);
  const totalPages = Math.ceil(totalInstallers / itemsPerPage);

  const standardizeCertificationName = (cert: string | null | undefined): InstallerCertification | null => {
    if (!cert) return null;
    const normalizedCert = cert.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const validCertificationsMap: { [key: string]: InstallerCertification } = {
      "motorization pro": "Motorization Pro", "certified installer": "Certified Installer",
      "master installer": "Master Installer", "master shutter": "Shutter Pro",
      "drapery pro": "Drapery Pro", "pip certified": "PIP Certified",
    };
    return validCertificationsMap[normalizedCert] || null;
  };

  const fetchInstallers = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage - 1;

    let query = supabase.from('installers').select('*', { count: 'exact' });

    if (searchTerm) {
      const searchPattern = `%${searchTerm}%`;
      query = query.or(`name.ilike.${searchPattern},primary_phone.ilike.${searchPattern},email.ilike.${searchPattern},city.ilike.${searchPattern},state.ilike.${searchPattern},postalcode.ilike.${searchPattern}`);
    }

    if (filterBrands.length > 0) {
      filterBrands.forEach(brand => {
        if (brand === "Hunter Douglas") query = query.filter("hunter_douglas", "eq", 1);
        else if (brand === "Alta") query = query.filter("alta", "eq", 1);
        else if (brand === "Carole") query = query.filter("carole", "eq", 1);
        else if (brand === "Architectural") query = query.filter("architectural", "eq", 1);
        else if (brand === "Levolor") query = query.filter("levolor", "eq", 1);
        else if (brand === "Three Day Blinds") query = query.filter("three_day_blinds", "eq", 1);
      });
    }

    if (filterProductSkills.length > 0) {
      filterProductSkills.forEach(skill => {
        if (skill === "Blinds & Shades") query = query.filter("blinds_and_shades", "eq", 1);
        else if (skill === "Motorization") query = query.filter("power_view", "eq", 1);
        else if (skill === "Service Call") query = query.filter("service_call", "eq", 1);
        else if (skill === "Shutters") query = query.filter("shutters", "eq", 1);
        else if (skill === "Drapery") query = query.filter("draperies", "eq", 1);
        else if (skill === "Tall Window") query = query.filter("tall_window", "eq", 1);
        else if (skill === "Fixture Displays") query = query.filter("fixture_displays", "eq", 1);
        else if (skill === "Outdoor") query = query.filter("outdoor", "eq", 1);
        else if (skill === "High Voltage Hardwired") query = query.filter("high_voltage_hardwired", "eq", 1);
      });
    }

    if (filterCertifications.length > 0) {
      filterCertifications.forEach(cert => {
        const searchPattern = `%${cert}%`;
        if (cert === "Motorization Pro") query = query.filter("powerview_certification", "ilike", searchPattern);
        else if (cert === "Shutter Pro") query = query.filter("shutter_certification_level", "ilike", searchPattern);
        else if (["Master Installer", "Certified Installer", "PIP Certified"].includes(cert)) query = query.filter("pip_certification_level", "ilike", searchPattern);
        else if (cert === "Drapery Pro") query = query.filter("draperies_certification_level", "ilike", searchPattern);
      });
    }

    if (filterStates.length > 0) {
      const stateConditions = filterStates.map(state => `state.eq.${state}`);
      query = query.or(stateConditions.join(','));
    }

    if (filterAcceptsShipments === 'yes') query = query.filter("shipment", "eq", 1);
    else if (filterAcceptsShipments === 'no') query = query.filter("shipment", "eq", 0);

    if (sortColumn) {
      const columnDef = columns.find(col => col.key === sortColumn);
      const dbColumnName = columnDef?.dbColumn;
      if (dbColumnName && dbColumnName !== 'actions' && dbColumnName !== 'address') {
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
        if (toBoolean(rawInstaller.blinds_and_shades)) skills.push("Blinds & Shades");
        if (toBoolean(rawInstaller.power_view)) skills.push("Motorization");
        if (toBoolean(rawInstaller.shutters)) skills.push("Shutters");
        if (toBoolean(rawInstaller.draperies)) skills.push("Drapery");
        if (toBoolean(rawInstaller.service_call)) skills.push("Service Call");
        if (toBoolean(rawInstaller.tall_window)) skills.push("Tall Window");
        if (toBoolean(rawInstaller.fixture_displays)) skills.push("Fixture Displays");
        if (toBoolean(rawInstaller.outdoor)) skills.push("Outdoor");
        if (toBoolean(rawInstaller.high_voltage_hardwired)) skills.push("High Voltage Hardwired");

        const brands: InstallerBrand[] = [];
        if (toBoolean(rawInstaller.hunter_douglas)) brands.push("Hunter Douglas");
        if (toBoolean(rawInstaller.alta)) brands.push("Alta");
        if (toBoolean(rawInstaller.carole)) brands.push("Carole");
        if (toBoolean(rawInstaller.architectural)) brands.push("Architectural");
        if (toBoolean(rawInstaller.levolor)) brands.push("Levolor");
        if (toBoolean(rawInstaller.three_day_blinds)) brands.push("Three Day Blinds");

        const certifications: InstallerCertification[] = [];
        const pvCert = standardizeCertificationName(rawInstaller.powerview_certification);
        if (pvCert) certifications.push(pvCert);
        const shutterCert = standardizeCertificationName(rawInstaller.shutter_certification_level);
        if (shutterCert) certifications.push(shutterCert);
        const draperyCert = standardizeCertificationName(rawInstaller.draperies_certification_level);
        if (draperyCert) certifications.push(draperyCert);
        const pipCert = standardizeCertificationName(rawInstaller.pip_certification_level);
        if (pipCert) certifications.push(pipCert);

        return {
          id: rawInstaller.id,
          name: rawInstaller.name || rawInstaller.H,
          address: `${rawInstaller.address1 || ''} ${rawInstaller.add2 || ''}, ${rawInstaller.city || ''}, ${rawInstaller.state || ''} ${rawInstaller.postalcode || ''}`.trim(),
          zipCode: rawInstaller.postalcode,
          phone: rawInstaller.primary_phone,
          email: rawInstaller.email,
          skills, brands, certifications,
          latitude: rawInstaller.latitude, longitude: rawInstaller.longitude,
          installerVendorId: rawInstaller.installer_vendor_id?.toString(),
          acceptsShipments: toBoolean(rawInstaller.shipment),
          blinds_and_shades_raw: rawInstaller.blinds_and_shades,
          pip_certification_level_raw: rawInstaller.pip_certification_level,
          power_view_raw: rawInstaller.power_view,
          powerview_certification_raw: rawInstaller.powerview_certification,
          draperies_raw: rawInstaller.draperies,
          draperies_certification_level_raw: rawInstaller.draperies_certification_level,
          shutters_raw: rawInstaller.shutters,
          shutter_certification_level_raw: rawInstaller.shutter_certification_level,
          alta_raw: rawInstaller.alta,
          alta_motorization_raw: rawInstaller.alta_motorization,
          hunter_douglas_raw: rawInstaller.hunter_douglas,
          carole_raw: rawInstaller.carole,
          architectural_raw: rawInstaller.architectural,
          levolor_raw: rawInstaller.levolor,
          three_day_blinds_raw: rawInstaller.three_day_blinds,
          tall_window_raw: rawInstaller.tall_window,
          fixture_displays_raw: rawInstaller.fixture_displays,
          outdoor_raw: rawInstaller.outdoor,
          high_voltage_hardwired_raw: rawInstaller.high_voltage_hardwired,
          rawSupabaseData: rawInstaller,
        };
      });
      setInstallers(mappedInstallers);
      setTotalInstallers(count || 0);

      const uniqueStates = new Set<string>();
      (data || []).forEach((rawInstaller: any) => {
          if (rawInstaller.state) uniqueStates.add(rawInstaller.state);
      });
      setAllStatesProvinces(Array.from(uniqueStates).sort());
    }
    setLoading(false);
  }, [currentPage, itemsPerPage, searchTerm, sortColumn, sortDirection, columns, filterBrands, filterProductSkills, filterCertifications, filterStates, filterAcceptsShipments]);

  useEffect(() => {
    fetchInstallers();
  }, [fetchInstallers]);

  const handleAddInstaller = () => setIsAddModalOpen(true);

  const handleSaveNewInstaller = async (newInstallerData: any) => {
    setLoading(true);
    const loadingToastId = toast.loading("Adding new installer...");
    try {
      const { data: insertedData, error: insertError } = await supabase.from("installers").insert([newInstallerData]).select();
      if (insertError) throw new Error(`Supabase Insert Error: ${insertError.message}`);
      const newInstallerId = insertedData?.[0]?.id;
      if (!newInstallerId) throw new Error("Failed to retrieve new installer ID after insertion.");
      toast.success("Installer added successfully! Fetching coordinates...", { id: loadingToastId });
      const fullAddress = `${newInstallerData.address1 || ''}, ${newInstallerData.city || ''}, ${newInstallerData.state || ''} ${newInstallerData.postalcode || ''}, ${newInstallerData.country || ''}`.trim();
      const coords = await getCoordinates({ searchText: fullAddress });
      if (coords.lat !== null && coords.lng !== null) {
        const { error: updateError } = await supabase.from("installers").update({ latitude: coords.lat, longitude: coords.lng }).eq("id", newInstallerId);
        if (updateError) throw new Error(`Supabase Update Error (coordinates): ${updateError.message}`);
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

  const handleEditInstallerClick = (installer: Installer) => navigate(`/installers/edit/${installer.id}`);

  const confirmDeleteInstaller = (id: string, name: string) => {
    setInstallerToDelete({ id, name });
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirmed = async () => {
    if (!installerToDelete) return;
    setLoading(true);
    const loadingToastId = toast.loading(`Deleting installer '${installerToDelete.name}'...`);
    const { error } = await supabase.from('installers').delete().eq('id', installerToDelete.id);
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
      let query = supabase.from('installers').select('*');
      if (searchTerm) {
        const searchPattern = `%${searchTerm}%`;
        query = query.or(`name.ilike.${searchPattern},primary_phone.ilike.${searchPattern},email.ilike.${searchPattern},city.ilike.${searchPattern},state.ilike.${searchPattern},postalcode.ilike.${searchPattern}`);
      }
      if (filterBrands.length > 0) {
        filterBrands.forEach(brand => {
          if (brand === "Hunter Douglas") query = query.filter("hunter_douglas", "eq", 1);
          else if (brand === "Alta") query = query.filter("alta", "eq", 1);
          else if (brand === "Carole") query = query.filter("carole", "eq", 1);
          else if (brand === "Architectural") query = query.filter("architectural", "eq", 1);
          else if (brand === "Levolor") query = query.filter("levolor", "eq", 1);
          else if (brand === "Three Day Blinds") query = query.filter("three_day_blinds", "eq", 1);
        });
      }
      if (filterProductSkills.length > 0) {
        filterProductSkills.forEach(skill => {
          if (skill === "Blinds & Shades") query = query.filter("blinds_and_shades", "eq", 1);
          else if (skill === "Motorization") query = query.filter("power_view", "eq", 1);
          else if (skill === "Service Call") query = query.filter("service_call", "eq", 1);
          else if (skill === "Shutters") query = query.filter("shutters", "eq", 1);
          else if (skill === "Drapery") query = query.filter("draperies", "eq", 1);
          else if (skill === "Tall Window") query = query.filter("tall_window", "eq", 1);
          else if (skill === "Fixture Displays") query = query.filter("fixture_displays", "eq", 1);
          else if (skill === "Outdoor") query = query.filter("outdoor", "eq", 1);
          else if (skill === "High Voltage Hardwired") query = query.filter("high_voltage_hardwired", "eq", 1);
        });
      }
      if (filterCertifications.length > 0) {
        filterCertifications.forEach(cert => {
          const searchPattern = `%${cert}%`;
          if (cert === "Motorization Pro") query = query.filter("powerview_certification", "ilike", searchPattern);
          else if (cert === "Shutter Pro") query = query.filter("shutter_certification_level", "ilike", searchPattern);
          else if (["Master Installer", "Certified Installer", "PIP Certified"].includes(cert)) query = query.filter("pip_certification_level", "ilike", searchPattern);
          else if (cert === "Drapery Pro") query = query.filter("draperies_certification_level", "ilike", searchPattern);
        });
      }
      if (filterStates.length > 0) {
        const stateConditions = filterStates.map(state => `state.eq.${state}`);
        query = query.or(stateConditions.join(','));
      }
      if (filterAcceptsShipments === 'yes') query = query.filter("shipment", "eq", 1);
      else if (filterAcceptsShipments === 'no') query = query.filter("shipment", "eq", 0);

      const { data, error } = await query;
      if (error) throw new Error(`Supabase Fetch Error: ${error.message}`);
      if (!data || data.length === 0) {
        toast.info("No installers found matching current filters to export.", { id: loadingToastId });
        return;
      }
      const dataToExport = data.map((rawInstaller: any) => {
        const row: { [key: string]: any } = {};
        columns.filter(col => visibleColumns.has(col.key) && col.key !== 'actions').forEach(column => {
          let value;
          if (column.key === 'address') {
            value = `${rawInstaller.address1 || ''} ${rawInstaller.add2 || ''}, ${rawInstaller.city || ''}, ${rawInstaller.state || ''} ${rawInstaller.postalcode || ''}`.trim();
          } else if (column.accessor) {
            const tempInstaller: Installer = {
                id: rawInstaller.id, name: rawInstaller.name,
                address: `${rawInstaller.address1 || ''} ${rawInstaller.add2 || ''}, ${rawInstaller.city || ''}, ${rawInstaller.state || ''} ${rawInstaller.postalcode || ''}`.trim(),
                zipCode: rawInstaller.postalcode, phone: rawInstaller.primary_phone, email: rawInstaller.email,
                skills: [], brands: [], certifications: [],
                latitude: rawInstaller.latitude, longitude: rawInstaller.longitude,
                installerVendorId: rawInstaller.installer_vendor_id?.toString(),
                acceptsShipments: toBoolean(rawInstaller.shipment),
                blinds_and_shades_raw: rawInstaller.blinds_and_shades, pip_certification_level_raw: rawInstaller.pip_certification_level,
                power_view_raw: rawInstaller.power_view, powerview_certification_raw: rawInstaller.powerview_certification,
                draperies_raw: rawInstaller.draperies, draperies_certification_level_raw: rawInstaller.draperies_certification_level,
                shutters_raw: rawInstaller.shutters, shutter_certification_level_raw: rawInstaller.shutter_certification_level,
                alta_raw: rawInstaller.alta, alta_motorization_raw: rawInstaller.alta_motorization,
                hunter_douglas_raw: rawInstaller.hunter_douglas, carole_raw: rawInstaller.carole,
                architectural_raw: rawInstaller.architectural, levolor_raw: rawInstaller.levolor,
                three_day_blinds_raw: rawInstaller.three_day_blinds, tall_window_raw: rawInstaller.tall_window,
                fixture_displays_raw: rawInstaller.fixture_displays, outdoor_raw: rawInstaller.outdoor,
                high_voltage_hardwired_raw: rawInstaller.high_voltage_hardwired,
                rawSupabaseData: rawInstaller,
            };
            value = column.accessor(tempInstaller);
          } else if (column.dbColumn) {
            value = rawInstaller[column.dbColumn];
          } else {
            value = (rawInstaller as any)[column.key];
          }
          row[column.header] = value;
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
    let importedCount = 0, skippedCount = 0, errorCount = 0;
    try {
      const text = await file.text();
      const cleanedText = text.startsWith('\ufeff') ? text.substring(1) : text;
      const { data, errors: parseErrors, meta } = Papa.parse(cleanedText, { header: true, skipEmptyLines: true, dynamicTyping: false });
      if (parseErrors.length > 0) {
        console.error("CSV parsing errors:", parseErrors);
        toast.error(`CSV parsing errors found. First error: ${parseErrors[0].message}`, { id: loadingToastId });
        setLoading(false); return;
      }
      const csvHeaders = meta.fields || [];
      const expectedHeaders = Object.keys(csvHeaderToDbColumnMap);
      const missingHeaders = expectedHeaders.filter(header => !csvHeaders.includes(header));
      if (missingHeaders.length > 0) {
        toast.error(`Missing required CSV headers: ${missingHeaders.join(', ')}. Please ensure your CSV matches the expected format.`, { id: loadingToastId, duration: 8000 });
        setLoading(false); return;
      }
      if (mode === "overwrite") {
        toast.info("Overwriting existing installers...", { id: loadingToastId });
        const { error: deleteError } = await supabase.from('installers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (deleteError) throw new Error(`Failed to clear existing data: ${deleteError.message}`);
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
            if (['blinds_and_shades', 'service_call', 'shutters', 'draperies', 'alta', 'alta_motorization', 'hunter_douglas', 'carole', 'architectural', 'levolor', 'three_day_blinds', 'tall_window', 'fixture_displays', 'outdoor', 'high_voltage_hardwired'].includes(dbColumn)) {
              newInstallerData[dbColumn] = (value?.toLowerCase() === 'yes' || value === '1') ? 1 : 0;
            } else if (['power_view'].includes(dbColumn)) {
              newInstallerData[dbColumn] = (value?.toLowerCase() === 'yes' || value === '1') ? 1 : 0;
            } else if (['shipment'].includes(dbColumn)) {
              newInstallerData[dbColumn] = (value?.toLowerCase() === 'yes' || value === '1') ? 1 : 0;
            } else if (['installer_vendor_id', 'star_rating'].includes(dbColumn)) {
              newInstallerData[dbColumn] = value ? parseFloat(value) : null;
            } else if (value === "") {
              newInstallerData[dbColumn] = null;
            } else {
              newInstallerData[dbColumn] = value;
            }
          }
        }
        if (!newInstallerData.name || !newInstallerData.address1 || !newInstallerData.city || !newInstallerData.state || !newInstallerData.postalcode) {
          console.warn("Skipping row due to missing required fields:", row);
          skippedCount++;
          isValidRow = false;
        }
        if (isValidRow) {
          installersToInsert.push(newInstallerData);
          geolocationPromises.push((async () => {
            const addressForGeo = `${newInstallerData.address1 || ''}, ${newInstallerData.city || ''}, ${newInstallerData.state || ''} ${newInstallerData.postalcode || ''}, ${newInstallerData.country || ''}`.trim();
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
      await Promise.all(geolocationPromises);
      const { error: insertError } = await supabase.from('installers').insert(installersToInsert);
      if (insertError) throw new Error(`Failed to insert data into Supabase: ${insertError.message}`);
      importedCount = installersToInsert.length;
      toast.success(`Successfully imported ${importedCount} installers. ${skippedCount > 0 ? `${skippedCount} rows skipped.` : ''}`, { id: loadingToastId, duration: 5000 });
      fetchInstallers();
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
      if (checked) newSet.add(key); else newSet.delete(key);
      return newSet;
    });
  };

  const handleClearAllColumns = () => setVisibleColumns(new Set(["actions"]));

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  const handleSort = (columnKey: string) => {
    const columnDef = columns.find(col => col.key === columnKey);
    if (!columnDef?.dbColumn || columnKey === 'actions' || columnKey === 'address') return;
    if (sortColumn === columnKey) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(columnKey);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  const handleApplyFilters = (filters: {
    brands: InstallerBrand[]; productSkills: InstallerSkill[];
    certifications: InstallerCertification[]; states: string[];
    acceptsShipments: 'any' | 'yes' | 'no';
  }) => {
    setFilterBrands(filters.brands);
    setFilterProductSkills(filters.productSkills);
    setFilterCertifications(filters.certifications);
    setFilterStates(filters.states);
    setFilterAcceptsShipments(filters.acceptsShipments);
    setCurrentPage(1);
  };

  const handleClearAllFilters = () => {
    setFilterBrands([]); setFilterProductSkills([]); setFilterCertifications([]);
    setFilterStates([]); setFilterAcceptsShipments('any'); setCurrentPage(1);
  };

  return (
    <div className="flex flex-col min-h-screen container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <Button variant="outline" size="sm" onClick={() => navigate("/locator")} className="mr-2">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-gray-700 whitespace-nowrap">Installer Management</h1>
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input type="text" placeholder="Search installers..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="pl-9 pr-3 py-2 w-full" />
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setIsFilterModalOpen(true)}><Filter className="h-4 w-4 mr-2" /> Filter</Button>
          <Button variant="outline" onClick={() => setIsImportModalOpen(true)}><Upload className="h-4 w-4 mr-2" /> Import</Button>
          <Button onClick={handleExportInstallers} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-2" />} Export</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline"><Eye className="h-4 w-4 mr-2" /> Columns</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuItem onClick={handleClearAllColumns}>Clear All</DropdownMenuItem>
              <DropdownMenuSeparator />
              {columns.map((column) => (
                <DropdownMenuCheckboxItem key={column.key} className="capitalize" checked={visibleColumns.has(column.key)} onCheckedChange={(checked) => handleColumnToggle(column.key, checked)} disabled={column.key === 'actions'} onSelect={(e) => e.preventDefault()}>
                  {column.header}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={handleAddInstaller}><PlusCircle className="h-4 w-4 mr-2" /> Add</Button>
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
                    <TableHead key={column.key} className={column.dbColumn && column.key !== 'actions' && column.key !== 'address' ? "cursor-pointer select-none" : ""} onClick={() => handleSort(column.key)}>
                      <div className="flex items-center">{column.header}{sortColumn === column.key && (sortDirection === "asc" ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />)}</div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={columns.filter(col => visibleColumns.has(col.key)).length} className="h-24 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-gray-500" /><p className="text-gray-500 mt-2">Loading installers...</p></TableCell></TableRow>
                ) : installers.length === 0 ? (
                  <TableRow><TableCell colSpan={columns.filter(col => visibleColumns.has(col.key)).length} className="h-24 text-center text-gray-500">{searchTerm || filterBrands.length > 0 || filterProductSkills.length > 0 || filterCertifications.length > 0 || filterStates.length > 0 || filterAcceptsShipments !== 'any' ? "No installers found matching your criteria." : "No installers found. Click 'Add New Installer' to get started."}</TableCell></TableRow>
                ) : (
                  installers.map((installer) => (
                    <TableRow key={installer.id}>
                      {columns.filter(col => visibleColumns.has(col.key)).map((column) => (
                        <TableCell key={`${installer.id}-${column.key}`}>
                          {column.key === "actions" ? (
                            <div className="flex space-x-2">
                              <Button variant="outline" size="sm" onClick={() => handleEditInstallerClick(installer)}><Edit className="h-4 w-4" /></Button>
                              <Button variant="destructive" size="sm" onClick={() => confirmDeleteInstaller(installer.id, installer.name)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          ) : column.accessor ? column.accessor(installer) : (installer as any)[column.key]}
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
                <SelectTrigger className="w-[80px]"><SelectValue placeholder="25" /></SelectTrigger>
                <SelectContent><SelectItem value="25">25</SelectItem><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem></SelectContent>
              </Select>
            </div>
            <Pagination>
              <PaginationContent>
                <PaginationItem><PaginationPrevious onClick={() => handlePageChange(currentPage - 1)} className={currentPage === 1 ? "pointer-events-none opacity-50" : undefined} /></PaginationItem>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <PaginationItem key={page}><PaginationLink onClick={() => handlePageChange(page)} isActive={currentPage === page}>{page}</PaginationLink></PaginationItem>
                ))}
                <PaginationItem><PaginationNext onClick={() => handlePageChange(currentPage + 1)} className={currentPage === totalPages ? "pointer-events-none opacity-50" : undefined} /></PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </>
      )}
      <ImportInstallersModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} onImport={handleImportInstallers} />
      <AddInstallerModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSave={handleSaveNewInstaller} loading={loading} />
      {installerToDelete && (<DeleteConfirmationModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={handleDeleteConfirmed} itemName={`installer '${installerToDelete.name}'`} loading={loading} />)}
      <InstallerFilterModal isOpen={isFilterModalOpen} onClose={() => setIsFilterModalOpen(false)} allStatesProvinces={allStatesProvinces} currentFilters={{ brands: filterBrands, productSkills: filterProductSkills, certifications: filterCertifications, states: filterStates, acceptsShipments: filterAcceptsShipments }} onApplyFilters={handleApplyFilters} onClearAllFilters={handleClearAllFilters} />
    </div>
  );
};

export default InstallerManagement;