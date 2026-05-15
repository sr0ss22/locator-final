import React, { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Clock, X, Search, ChevronDown, ChevronUp } from "lucide-react"; // Added Chevron icons
import { InstallerZipAssignment, TerritoryStatus } from "@/types/territory";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input"; // Import Input component
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"; // Import Collapsible components
import { calculateDistance } from "@/utils/distance"; // Import distance utility

interface InstallerTerritoryListProps {
  // This now represents the selected assignments for the current installer
  assignedZipCodes: Array<{ zipCode: string, assignedStatus: TerritoryStatus, stateProvince: string, centroid_latitude: number | null, centroid_longitude: number | null }>;
  onZipCodeClick: (zipCode: string, stateProvince: string) => void; // To unselect from the list, now requires stateProvince
  onAddZipCode?: (zipCode: string, status: TerritoryStatus) => void; // New prop for adding a zip code
  mapClickStates: Map<string, 'green' | 'orange'>; // New prop for map highlight states
  installerLocation: { lat: number | null; lng: number | null } | null; // New: Installer's location for distance calculation
  listDisplayRadius: string | 'all'; // New: Radius to filter list items, now a string for ranges
}

const InstallerTerritoryList: React.FC<InstallerTerritoryListProps> = ({
  assignedZipCodes,
  onZipCodeClick,
  onAddZipCode,
  mapClickStates,
  installerLocation,
  listDisplayRadius,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>(""); // New state for search term
  const [isApprovedOpen, setIsApprovedOpen] = useState(false); // Changed to false (collapsed by default)
  const [isNeedsApprovalOpen, setIsNeedsApprovalOpen] = useState(false); // Changed to false (collapsed by default)

  console.log("InstallerTerritoryList: assignedZipCodes prop:", assignedZipCodes);
  console.log("InstallerTerritoryList: mapClickStates prop:", mapClickStates);
  console.log("InstallerTerritoryList: installerLocation:", installerLocation);
  console.log("InstallerTerritoryList: listDisplayRadius:", listDisplayRadius);

  const filteredAndSortedAssignedZips = useMemo(() => {
    let currentZips = assignedZipCodes;

    // Apply radius filter if a specific radius is selected and installer location is available
    if (listDisplayRadius !== 'all' && installerLocation?.lat !== null && installerLocation?.lng !== null) {
      const [minRadiusStr, maxRadiusStr] = listDisplayRadius.split('-');
      const minRadius = parseFloat(minRadiusStr);
      const maxRadius = parseFloat(maxRadiusStr);

      currentZips = currentZips.filter(zip => {
        if (zip.centroid_latitude !== null && zip.centroid_longitude !== null) {
          const distance = calculateDistance(
            installerLocation.lat!,
            installerLocation.lng!,
            zip.centroid_latitude,
            zip.centroid_longitude
          );
          // Filter for distances within the specified range (inclusive of min, exclusive of max for upper bounds except the last range)
          // For the last range (125-150), it should be inclusive of 150.
          if (listDisplayRadius === '125-150') {
            return distance >= minRadius && distance <= maxRadius;
          } else {
            return distance >= minRadius && distance < maxRadius;
          }
        }
        return false; // Exclude if centroid data is missing
      });
    }

    // Apply search term filter
    if (searchTerm) {
      currentZips = currentZips.filter(item =>
        item.zipCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.stateProvince.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Sort by zip code
    currentZips.sort((a, b) => a.zipCode.localeCompare(b.zipCode));

    return currentZips;
  }, [assignedZipCodes, searchTerm, listDisplayRadius, installerLocation]);

  const approvedZips = filteredAndSortedAssignedZips.filter(item => item.assignedStatus === 'Approved');
  const needsApprovalZips = filteredAndSortedAssignedZips.filter(item => item.assignedStatus === 'Needs Approval');

  /** Full-row counts (not search/radius filtered) — clarifies map “territories” vs assigned rows in memory. */
  const fullRowStatusCounts = useMemo(() => {
    let approved = 0;
    let needsApproval = 0;
    let other = 0;
    for (const z of assignedZipCodes) {
      if (z.assignedStatus === 'Approved') approved++;
      else if (z.assignedStatus === 'Needs Approval') needsApproval++;
      else other++;
    }
    return {
      total: assignedZipCodes.length,
      approved,
      needsApproval,
      other,
    };
  }, [assignedZipCodes]);

  const hasActiveListFilter =
    Boolean(searchTerm.trim()) || listDisplayRadius !== 'all';

  const isValidZipOrPostal = useMemo(() => {
    const usRegex = /^\d{5}$/;
    const caRegex = /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i;
    const cleanTerm = searchTerm.replace(/\s/g, '');
    return usRegex.test(cleanTerm) || caRegex.test(cleanTerm);
  }, [searchTerm]);

  const isAlreadyAssigned = useMemo(() => {
    const term = searchTerm.replace(/\s/g, '').toUpperCase();
    return assignedZipCodes.some(z => z.zipCode.replace(/\s/g, '').toUpperCase() === term);
  }, [searchTerm, assignedZipCodes]);

  const handleAdd = (status: TerritoryStatus) => {
    if (onAddZipCode && searchTerm) {
      let formattedTerm = searchTerm.trim().toUpperCase();
      // For Canada, if it's 6 characters, ensure standard format (could add space if desired, but 6 chars is fine)
      onAddZipCode(formattedTerm, status);
      setSearchTerm("");
    }
  };

  return (
    <div className="mt-6">
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
        <Input
          type="text"
          placeholder="Search ZIP code or state in assigned territories..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9 pr-3 py-2 w-full"
        />
      </div>

      <p className="text-sm text-muted-foreground mb-3">
        <span className="font-medium text-foreground">{fullRowStatusCounts.total.toLocaleString()}</span>
        {' '}assigned territories loaded
        <span className="text-muted-foreground">
          {' '}({fullRowStatusCounts.approved.toLocaleString()} free,{' '}
          {fullRowStatusCounts.needsApproval.toLocaleString()} paid
          {fullRowStatusCounts.other > 0
            ? `, ${fullRowStatusCounts.other.toLocaleString()} other status`
            : ''}
          ).
        </span>
        {hasActiveListFilter && (
          <span className="block mt-1 text-xs">
            Below: filtered view —{' '}
            <span className="font-medium tabular-nums">{filteredAndSortedAssignedZips.length.toLocaleString()}</span>
            {' '}territories match search/radius.
          </span>
        )}
      </p>

      {searchTerm && isValidZipOrPostal && !isAlreadyAssigned && onAddZipCode && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
          <div>
            <p className="text-sm font-medium text-blue-900">
              <span className="font-bold">{searchTerm.toUpperCase()}</span> is not currently assigned.
            </p>
            <p className="text-xs text-blue-700">Would you like to add it to this installer's territory?</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleAdd('Approved')}
              className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded hover:bg-green-700 transition-colors flex items-center gap-1"
            >
              Add as Free
            </button>
            <button
              onClick={() => handleAdd('Needs Approval')}
              className="px-3 py-1.5 bg-orange-600 text-white text-xs font-semibold rounded hover:bg-orange-700 transition-colors flex items-center gap-1"
            >
              Add as Paid
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Collapsible open={isApprovedOpen} onOpenChange={setIsApprovedOpen}>
          <Card className="border-green-500 shadow-md">
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-3 cursor-pointer flex flex-row items-center justify-between">
                <CardTitle className="text-lg font-semibold text-green-700 flex items-center">
                  <CheckCircle2 className="h-5 w-5 mr-2 text-green-600" /> Free Mileage ({approvedZips.length})
                </CardTitle>
                {isApprovedOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="flex flex-wrap gap-2">
                {approvedZips.length > 0 ? (
                  approvedZips.map((item) => (
                    <Badge
                      key={item.zipCode}
                      variant="default"
                      className={cn(
                        "bg-green-100 text-green-800 border-green-300 cursor-pointer hover:bg-green-200 transition-colors",
                        "flex items-center gap-1"
                      )}
                      onClick={() => onZipCodeClick(item.zipCode, item.stateProvince)}
                    >
                      {item.zipCode}
                      <X className="h-3 w-3" />
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">No free mileage territories assigned or matching search/filter.</p>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Collapsible open={isNeedsApprovalOpen} onOpenChange={setIsNeedsApprovalOpen}>
          <Card className="border-orange-500 shadow-md">
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-3 cursor-pointer flex flex-row items-center justify-between">
                <CardTitle className="text-lg font-semibold text-orange-700 flex items-center">
                  <Clock className="h-5 w-5 mr-2 text-orange-600" /> Paid Mileage ({needsApprovalZips.length})
                </CardTitle>
                {isNeedsApprovalOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="flex flex-wrap gap-2">
                {needsApprovalZips.length > 0 ? (
                  needsApprovalZips.map((item) => (
                    <Badge
                      key={item.zipCode}
                      variant="default"
                      className={cn(
                        "bg-orange-100 text-orange-800 border-orange-300 cursor-pointer hover:bg-orange-200 transition-colors",
                        "flex items-center gap-1"
                      )}
                      onClick={() => onZipCodeClick(item.zipCode, item.stateProvince)}
                    >
                      {item.zipCode}
                      <X className="h-3 w-3" />
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">No paid mileage territories assigned or matching search/filter.</p>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>
    </div>
  );
};

export default InstallerTerritoryList;