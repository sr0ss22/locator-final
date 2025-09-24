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
}

const InstallerSummary: React.FC<InstallerSummaryProps> = ({
  installers,
  searchedZipCode,
  userLocation,
  showAdditionalFilters,
  selectedStatesProvinces,
  searchRadius,
}) => {
  const { distanceUnit } = useCountrySettings();

  if (installers.length === 0) return null;

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
    ];

    return { brandData, productData, certificationData };
  };

  const brandColors = ["#16A34A", "#F97316"]; // Green, Orange
  const productColors = ["#3B82F6", "#8B5CF6", "#EC4899"]; // Blue, Purple, Pink
  const certificationColors = ["#0EA5E9", "#EAB308", "#6366F1"]; // Sky, Yellow, Indigo

  return (
    <Card className="mt-4 p-4 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl font-semibold">Installer Summary</CardTitle>
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
                  <h4 className="font-medium text-lg mb-3">{state} Installers ({installersInState.length}):</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <DonutChartComponent data={brandData} title="Brands Installed" colors={brandColors} />
                    <DonutChartComponent data={productData} title="Product Types" colors={productColors} />
                    <DonutChartComponent data={certificationData} title="Certifications" colors={certificationColors} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-600 mb-4">
              Showing {installers.length} installers within {searchRadius} {distanceUnit} of {searchedZipCode || "your search location"}.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <DonutChartComponent data={processSummaryData(installers).brandData} title="Brands Installed" colors={brandColors} />
              <DonutChartComponent data={processSummaryData(installers).productData} title="Product Types" colors={productColors} />
              <DonutChartComponent data={processSummaryData(installers).certificationData} title="Certifications" colors={certificationColors} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default InstallerSummary;