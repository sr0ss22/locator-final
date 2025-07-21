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
import { PlusCircle, Edit, Trash2, Download, Eye, Upload, Search, Loader2, ArrowUp, ArrowDown, ArrowLeft, Filter, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client"; // Updated import
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { InstallerZipAssignment, UserProfile, TerritoryStatus } from "@/types/territory"; // Updated import
import MultiSelect from "@/components/MultiSelect";
import TerritoryMap from "@/components/TerritoryMap"; // Import the new map component
import DeleteConfirmationModal from "@/components/DeleteConfirmationModal"; // Import DeleteConfirmationModal
import { Badge } from "@/components/ui/badge"; // Import Badge
import { useCountrySettings } from "@/hooks/useCountrySettings"; // Import useCountrySettings

interface TableColumn {
  key: keyof InstallerZipAssignment | 'actions' | 'field_ops_rep_name' | 'field_service_manager_name' | 'installer_name';
  header: string;
  accessor?: (assignment: InstallerZipAssignment) => React.ReactNode;
  dbColumn?: string; // Database column name for sorting
}

const getColumns = (): TableColumn[] => [
  { key: "actions", header: "Actions" },
  { key: "zip_code", header: "ZIP Code", dbColumn: "zip_code" },
  { key: "state_province", header: "State/Province", dbColumn: "state_province" },
  { key: "status", header: "Status", dbColumn: "status" },
  { 
    key: "installer_name",
    header: "Installer Name",
    accessor: (assignment) => assignment.installer_name || '-',
    dbColumn: "installer_id"
  },
  { 
    key: "field_ops_rep_name", 
    header: "Field Ops Rep", 
    accessor: (assignment) => assignment.field_ops_rep?.first_name ? `${assignment.field_ops_rep.first_name} ${assignment.field_ops_rep.last_name || ''}`.trim() : '-',
    dbColumn: "field_ops_rep_id" // Sort by ID, display name
  },
  { 
    key: "field_service_manager_name", 
    header: "Field Service Manager", 
    accessor: (assignment) => assignment.field_service_manager?.first_name ? `${assignment.field_service_manager.first_name} ${assignment.field_service_manager.last_name || ''}`.trim() : '-',
    dbColumn: "field_service_manager_id" // Sort by ID, display name
  },
  { key: "created_at", header: "Created At", dbColumn: "created_at" },
  { key: "updated_at", header: "Updated At", dbColumn: "updated_at" },
];

const defaultVisibleColumnKeys = new Set([
  "actions", "zip_code", "state_province", "status", "installer_name", "field_ops_rep_name", "field_service_manager_name"
]);

const TerritoryManagement: React.FC = () => {
  const [assignments, setAssignments] = useState<InstallerZipAssignment[]>([]); // Changed from territories
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(defaultVisibleColumnKeys); // Changed to useState
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalAssignments, setTotalAssignments] = useState(0); // Changed from totalTerritories
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [fieldOpsReps, setFieldOpsReps] = useState<UserProfile[]>([]);
  const [fieldServiceManagers, setFieldServiceManagers] = useState<UserProfile[]>([]);
  const [filterStatus, setFilterStatus] = useState<TerritoryStatus | 'all'>('all');
  const [filterStates, setFilterStates] = useState<string[]>([]);
  const [allStatesProvinces, setAllStatesProvinces] = useState<string[]>([]);
  const [allInstallers, setAllInstallers] = useState<Array<{ id: string; name: string }>>([]);
  const [filterInstallers, setFilterInstallers] = useState<string[]>([]); // Filter by installer ID

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [assignmentToDelete, setAssignmentToDelete] = useState<{ id: string; zip_code: string; installer_name: string } | null>(null); // Changed type

  const navigate = useNavigate();
  const columns = useMemo(() => getColumns(), []);
  const totalPages = Math.ceil(totalAssignments / itemsPerPage);

  const { isCanada, toggleCountry } = useCountrySettings(); // Use useCountrySettings

  const fetchUsersByRole = useCallback(async (role: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, role')
      .eq('role', role);
    if (error) {
      console.error(`Error fetching ${role}s:`, error);
      toast.error(`Failed to load ${role}s.`);
      return [];
    }
    return data || [];
  }, []);

  const fetchAllInstallers = useCallback(async () => {
    const { data, error } = await supabase
      .from('installers')
      .select('id, name');
    if (error) {
      console.error("Error fetching installers:", error);
      toast.error("Failed to load installers for filter.");
      return [];
    }
    return data || [];
  }, []);

  const fetchInstallerZipAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage - 1;

    let query = supabase
      .from('installer_zip_codes')
      .select(
        `*,
        installer:installer_id(id, name),
        field_ops_rep:field_ops_rep_id(id, first_name, last_name, role),
        field_service_manager:field_service_manager_id(id, first_name, last_name, role)
        `,
        { count: 'exact' }
      );

    if (searchTerm) {
      // Use SQL-style wildcards for ilike
      const searchPattern = `%${searchTerm}%`; 
      query = query.or([
        `zip_code.ilike.${searchPattern}`,
        `state_province.ilike.${searchPattern}`,
        `installer.name.ilike.${searchPattern}`
      ]);
    }

    if (filterStatus !== 'all') {
      query = query.filter('status', 'eq', filterStatus);
    }

    if (filterStates.length > 0) {
      query = query.in('state_province', filterStates);
    }

    if (filterInstallers.length > 0) {
      query = query.in('installer_id', filterInstallers);
    }

    if (sortColumn) {
      const columnDef = columns.find(col => col.key === sortColumn);
      const dbColumnName = columnDef?.dbColumn;
      if (dbColumnName && dbColumnName !== 'actions' && dbColumnName !== 'address') {
        query = query.order(dbColumnName, { ascending: sortDirection === "asc" });
      }
    }

    const { data, error, count } = await query.range(startIndex, endIndex);

    if (error) {
      console.error("Error fetching installer zip assignments from Supabase:", error);
      setError(`Failed to load assignments. Details: ${error.message}. Please try again.`);
      setAssignments([]);
      toast.error(`Failed to load assignments: ${error.message}`);
    } else {
      const mappedAssignments: InstallerZipAssignment[] = (data || []).map((raw: any) => ({
        id: raw.id,
        installer_id: raw.installer_id,
        zip_code: raw.zip_code,
        state_province: raw.state_province,
        status: raw.status as TerritoryStatus,
        field_ops_rep_id: raw.field_ops_rep_id,
        field_service_manager_id: raw.field_service_manager_id,
        created_at: raw.created_at,
        updated_at: raw.updated_at,
        field_ops_rep: raw.field_ops_rep,
        field_service_manager: raw.field_service_manager,
        installer_name: raw.installer?.name,
      }));
      setAssignments(mappedAssignments);
      setTotalAssignments(count || 0);

      const uniqueStates = new Set<string>();
      (data || []).forEach((assignment: any) => {
          if (assignment.state_province) {
              uniqueStates.add(assignment.state_province);
          }
      });
      setAllStatesProvinces(Array.from(uniqueStates).sort());
    }
    setLoading(false);
  }, [currentPage, itemsPerPage, searchTerm, sortColumn, sortDirection, filterStatus, filterStates, filterInstallers, columns]);

  useEffect(() => {
    fetchInstallerZipAssignments();
  }, [fetchInstallerZipAssignments]);

  useEffect(() => {
    const loadRolesAndInstallers = async () => {
      const opsReps = await fetchUsersByRole('field_ops_rep');
      const serviceManagers = await fetchUsersByRole('field_service_manager');
      const installersData = await fetchAllInstallers();
      setFieldOpsReps(opsReps);
      setFieldServiceManagers(serviceManagers);
      setAllInstallers(installersData);
    };
    loadRolesAndInstallers();
  }, [fetchUsersByRole, fetchAllInstallers]);

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
    setVisibleColumns(new Set(["actions"]));
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
    const columnDef = columns.find(col => col.key === columnKey);
    if (!columnDef?.dbColumn || columnKey === 'actions') {
      return;
    }

    if (sortColumn === columnKey) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(columnKey);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  const handleEditAssignment = (assignment: InstallerZipAssignment) => {
    // Navigate to the EditInstallerPage for the specific installer
    navigate(`/installers/edit/${assignment.installer_id}`);
    toast.info(`Editing assignment for ZIP ${assignment.zip_code} for installer ${assignment.installer_name}.`);
  };

  const confirmDeleteAssignment = (id: string, zip_code: string, installer_name: string) => {
    setAssignmentToDelete({ id, zip_code, installer_name });
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirmed = async () => {
    if (!assignmentToDelete) return;

    setLoading(true);
    const loadingToastId = toast.loading(`Deleting assignment for ZIP '${assignmentToDelete.zip_code}' for installer '${assignmentToDelete.installer_name}'...`);
    const { error } = await supabase
      .from('installer_zip_codes')
      .delete()
      .eq('id', assignmentToDelete.id); // Delete by unique ID

    if (error) {
      console.error("Error deleting assignment:", error);
      toast.error("Failed to delete assignment.", { id: loadingToastId });
    } else {
      fetchInstallerZipAssignments(); 
      toast.success("Assignment deleted successfully!", { id: loadingToastId });
    }
    setIsDeleteModalOpen(false);
    setAssignmentToDelete(null);
    setLoading(false);
  };

  // Map data for TerritoryMap component
  const memoizedAssignmentsForMap = useMemo(() => {
    return assignments.map(a => ({
      zip_code: a.zip_code,
      status: a.status,
      field_ops_rep_id: a.field_ops_rep_id,
      field_service_manager_id: a.field_service_manager_id,
      state_province: a.state_province, // Pass state_province for map
    }));
  }, [assignments]);

  // This map click handler is for the TerritoryManagement page,
  // which should not add/remove assignments directly but perhaps
  // provide a quick way to view/edit an assignment.
  // For now, it will just show a toast.
  const handleMapZipCodeClick = useCallback((zipCode: string, stateProvince: string) => {
    toast.info(`Clicked ZIP ${zipCode} (${stateProvince}). Use the table to manage assignments.`);
  }, []);

  return (
    <div className="flex flex-col min-h-screen container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <Button variant="outline" size="sm" onClick={() => navigate("/locator")} className="mr-2">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-gray-700 whitespace-nowrap">
            Territory Management
          </h1>
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              type="text"
              placeholder="Search ZIP, state, or installer..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9 pr-3 py-2 w-full"
            />
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button 
            onClick={toggleCountry} // Use toggleCountry from hook
            variant="outline"
          >
            Switch to {isCanada ? 'US' : 'Canada'} View
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Filter className="h-4 w-4 mr-2" /> Filters
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[250px] p-2">
              <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <Select value={filterStatus} onValueChange={(value: TerritoryStatus | 'all') => setFilterStatus(value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Needs Approval">Needs Approval</SelectItem>
                </SelectContent>
              </Select>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Filter by State/Province</DropdownMenuLabel>
              <MultiSelect
                options={allStatesProvinces}
                selectedValues={filterStates}
                onValueChange={setFilterStates}
                placeholder="Select States/Provinces"
                className="w-full mt-2"
              />
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Filter by Installer</DropdownMenuLabel>
              <MultiSelect
                options={allInstallers.map(i => i.name)}
                selectedValues={filterInstallers.map(id => allInstallers.find(i => i.id === id)?.name || '')}
                onValueChange={(names) => {
                  const ids = names.map(name => allInstallers.find(i => i.name === name)?.id || '');
                  setFilterInstallers(ids.filter(Boolean));
                }}
                placeholder="Select Installers"
                className="w-full mt-2"
              />
            </DropdownMenuContent>
          </DropdownMenu>

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
                  disabled={column.key === 'actions'}
                  onSelect={(e) => e.preventDefault()}
                >
                  {column.header}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Add Territory button removed as territories are now managed via installer assignments */}
          {/* <Button onClick={handleAddTerritory}>
            <PlusCircle className="h-4 w-4 mr-2" /> Add Territory
          </Button> */}
        </div>
      </div>

      <div className="mb-8 h-[600px] w-full rounded-lg overflow-hidden shadow-md border">
        <TerritoryMap
          country={isCanada ? 'Canada' : 'USA'} // Pass the country from useCountrySettings
          selectedZipCodes={[]} // No specific selection for this map, it shows all
          onZipCodeClick={handleMapZipCodeClick} // Still provide a click handler
          existingTerritories={memoizedAssignmentsForMap} // Pass all assignments for display
          highlightedZipCodes={new Map()} // No specific highlights from this page
          currentDisplayRadius="all" // Show all territories
        />
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center mt-8">
          <p className="text-red-500">{error}</p>
          <Button onClick={fetchInstallerZipAssignments} className="mt-4">Retry Loading</Button>
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
                      className={column.dbColumn && column.key !== 'actions' ? "cursor-pointer select-none" : ""}
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
                      <p className="text-gray-500 mt-2">Loading assignments...</p>
                    </TableCell>
                  </TableRow>
                ) : assignments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.filter(col => visibleColumns.has(col.key)).length} className="h-24 text-center text-gray-500">
                      {searchTerm || filterStatus !== 'all' || filterStates.length > 0 || filterInstallers.length > 0 ? "No assignments found matching your criteria." : "No installer-zip assignments found. Assign territories via Installer Management."}
                    </TableCell>
                  </TableRow>
                ) : (
                  assignments.map((assignment) => (
                    <TableRow key={assignment.id}>
                      {columns.filter(col => visibleColumns.has(col.key)).map((column) => (
                        <TableCell key={`${assignment.id}-${column.key}`}>
                          {column.key === "actions" ? (
                            <div className="flex space-x-2">
                              <Button variant="outline" size="sm" onClick={() => handleEditAssignment(assignment)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="destructive" size="sm" onClick={() => confirmDeleteAssignment(assignment.id, assignment.zip_code, assignment.installer_name || 'Unknown Installer')}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : column.accessor ? (
                            column.accessor(assignment)
                          ) : (
                            (assignment as any)[column.key]
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
      {assignmentToDelete && (
        <DeleteConfirmationModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={handleDeleteConfirmed}
          itemName={`assignment for ZIP '${assignmentToDelete.zip_code}' for installer '${assignmentToDelete.installer_name}'`}
          loading={loading}
        />
      )}
    </div>
  );
};

export default TerritoryManagement;