import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, MapPin } from "lucide-react";
import { Installer } from "@/types/installer";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCountrySettings } from "@/hooks/useCountrySettings"; // Import the hook

interface InstallerCardComponentProps {
  installer: Installer;
  distance?: number; // This distance is always in miles
  pinNumber?: number;
  isSelected: boolean;
  onClick: () => void;
  isPublicView?: boolean; // New prop to control public view display
}

const InstallerCardComponent: React.FC<InstallerCardComponentProps> = ({ installer, distance, pinNumber, isSelected, onClick, isPublicView = false }) => {
  const { distanceUnit } = useCountrySettings();

  const displayDistance = distance !== undefined && distance !== null && distance !== Infinity
    ? (distanceUnit === 'km' ? (distance * 1.60934).toFixed(1) : distance.toFixed(1))
    : undefined;

  const formattedDistance = displayDistance ? `${displayDistance} ${distanceUnit}` : undefined;

  // Determine the address to display based on isPublicView
  const addressToDisplay = isPublicView
    ? `${installer.rawSupabaseData?.city || ''}, ${installer.rawSupabaseData?.state || ''} ${installer.zipCode || ''}`.trim()
    : installer.address;

  return (
    <Card 
      className={cn(
        "w-full max-w-md relative cursor-pointer transition-all duration-200",
        isSelected ? "border-orange-500 ring-2 ring-orange-500 shadow-lg" : "border-gray-200 hover:border-gray-300"
      )}
      onClick={onClick}
    >
      <CardHeader className="relative">
        {pinNumber && (
          <Badge className="absolute top-2 right-2 bg-orange-500 text-white text-lg px-3 py-1 rounded-full z-10">
            {pinNumber}
          </Badge>
        )}
        <CardTitle className="flex flex-col items-start pr-10">
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
        <div className="flex items-center text-gray-600">
          <MapPin className="h-4 w-4 mr-2 text-gray-500" />
          <span>{addressToDisplay}</span>
        </div>
        {!isPublicView && ( // Conditionally hide phone for public view
          <div className="flex items-center text-gray-600">
            <Phone className="h-4 w-4 mr-2 text-gray-500" />
            <span>{installer.phone}</span>
          </div>
        )}
        {formattedDistance && (
          <div className="font-medium text-blue-600">
            Distance: {formattedDistance}
          </div>
        )}
        {!isPublicView && installer.installerVendorId && ( // Conditionally hide installerVendorId for public view
          <div className="text-gray-700">
            <span className="font-medium">Installer Vendor Id:</span> {installer.installerVendorId}
          </div>
        )}

        {/* Brands Section */}
        {installer.brands && installer.brands.length > 0 && (
          <div>
            <h4 className="font-semibold text-base mb-2">Brands:</h4>
            <div className="flex flex-wrap gap-2">
              {installer.brands.map((brand) => (
                <Badge key={brand} variant="secondary" className="bg-purple-100 text-purple-800 border-purple-300">{brand}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Skills Section - now using the processed 'skills' array from the installer object */}
        {installer.skills && installer.skills.length > 0 && (
          <div>
            <h4 className="font-semibold text-base mb-2">Product Skills:</h4>
            <div className="flex flex-wrap gap-2">
              {installer.skills.map((skill) => (
                <Badge key={skill} variant="default">{skill}</Badge>
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
    </Card>
  );
};

export default InstallerCardComponent;