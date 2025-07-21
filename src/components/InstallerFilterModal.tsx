import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import BrandSkillFilter from "./BrandSkillFilter"; // Updated import
import MultiSelect from "./MultiSelect";
import { InstallerCertification, InstallerBrand, InstallerSkill } from "@/types/installer"; // Import new types
import { Label } from "@/components/ui/label";
import { XCircle } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"; // Import RadioGroup components

interface InstallerFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  allStatesProvinces: string[];
  currentFilters: {
    brands: InstallerBrand[]; // New filter
    productSkills: InstallerSkill[]; // New filter
    certifications: InstallerCertification[];
    states: string[];
    acceptsShipments: 'any' | 'yes' | 'no';
  };
  onApplyFilters: (filters: {
    brands: InstallerBrand[]; // New filter
    productSkills: InstallerSkill[]; // New filter
    certifications: InstallerCertification[];
    states: string[];
    acceptsShipments: 'any' | 'yes' | 'no';
  }) => void;
  onClearAllFilters: () => void;
}

const InstallerFilterModal: React.FC<InstallerFilterModalProps> = ({
  isOpen,
  onClose,
  allStatesProvinces,
  currentFilters,
  onApplyFilters,
  onClearAllFilters,
}) => {
  const [tempBrands, setTempBrands] = useState<InstallerBrand[]>(currentFilters.brands); // New state
  const [tempProductSkills, setTempProductSkills] = useState<InstallerSkill[]>(currentFilters.productSkills); // New state
  const [tempCertifications, setTempCertifications] = useState<InstallerCertification[]>(currentFilters.certifications);
  const [tempStates, setTempStates] = useState<string[]>(currentFilters.states);
  const [tempAcceptsShipments, setTempAcceptsShipments] = useState<'any' | 'yes' | 'no'>(currentFilters.acceptsShipments);

  useEffect(() => {
    setTempBrands(currentFilters.brands);
    setTempProductSkills(currentFilters.productSkills);
    setTempCertifications(currentFilters.certifications);
    setTempStates(currentFilters.states);
    setTempAcceptsShipments(currentFilters.acceptsShipments);
  }, [currentFilters]);

  const handleBrandChange = (brand: InstallerBrand, checked: boolean) => {
    setTempBrands((prev) =>
      checked ? [...prev, brand] : prev.filter((b) => b !== brand)
    );
  };

  const handleProductSkillChange = (skill: InstallerSkill, checked: boolean) => {
    setTempProductSkills((prev) =>
      checked ? [...prev, skill] : prev.filter((s) => s !== skill)
    );
  };

  const handleCertificationChange = (certification: InstallerCertification, checked: boolean) => {
    setTempCertifications((prev) =>
      checked ? [...prev, certification] : prev.filter((c) => c !== certification)
    );
  };

  const handleStateChange = (states: string[]) => {
    setTempStates(states);
  };

  const handleAcceptsShipmentsChange = (value: string) => {
    setTempAcceptsShipments(value as 'any' | 'yes' | 'no');
  };

  const handleApply = () => {
    onApplyFilters({
      brands: tempBrands,
      productSkills: tempProductSkills,
      certifications: tempCertifications,
      states: tempStates,
      acceptsShipments: tempAcceptsShipments,
    });
    onClose();
  };

  const handleClear = () => {
    setTempBrands([]);
    setTempProductSkills([]);
    setTempCertifications([]);
    setTempStates([]);
    setTempAcceptsShipments('any');
    onClearAllFilters();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Filter Installers</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <BrandSkillFilter // Updated component name
            selectedBrands={tempBrands}
            selectedProductSkills={tempProductSkills}
            selectedCertifications={tempCertifications}
            onBrandChange={handleBrandChange}
            onProductSkillChange={handleProductSkillChange}
            onCertificationChange={handleCertificationChange}
          />
          <Separator />
          <div>
            <Label htmlFor="state-province-filter" className="mb-2 block font-semibold text-lg">State / Province</Label>
            <MultiSelect
              options={allStatesProvinces}
              selectedValues={tempStates}
              onValueChange={handleStateChange}
              placeholder="Select States/Provinces"
              id="state-province-filter"
            />
          </div>
          <Separator />
          <div>
            <Label className="mb-2 block font-semibold text-lg">Accepts Shipments</Label>
            <RadioGroup
              value={tempAcceptsShipments}
              onValueChange={handleAcceptsShipmentsChange}
              className="flex space-x-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="any" id="shipments-any" />
                <Label htmlFor="shipments-any">Any</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="yes" id="shipments-yes" />
                <Label htmlFor="shipments-yes">Yes</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="no" id="shipments-no" />
                <Label htmlFor="shipments-no">No</Label>
              </div>
            </RadioGroup>
          </div>
        </div>
        <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
          <Button variant="outline" onClick={handleClear}>
            <XCircle className="mr-2 h-4 w-4" /> Clear All Filters
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleApply}>
              Apply Filters
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InstallerFilterModal;