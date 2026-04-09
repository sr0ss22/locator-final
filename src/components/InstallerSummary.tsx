import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Installer } from "@/types/installer";
import { useCountrySettings } from "@/hooks/useCountrySettings";
import DonutChartComponent from "@/components/DonutChartComponent";

interface InstallerSummaryProps {
  installers: (Installer & { distance?: number })[];
  searchedZipCode: string;
  userLocation: { lat: number | null; lng: number | null } | null;
  showAdditionalFilters: boolean;
  selectedStatesProvinces: string[];
  searchRadius: number;
  isPublicView?: boolean; // New prop to distinguish between public and internal views
}

const InstallerSummary: React.FC<InstallerSummaryProps> = ({
  installers,
  searchedZipCode,
  userLocation,
  showAdditionalFilters,
  selectedStatesProvinces,
  searchRadius,
  isPublicView = false, // Default to false
}) => {
  const { distanceUnit } = useCountrySettings();

  if (installers.length === 0) return null;

  const displayRadius = distanceUnit === 'km' ? Math.round(searchRadius * 1.60934) : searchRadius;

  const processSummaryData = (installerList: Installer[]) => {
    const brandData = [
      { name: 'Hunter Douglas', value: installerList.filter(i => i.brands.includes("Hunter Douglas")).length },
      { name: 'Alta', value: installerList.filter(i => i.brands.includes("Alta")).length },
    ];

    const productData = [
      { name: 'Blinds/Shades', value: installerList.filter(i => i.skills.includes("Blinds & Shades")).length },
      { name: 'Shutters', value: installerList.filter(i => i.skills.includes("Shutters")).length },
      { name: 'Automation', value: installerList.filter(i => i.skills.includes("Automation")).length },
    ];

    const certificationData = [
      { name: 'Certified', value: installerList.filter(i => i.certifications.includes("Certified Installer") || i.certifications.includes("Master Installer")).length },
      { name: 'ShutterPro', value: installerList.filter(i => i.certifications.includes("Shutter Pro")).length },
      { name: 'DraperyPro', value: installerList.filter(i => i.certifications.includes("Drapery Pro")).length },
      { name: 'Motorization Pro', value: installerList.filter(i => i.certifications.includes("Motorization Pro")).length },
    ];

    const mileageData = [
      { name: 'Mileage Covered', value: installerList.filter(i => i.is_local_service_area).length },
      { name: 'Mileage Charged', value: installerList.filter(i => !i.is_local_service_area).length },
    ];

    return { brandData, productData, certificationData, mileageData };
  };

  const chartColors = ["#0EA5E9", "#94a3b8", "#6366F1", "#FACC15"]; // Sky Blue, Slate Gray, Indigo, Yellow
  const mileageChartColors = ["#22C55E", "#FBBF24"]; // Green, Yellow

  return (
    <Card className="mt-4 p-4 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div>
          <CardTitle className="text-xl font-semibold">Installer Summary</CardTitle>
          {!showAdditionalFilters && (
            <p className="text-sm text-gray-600 mt-1">
              Showing {installers.length} installers within {displayRadius} {distanceUnit} of {searchedZipCode || "your search location"}.
            </p>
          )}
        </div>

        {!showAdditionalFilters && (
          <div className="text-right">
            <p className="text-sm font-medium text-gray-600">Total Installers</p>
            <p className="text-4xl font-bold text-sky-500">{installers.length}</p>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {showAdditionalFilters && selectedStatesProvinces.length > 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Showing installers filtered by selected states/provinces.</p>
            {selectedStatesProvinces.map((state) => {
              const installersInState = installers.filter((i) => i.rawSupabaseData?.state === state);
              if (installersInState.length === 0) return null;
              const { brandData, productData, certificationData } = processSummaryData(installersInState);
              
              return (
                <div key={state} className="border-t pt-4 first:border-t-0 first:pt-0">
                  <div className="flex flex-row items-start justify-between">
                    <h4 className="font-medium text-lg mb-3">{state} Installers:</h4>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-600">Total Installers</p>
                      <p className="text-4xl font-bold text-sky-500">{installersInState.length}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <DonutChartComponent data={brandData} title="Brands" colors={chartColors} />
                    <DonutChartComponent data={productData} title="Skills" colors={chartColors} />
                    <DonutChartComponent data={certificationData} title="Certifications" colors={chartColors} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            <DonutChartComponent data={processSummaryData(installers).brandData} title="Brands" colors={chartColors} />
            <DonutChartComponent data={processSummaryData(installers).productData} title="Skills" colors={chartColors} />
            {isPublicView && searchedZipCode ? (
              <DonutChartComponent data={processSummaryData(installers).mileageData} title="Mileage Coverage" colors={mileageChartColors} />
            ) : (
              <DonutChartComponent data={processSummaryData(installers).certificationData} title="Certifications" colors={chartColors} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default InstallerSummary;