import React, { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, MapPin } from "lucide-react";
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

const InstallerCardComponent: React.FC<InstallerCardComponentProps> = ({ installer, distance, pinNumber, isSelected, onInstallerCardClick, isPublicView = false, searchedZipCode }) => {
  const { distanceUnit } = useCountrySettings();

  const displayDistance = distance !== undefined && distance !== null && distance !== Infinity
    ? (distanceUnit === 'km' ? (distance * 1.60934).toFixed(1) : distance.toFixed(1))
    : undefined;

  const formattedDistance = displayDistance ? `${displayDistance} ${distanceUnit}` : undefined;

  const addressToDisplay = isPublicView
    ? `${installer.rawSupabaseData?.city || ''}, ${installer.rawSupabaseData?.state || ''} ${installer.zipCode || ''}`.trim()
    : installer.address;

  const handleClick = () => {
    if (!isPublicView) {
      onInstallerCardClick(installer.id);
    }
  };

  return (
    <Card 
      className={cn(
        "w-full max-w-md relative transition-all duration-200",
        isSelected && !isPublicView ? "border-sky-500 ring-2 ring-sky-500 shadow-lg" : "border-gray-200",
        isPublicView ? "cursor-default" : "cursor-pointer hover:border-gray-300"
      )}
      onClick={handleClick}
    >
      <CardHeader>
        <CardTitle className="flex flex-col items-start">
          <span className="mb-2">{installer.name}</span>
          <div className="flex flex-wrap gap-2">
            {installer.certifications.map((cert) => (
              <Badge key={cert} variant="outline" className="bg-blue-100 text-blue-800 border-blue-300">
                {cert}
              </Badge>
            ))}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-start justify-between text-gray-600">
          <div className="flex items-center">
            <MapPin className="h-4 w-4 mr-2 text-gray-500 flex-shrink-0" />
            <span>{addressToDisplay}</span>
          </div>
          {formattedDistance && (
            <div className="font-medium text-blue-600 ml-4 whitespace-nowrap">
              {formattedDistance}
            </div>
          )}
        </div>
        {!isPublicView && (
          <div className="flex items-center text-gray-600">
            <Phone className="h-4 w-4 mr-2 text-gray-500" />
            <span>{installer.phone}</span>
          </div>
        )}
        {!isPublicView && installer.installerVendorId && (
          <div className="text-gray-700">
            <span className="font-medium">Installer Vendor Id:</span> {installer.installerVendorId}
          </div>
        )}
        {installer.brands && installer.brands.length > 0 && (
          <div>
            <h4 className="font-semibold text-base mb-2">Brands:</h4>
            <div className="flex flex-wrap gap-2">
              {installer.brands.map((brand) => (
                <Badge key={brand} variant="secondary" className="bg-indigo-100 text-indigo-700 border-indigo-700">{brand}</Badge>
              ))}
            </div>
          </div>
        )}
        {installer.skills && installer.skills.length > 0 && (
          <div>
            <h4 className="font-semibold text-base mb-2">Product Skills:</h4>
            <div className="flex flex-wrap gap-2">
              {installer.skills.map((skill) => (
                <Badge key={skill} variant="secondary" className="border-border">{skill}</Badge>
              ))}
            </div>
          </div>
        )}
        {installer.acceptsShipments !== undefined && (
          <div className="text-gray-700">
            <span className="font-medium">Accepts Shipments :</span> {installer.acceptsShipments ? "Yes" : "No"}
          </div>
        )}
      </CardContent>
      {isPublicView && searchedZipCode && installer.is_local_service_area !== undefined && (
        <div className="absolute bottom-4 right-4">
          {installer.is_local_service_area ? (
            <Badge variant="default" className="bg-green-100 text-green-800 border-green-300 hover:bg-green-200">
              Mileage Covered
            </Badge>
          ) : (
            <Badge variant="default" className="bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200">
              Mileage Charged
            </Badge>
          )}
        </div>
      )}
    </Card>
  );
};

export default memo(InstallerCardComponent);