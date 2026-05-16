import React from "react";
import InstallerCardComponent from "./InstallerCardComponent";
import { Installer } from "@/types/installer";

interface InstallerListProps {
  installers: (Installer & { distance?: number })[];
  searchedZipCode: string;
  selectedInstallerId: string | null;
  onInstallerCardClick: (installerId: string) => void;
  isPublicView?: boolean;
  searchRadius: number;
  distanceUnit: 'miles' | 'km';
  // Internal locator only — forwarded straight to each card so the
  // per-row "View coverage" map icon can drive the overlay filter.
  onViewCoverage?: (installerId: string) => void;
  activeCoverageInstallerId?: string | null;
}

const InstallerList: React.FC<InstallerListProps> = ({ installers, searchedZipCode, selectedInstallerId, onInstallerCardClick, isPublicView = false, searchRadius, distanceUnit, onViewCoverage, activeCoverageInstallerId }) => {
  const displayRadius = distanceUnit === 'km' ? Math.round(searchRadius * 1.60934) : searchRadius;

  if (installers.length === 0 && searchedZipCode) {
    return (
      <p className="text-center text-gray-500 mt-8">
        No installers found within {displayRadius} {distanceUnit}. Try expanding the search radius or changing filters.
      </p>
    );
  } else if (installers.length === 0) {

    return (
      <p className="text-center text-gray-500 mt-8">
        Enter a zip code and select filters to find installers.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      {installers.map((installer, index) => (
        <InstallerCardComponent
          key={installer.id}
          installer={installer}
          distance={installer.distance}
          pinNumber={index + 1}
          isSelected={installer.id === selectedInstallerId}
          onInstallerCardClick={onInstallerCardClick}
          isPublicView={isPublicView}
          searchedZipCode={searchedZipCode}
          onViewCoverage={onViewCoverage}
          activeCoverageInstallerId={activeCoverageInstallerId}
        />
      ))}
    </div>
  );
};

export default InstallerList;