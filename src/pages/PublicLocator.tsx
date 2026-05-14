import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import InstallerSearch from "@/components/InstallerSearch";
import BrandSkillFilter from "@/components/BrandSkillFilter";
import InstallerList from "@/components/InstallerList";
import InstallerMapComponent from "@/components/InstallerMapComponent";
import { Separator } from "@/components/ui/separator";
import { run as getCoordinates } from "@/functions/getCoordinates";
import { run as getIpLocation } from "@/functions/getIpLocation";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import DistanceFilter from "@/components/DistanceFilter";
import { useCountrySettings } from "@/hooks/useCountrySettings";
import InstallerSummary from "@/components/InstallerSummary";
import { Installer, InstallerCertification, InstallerBrand, InstallerSkill } from "@/types/installer";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/components/SessionContextProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import LoadingSayings from "@/components/LoadingSayings";
import { useQuery } from "@tanstack/react-query";
import { usePublicInstallers } from "@/hooks/useInstallerData";

const PublicLocator: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [inputValue, setInputValue] = useState<string>(searchParams.get('q') || "");
  const [searchText, setSearchText] = useState<string>(searchParams.get('q') || "");
  const [searchRadius, setSearchRadius] = useState<number>(Number(searchParams.get('radius')) || 50);
  const [selectedBrands, setSelectedBrands] = useState<InstallerBrand[]>(() => (searchParams.get('brands')?.split(',') as InstallerBrand[] || []).filter(Boolean));
  const [selectedProductSkills, setSelectedProductSkills] = useState<InstallerSkill[]>(() => (searchParams.get('skills')?.split(',') as InstallerSkill[] || []).filter(Boolean));
  const [selectedCertifications, setSelectedCertifications] = useState<InstallerCertification[]>(() => (searchParams.get('certs')?.split(',') as InstallerCertification[] || []).filter(Boolean));
  const [filterAcceptsShipments, setFilterAcceptsShipments] = useState<boolean>(() => searchParams.get('shipments') === 'yes');
  const [filterMileageCovered, setFilterMileageCovered] = useState<boolean>(() => searchParams.get('mileage') === 'yes');

  const { isCanada, distanceUnit, toggleCountry } = useCountrySettings();
  const navigate = useNavigate();
  const { user, loading: sessionLoading } = useSession();

  const handleSearch = () => {
    setSearchText(inputValue);
  };

  useEffect(() => {
    const params = new URLSearchParams();
    if (searchText) params.set('q', searchText);
    if (searchRadius !== 50) params.set('radius', String(searchRadius));
    if (selectedBrands.length > 0) params.set('brands', selectedBrands.join(','));
    if (selectedProductSkills.length > 0) params.set('skills', selectedProductSkills.join(','));
    if (selectedCertifications.length > 0) params.set('certs', selectedCertifications.join(','));
    if (filterAcceptsShipments) params.set('shipments', 'yes');
    if (filterMileageCovered) params.set('mileage', 'yes');
    setSearchParams(params, { replace: true });
  }, [searchText, searchRadius, selectedBrands, selectedProductSkills, selectedCertifications, filterAcceptsShipments, filterMileageCovered, setSearchParams]);

  const { data: locationData, isLoading: loadingLocation } = useQuery({
    queryKey: ['location', searchText],
    queryFn: async () => {
      if (searchText) {
        const coords = await getCoordinates({ searchText });
        if (coords.lat === null || coords.lng === null) {
          toast.error("Could not find a location for your search. Please try again.");
        }
        return { ...coords, zipCode: coords.zipCode || "" };
      } else {
        let coords: { lat: number | null, lng: number | null } = { lat: null, lng: null };
        if (navigator.geolocation) {
          try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 }));
            coords = { lat: position.coords.latitude, lng: position.coords.longitude };
            toast.info("Your location detected via browser.");
          } catch (error: any) {
            toast.info("Could not get location from browser. Trying IP-based location...");
          }
        }
        if (coords.lat === null || coords.lng === null) {
          coords = await getIpLocation();
          if (coords.lat !== null && coords.lng !== null) toast.info("Your location detected via IP address.");
          else toast.info("Could not determine your location. Please enter a location.");
        }
        return { ...coords, zipCode: "" };
      }
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const userSearchLocation = useMemo(() => ({
    lat: locationData?.lat || null,
    lng: locationData?.lng || null,
  }), [locationData]);

  const searchedZipCode = useMemo(() => locationData?.zipCode || "", [locationData]);

  const { data: rawInstallers, isLoading: loadingInstallers } = usePublicInstallers(
    userSearchLocation,
    searchedZipCode,
    searchRadius
  );

  const toBoolean = (value: any): boolean => {
    if (typeof value === 'string') return value.toLowerCase() === '1' || value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';
    return value === 1 || value === true;
  };

  const standardizeCertificationName = (cert: string | null | undefined): InstallerCertification | null => {
    if (!cert) return null;
    const normalizedCert = cert.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalizedCert.includes("motorization pro") || normalizedCert === 'pv pro' || normalizedCert === 'powerview pro certified') {
        return "Motorization Pro";
    }
    const validCertificationsMap: { [key: string]: InstallerCertification } = {
      "certified installer": "Certified Installer", "master installer": "Master Installer",
      "master shutter": "Shutter Pro", "drapery pro": "Drapery Pro", "pip certified": "PIP Certified",
    };
    return validCertificationsMap[normalizedCert] || null;
  };

  const installers = useMemo(() => {
    if (!rawInstallers) return [];
    return (rawInstallers as any[]).map((rawInstaller: any) => {
      const skills: InstallerSkill[] = [];
      if (toBoolean(rawInstaller.blinds_and_shades)) skills.push("Blinds & Shades");
      if (toBoolean(rawInstaller.power_view)) skills.push("Automation");
      if (toBoolean(rawInstaller.shutters)) skills.push("Shutters");
      if (toBoolean(rawInstaller.draperies)) skills.push("Drapery");
      if (toBoolean(rawInstaller.service_call)) skills.push("Service Call");
      if (toBoolean(rawInstaller.tall_window)) skills.push("Tall Window");
      if (toBoolean(rawInstaller.fixture_displays)) skills.push("Fixture Displays");
      if (toBoolean(rawInstaller.outdoor)) skills.push("Outdoor");
      if (toBoolean(rawInstaller.high_voltage_hardwired)) skills.push("High Voltage Hardwired");

      const brands: InstallerBrand[] = [];
      if (toBoolean(rawInstaller.hunter_douglas)) brands.push("Hunter Douglas");
      if (toBoolean(rawInstaller.alta)) brands.push("Alta");
      if (toBoolean(rawInstaller.carole)) brands.push("Carole");
      if (toBoolean(rawInstaller.architectural)) brands.push("Architectural");
      if (toBoolean(rawInstaller.levolor)) brands.push("Levolor");
      if (toBoolean(rawInstaller.three_day_blinds)) brands.push("Three Day Blinds");

      const certifications: InstallerCertification[] = [];
      const pvCert = standardizeCertificationName(rawInstaller.powerview_certification);
      if (pvCert) certifications.push(pvCert);
      const shutterCert = standardizeCertificationName(rawInstaller.shutter_certification_level);
      if (shutterCert) certifications.push(shutterCert);
      const draperyCert = standardizeCertificationName(rawInstaller.draperies_certification_level);
      if (draperyCert) certifications.push(draperyCert);
      const pipCert = standardizeCertificationName(rawInstaller.pip_certification_level);
      if (pipCert) certifications.push(pipCert);

      return {
        id: rawInstaller.id, name: rawInstaller.name,
        address: `${rawInstaller.address1 || ''} ${rawInstaller.add2 || ''}, ${rawInstaller.city || ''}, ${rawInstaller.state || ''} ${rawInstaller.postalcode || ''}`.trim(),
        phone: rawInstaller.primary_phone, skills, brands, certifications,
        latitude: rawInstaller.latitude, longitude: rawInstaller.longitude,
        zipCode: rawInstaller.postalcode,
        installerVendorId: rawInstaller.installer_vendor_id?.toString(),
        acceptsShipments: toBoolean(rawInstaller.shipment),
        is_local_service_area: rawInstaller.is_local_service_area,
        distance: rawInstaller.distance_miles,
        rawSupabaseData: rawInstaller,
      };
    });
  }, [rawInstallers]);

  const filteredAndSortedInstallers = useMemo(() => {
    let currentInstallers = installers;
    if (selectedBrands.length > 0) currentInstallers = currentInstallers.filter(i => selectedBrands.every(b => (i.brands ?? []).includes(b)));
    if (selectedProductSkills.length > 0) currentInstallers = currentInstallers.filter(i => selectedProductSkills.every(s => (i.skills ?? []).includes(s)));
    if (selectedCertifications.length > 0) currentInstallers = currentInstallers.filter(i => selectedCertifications.every(c => (i.certifications ?? []).includes(c)));
    if (filterAcceptsShipments) currentInstallers = currentInstallers.filter(i => i.acceptsShipments === true);
    if (filterMileageCovered) currentInstallers = currentInstallers.filter(i => i.is_local_service_area === true);
    return currentInstallers;
  }, [installers, selectedBrands, selectedProductSkills, selectedCertifications, filterAcceptsShipments, filterMileageCovered]);

  const handleBrandChange = (brand: InstallerBrand, checked: boolean) => setSelectedBrands(p => checked ? [...p, brand] : p.filter(b => b !== brand));
  const handleProductSkillChange = (skill: InstallerSkill, checked: boolean) => setSelectedProductSkills(p => checked ? [...p, skill] : p.filter(s => s !== skill));
  const handleCertificationChange = (certification: InstallerCertification, checked: boolean) => setSelectedCertifications(p => checked ? [...p, certification] : p.filter(c => c !== certification));
  const handleRadiusChange = (radius: number) => setSearchRadius(radius);
  const isLoadingData = loadingInstallers || loadingLocation;

  const handleInstallerCardClick = useCallback(() => {
    // No-op for public view
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 flex-grow">
        <div className="flex flex-col sm:flex-row items-center justify-center mb-8 text-center sm:text-left">
          <img src="https://upload.wikimedia.org/wikipedia/commons/a/aa/Hunter_Douglas_Logo.svg" alt="Hunter Douglas Logo" className="h-12 mb-4 sm:mb-0 sm:mr-4" />
          <h1
            className="text-3xl font-bold text-[#5b676f]"
            style={{ fontFamily: 'Lato, system-ui, sans-serif' }}
          >
            Installer Locator
          </h1>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-6 lg:auto-rows-min">
          {/* 1. Filters card — mobile #1, desktop col 1 row 1 */}
          <div className="lg:col-start-1 lg:col-span-1 lg:row-start-1">
            <div className="lg:h-[600px]">
              <Card className="h-full flex flex-col">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-xl font-semibold">Find Installers</CardTitle>
                </CardHeader>
                <CardContent className="flex-grow space-y-3 pt-2 pb-4">
                  <InstallerSearch value={inputValue} onChange={setInputValue} onSearch={handleSearch} />
                  <DistanceFilter selectedRadius={searchRadius} onRadiusChange={handleRadiusChange} />
                  <Separator />
                  <BrandSkillFilter
                    selectedBrands={selectedBrands}
                    selectedProductSkills={selectedProductSkills}
                    selectedCertifications={selectedCertifications}
                    onBrandChange={handleBrandChange}
                    onProductSkillChange={handleProductSkillChange}
                    onCertificationChange={handleCertificationChange}
                    brandsToShow={["Hunter Douglas", "Alta"]}
                  />
                  <Separator />
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Other</h3>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="filter-accepts-shipments-public"
                          checked={filterAcceptsShipments}
                          onCheckedChange={(checked) => setFilterAcceptsShipments(checked === true)}
                        />
                        <Label htmlFor="filter-accepts-shipments-public">Accepts Shipments</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="filter-mileage-covered-public"
                          checked={filterMileageCovered}
                          onCheckedChange={(checked) => setFilterMileageCovered(checked === true)}
                        />
                        <Label htmlFor="filter-mileage-covered-public">Mileage Covered</Label>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 2. Installer list — mobile #2, desktop col 2-3 row 2 (under map) */}
          <div className="lg:col-start-2 lg:col-span-2 lg:row-start-2">
            {isLoadingData ? (
              <div className="text-center text-gray-500 mt-8">
                <LoadingSayings />
              </div>
            ) : (
              <InstallerList
                installers={filteredAndSortedInstallers}
                searchedZipCode={searchedZipCode}
                selectedInstallerId={null}
                onInstallerCardClick={handleInstallerCardClick}
                isPublicView={true}
                searchRadius={searchRadius}
                distanceUnit={distanceUnit}
              />
            )}
            {searchText && (!userSearchLocation || userSearchLocation.lat === null) && !loadingLocation && (
              <p className="text-center text-sm text-red-500 mt-4">Could not get coordinates for your search. Please try another location.</p>
            )}
          </div>

          {/* 3. Map — mobile #3, desktop col 2-3 row 1 */}
          <div className="lg:col-start-2 lg:col-span-2 lg:row-start-1">
            <div className="h-[600px] w-full rounded-lg overflow-hidden shadow-sm">
              <InstallerMapComponent
                userLocation={userSearchLocation}
                installers={filteredAndSortedInstallers}
                selectedInstallerId={null}
                isPublicView={true}
              />
            </div>
          </div>

          {/* 4. Installer summary — mobile #4, desktop col 1 row 2 (under filters) */}
          {!isLoadingData && filteredAndSortedInstallers.length > 0 && (
            <div className="lg:col-start-1 lg:col-span-1 lg:row-start-2">
              <InstallerSummary
                installers={filteredAndSortedInstallers}
                searchedZipCode={searchedZipCode}
                userLocation={userSearchLocation}
                showAdditionalFilters={false}
                selectedStatesProvinces={[]}
                searchRadius={searchRadius}
                isPublicView={true}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PublicLocator;