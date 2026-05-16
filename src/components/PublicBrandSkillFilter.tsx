import React from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { InstallerCertification, InstallerBrand, InstallerSkill } from "@/types/installer";
import { SKILL_ICON_MAP } from "@/lib/skillIcons";

interface PublicBrandSkillFilterProps {
  selectedBrands: InstallerBrand[];
  selectedProductSkills: InstallerSkill[];
  selectedCertifications: InstallerCertification[];
  onBrandsChange: (brands: InstallerBrand[]) => void;
  onProductSkillsChange: (skills: InstallerSkill[]) => void;
  onCertificationsChange: (certifications: InstallerCertification[]) => void;
  brandsToShow?: InstallerBrand[];
}

const ALL_BRANDS: InstallerBrand[] = ["Hunter Douglas", "Alta", "Carole", "Architectural", "Levolor", "Three Day Blinds"];
const ALL_PRODUCT_SKILLS: InstallerSkill[] = ["Blinds & Shades", "Shutters", "Drapery", "Automation", "Tall Window"];
const ALL_CERTIFICATIONS: InstallerCertification[] = ["Motorization Pro", "Certified Installer", "Master Installer", "Shutter Pro", "Drapery Pro"];

// Pill that slots into our wrapping ToggleGroup. Selected state uses a
// soft sky background so it reads "active" without shouting. Sizes
// (h-8 + text-sm + px-3) are also the public-locator filter's standard
// pill — keep PublicLocator's inline Distance/Other pills in sync if
// you tune this.
const pillClass =
  "h-8 px-3 text-sm rounded-full border border-input bg-transparent text-gray-700 " +
  "hover:bg-gray-50 data-[state=on]:bg-sky-50 data-[state=on]:text-sky-700 data-[state=on]:border-sky-300";

const sectionLabelClass = "text-[13px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5";
const groupClass = "flex flex-wrap items-center justify-start gap-1.5";

const PublicBrandSkillFilter: React.FC<PublicBrandSkillFilterProps> = ({
  selectedBrands,
  selectedProductSkills,
  selectedCertifications,
  onBrandsChange,
  onProductSkillsChange,
  onCertificationsChange,
  brandsToShow = ALL_BRANDS,
}) => {
  return (
    <div className="space-y-3">
      <div>
        <div className={sectionLabelClass}>Brand</div>
        <ToggleGroup
          type="multiple"
          value={selectedBrands}
          onValueChange={(value) => onBrandsChange(value as InstallerBrand[])}
          className={groupClass}
        >
          {brandsToShow.map((brand) => (
            <ToggleGroupItem key={brand} value={brand} aria-label={brand} className={pillClass}>
              {brand}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div>
        <div className={sectionLabelClass}>Product Skills</div>
        <ToggleGroup
          type="multiple"
          value={selectedProductSkills}
          onValueChange={(value) => onProductSkillsChange(value as InstallerSkill[])}
          className={groupClass}
        >
          {ALL_PRODUCT_SKILLS.map((skill) => {
            const Icon = SKILL_ICON_MAP[skill];
            return (
              <ToggleGroupItem
                key={skill}
                value={skill}
                aria-label={skill}
                className={`${pillClass} gap-1`}
              >
                {Icon && <Icon className="h-4 w-4" />}
                <span>{skill}</span>
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </div>

      <div>
        <div className={sectionLabelClass}>Certifications</div>
        <ToggleGroup
          type="multiple"
          value={selectedCertifications}
          onValueChange={(value) => onCertificationsChange(value as InstallerCertification[])}
          className={groupClass}
        >
          {ALL_CERTIFICATIONS.map((cert) => (
            <ToggleGroupItem key={cert} value={cert} aria-label={cert} className={pillClass}>
              {cert}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  );
};

export default PublicBrandSkillFilter;
