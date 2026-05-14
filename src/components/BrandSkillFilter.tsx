import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { InstallerCertification, InstallerBrand, InstallerSkill } from "@/types/installer";

interface BrandSkillFilterProps {
  selectedBrands: InstallerBrand[];
  selectedProductSkills: InstallerSkill[];
  selectedCertifications: InstallerCertification[];
  onBrandChange: (brand: InstallerBrand, checked: boolean) => void;
  onProductSkillChange: (skill: InstallerSkill, checked: boolean) => void;
  onCertificationChange: (certification: InstallerCertification, checked: boolean) => void;
  hideBrands?: boolean;
  brandsToShow?: InstallerBrand[];
}

const allBrands: InstallerBrand[] = ["Hunter Douglas", "Alta", "Carole", "Architectural", "Levolor", "Three Day Blinds"];
const allProductSkills: InstallerSkill[] = ["Blinds & Shades", "Shutters", "Drapery", "Automation", "Tall Window"];
const allCertifications: InstallerCertification[] = ["Motorization Pro", "Certified Installer", "Master Installer", "Shutter Pro", "Drapery Pro"];

const BrandSkillFilter: React.FC<BrandSkillFilterProps> = ({
  selectedBrands,
  selectedProductSkills,
  selectedCertifications,
  onBrandChange,
  onProductSkillChange,
  onCertificationChange,
  hideBrands = false,
  brandsToShow = allBrands,
}) => {
  return (
    <div className="space-y-4">
      {!hideBrands && (
        <div>
          <h3 className="font-semibold text-lg mb-2">Brand</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {brandsToShow.map((brand) => (
              <div key={brand} className="flex items-center space-x-2">
                <Checkbox
                  id={`brand-${brand}`}
                  checked={selectedBrands.includes(brand)}
                  onCheckedChange={(checked) => onBrandChange(brand, checked as boolean)}
                />
                <Label htmlFor={`brand-${brand}`}>{brand}</Label>
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <h3 className="font-semibold text-lg mb-2">Product Skills</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {allProductSkills.map((skill) => (
            <div key={skill} className="flex items-center space-x-2">
              <Checkbox
                id={`skill-${skill}`}
                checked={selectedProductSkills.includes(skill)}
                onCheckedChange={(checked) => onProductSkillChange(skill, checked as boolean)}
              />
              <Label htmlFor={`skill-${skill}`}>{skill}</Label>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="font-semibold text-lg mb-2">Certifications</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {allCertifications.map((cert) => (
            <div key={cert} className="flex items-center space-x-2">
              <Checkbox
                id={`cert-${cert}`}
                checked={selectedCertifications.includes(cert)}
                onCheckedChange={(checked) => onCertificationChange(cert, checked as boolean)}
              />
              <Label htmlFor={`cert-${cert}`}>{cert}</Label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BrandSkillFilter;
