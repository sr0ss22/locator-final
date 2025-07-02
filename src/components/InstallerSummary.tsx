import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Installer } from "@/types/installer";
import { useCountrySettings } from "@/hooks/useCountrySettings";

interface InstallerSummaryProps {
  installers: (Installer & { distance?: number })[];
  searchedZipCode: string;
  userLocation: { lat: number | null; lng: number | null } | null;
  showAdditionalFilters: boolean;
  selectedStatesProvinces: string[];
  searchRadius: number; // Always in miles
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

  // Helper to count installers by a specific brand
  const countByBrand = (list: Installer[], brand: string) =>
    list.filter((i) => i.brands.includes(brand)).length;

  // Helper to count installers by a specific product skill
  const countByProductSkill = (list: Installer[], skill: string) =>
    list.filter((i) => i.skills.includes(skill)).length;

  // Calculate common certification counts
  const countCertifiedInstallers = (list: Installer[]) =>
    list.filter((i) => i.certifications.includes("Certified Installer")).length;
  const countMotorizationPro = (list: Installer[]) => // Renamed
    list.filter((i) => i.certifications.includes("Motorization Pro")).length; // Renamed
  const countShutterPro = (list: Installer[]) =>
    list.filter((i) => i.certifications.includes("Shutter Pro")).length;
  const countDraperyPro = (list: Installer[]) =>
    list.filter((i) => i.certifications.includes("Drapery Pro")).length;

  if (installers.length === 0) {
    return null; // Don't show summary if no installers are found
  }

  return (
    <Card className="mt-4 p-4 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl font-semibold">Installer Summary</CardTitle>
      </CardHeader>
      <CardContent>
        {showAdditionalFilters && selectedStatesProvinces.length > 0 ? (
          // Summary by State/Province
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Showing installers filtered by selected states/provinces.
            </p>
            {selectedStatesProvinces.map((state) => {
              const installersInState = installers.filter(
                (i) => i.rawSupabaseData?.state === state
              );
              return (
                <div key={state} className="border-t pt-4 first:border-t-0 first:pt-0">
                  <h4 className="font-medium text-lg mb-3">{state} Installers:</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Installers</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-orange-500">{installersInState.length}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Hunter Douglas</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="2xl font-bold">{countByBrand(installersInState, "Hunter Douglas")}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Automation</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{countByProductSkill(installersInState, "Motorization")}</div>
                      </CardContent>
                    </Card>
                    {/* Empty div for spacing */}
                    <div className="hidden lg:block"></div> 
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Shutter Pro</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{countShutterPro(installersInState)}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Drapery Pro</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{countDraperyPro(installersInState)}</div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // Summary by Distance
          <div className="space-y-2">
            <p className="text-sm text-gray-600 mb-4">
              Showing installers within {searchRadius}{" "}
              {distanceUnit} of {searchedZipCode || "your search location"}.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Installers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-500">{installers.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Hunter Douglas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{countByBrand(installers, "Hunter Douglas")}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Automation</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{countByProductSkill(installers, "Motorization")}</div>
                </CardContent>
              </Card>
              {/* Empty div for spacing */}
              <div className="hidden lg:block"></div> 
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Shutter Pro</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{countShutterPro(installers)}</div>
                  </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Drapery Pro</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{countDraperyPro(installers)}</div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default InstallerSummary;