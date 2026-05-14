import React, { memo } from "react";
import { Card } from "@/components/ui/card";
import { Phone, MapPin, BadgeCheck } from "lucide-react";
import { Installer } from "@/types/installer";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCountrySettings } from "@/hooks/useCountrySettings";

interface InstallerCardComponentProps {
  installer: Installer;
  distance?: number;
  pinNumber?: number;
  isSelected: boolean;
  onInstallerCardClick: (id: string) => void;
  isPublicView?: boolean;
  searchedZipCode?: string;
}

const InstallerCardComponent: React.FC<InstallerCardComponentProps> = ({
  installer,
  distance,
  pinNumber: _pinNumber,
  isSelected,
  onInstallerCardClick,
  isPublicView = false,
  searchedZipCode,
}) => {
  const { distanceUnit } = useCountrySettings();

  const displayDistance = distance !== undefined && distance !== null && distance !== Infinity
    ? (distanceUnit === 'km' ? (distance * 1.60934).toFixed(1) : distance.toFixed(1))
    : undefined;

  const formattedDistance = displayDistance ? `${displayDistance} ${distanceUnit}` : undefined;

  const cityStateZip = `${installer.rawSupabaseData?.city || ''}, ${installer.rawSupabaseData?.state || ''} ${installer.zipCode || ''}`.trim().replace(/^,\s*/, '');

  const handleClick = () => {
    if (!isPublicView) {
      onInstallerCardClick(installer.id);
    }
  };

  const showMileageBadge = isPublicView && searchedZipCode && installer.is_local_service_area !== undefined;
  const hasBrands = installer.brands && installer.brands.length > 0;
  const hasSkills = installer.skills && installer.skills.length > 0;

  return (
    <Card
      className={cn(
        "w-full relative transition-all duration-200 p-4",
        isSelected && !isPublicView ? "border-sky-500 ring-2 ring-sky-500 shadow-lg" : "border-gray-200",
        isPublicView ? "cursor-default" : "cursor-pointer hover:border-gray-300"
      )}
      onClick={handleClick}
    >
      <div className="space-y-3 text-sm">
        {/* Top row: name, distance, city/state/zip, mileage badge */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <div className="flex items-baseline gap-2 min-w-0">
            <h3 className="font-semibold text-lg leading-tight truncate">{installer.name}</h3>
            {formattedDistance && (
              <span className="text-gray-600 whitespace-nowrap">
                {formattedDistance}
              </span>
            )}
          </div>
          {cityStateZip && (
            <span className="inline-flex items-center text-gray-600 whitespace-nowrap">
              <MapPin className="h-4 w-4 mr-1 text-gray-500 flex-shrink-0" aria-hidden="true" />
              {cityStateZip}
            </span>
          )}
          {showMileageBadge && (
            <Badge
              variant="default"
              className={cn(
                "ml-auto border-transparent",
                installer.is_local_service_area
                  ? "bg-green-100 text-green-800 hover:bg-green-200"
                  : "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
              )}
            >
              {installer.is_local_service_area ? "Mileage Covered" : "Mileage Charged"}
            </Badge>
          )}
        </div>

        {/* Certifications: badge-check icon + name, plain text */}
        {installer.certifications.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-700">
            {installer.certifications.map((cert) => (
              <span key={cert} className="inline-flex items-center gap-1">
                <BadgeCheck className="h-3.5 w-3.5 text-sky-600 flex-shrink-0" aria-hidden="true" />
                {cert}
              </span>
            ))}
          </div>
        )}

        {/* Admin-only details: full address, phone, vendor id, accepts shipments */}
        {!isPublicView && (
          <div className="space-y-1 text-gray-600">
            {installer.address && (
              <div className="flex items-start">
                <MapPin className="h-4 w-4 mr-2 mt-0.5 text-gray-500 flex-shrink-0" />
                <span className="break-words">{installer.address}</span>
              </div>
            )}
            {installer.phone && (
              <div className="flex items-center">
                <Phone className="h-4 w-4 mr-2 text-gray-500 flex-shrink-0" />
                <span>{installer.phone}</span>
              </div>
            )}
            {installer.installerVendorId && (
              <div className="text-gray-700">
                <span className="font-medium">Installer Vendor Id:</span> {installer.installerVendorId}
              </div>
            )}
            {installer.acceptsShipments !== undefined && (
              <div className="text-gray-700">
                <span className="font-medium">Accepts Shipments:</span> {installer.acceptsShipments ? "Yes" : "No"}
              </div>
            )}
          </div>
        )}

        {/* Brands and Product Skills, side by side */}
        {(hasBrands || hasSkills) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            {hasBrands && (
              <div>
                <h4 className="font-semibold text-sm mb-1.5">Brands</h4>
                <div className="flex flex-wrap gap-1.5">
                  {installer.brands.map((brand) => (
                    <Badge key={brand} variant="secondary" className="bg-indigo-100 text-indigo-700 border-transparent hover:bg-indigo-200">
                      {brand}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {hasSkills && (
              <div>
                <h4 className="font-semibold text-sm mb-1.5">Product Skills</h4>
                <div className="flex flex-wrap gap-1.5">
                  {installer.skills.map((skill) => (
                    <Badge key={skill} variant="secondary">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

export default memo(InstallerCardComponent);
