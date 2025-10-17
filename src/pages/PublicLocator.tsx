import React, { useState, useEffect, useMemo, useCallback } from "react";
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
import { useNavigate } from "react-router-dom"; // Import useNavigate
import { useSession } from "@/components/SessionContextProvider"; // Import useSession
import { Button } from "@/components/ui/button"; // Ensure Button is imported
import { calculateDistance } from "@/utils/distance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PublicLocator: React.FC = () => {
  const [searchText, setSearchText] = useState<string>("");
  const [searchedZipCode, setSearchedZipCode] = useState<string>("");
  const [selectedBrands, setSelectedBrands] = useState<InstallerBrand[]>([]);
  const [selectedProductSkills, setSelectedProductSkills] = useState<InstallerSkill[]>([]);
  const [selectedCertifications, setSelectedCertifications] = useState<InstallerCertification[]>([]);
  const [userSearchLocation, setUserSearchLocation] = useState<{ lat: number | null; lng: number | null } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState<boolean>(false);
  const [installers, setInstallers] = useState<Installer[]>([]);
  const [loadingInstallers, setLoadingInstallers] = useState<boolean>(false);
  const [searchRadius, setSearchRadius] = useState<number>(50);
  const { isCanada, distanceUnit, toggleCountry } = useCountrySettings(); // Destructure toggleCountry
  const navigate = useNavigate(); // Initialize useNavigate
  const { user, loading: sessionLoading } = useSession(); // Get user and session loading state

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

  useEffect(() => {
    const determineAndSetLocation = async () => {
      setLoadingLocation(true);
      let coords = { lat: null, lng: null, zipCode: null };
      if (searchText) {
        coords = await getCoordinates({ searchText });
        if (coords.lat === null || coords.lng === null) {
          toast.error("Could not find a location for your search. Please try again.");
        }
        setSearchedZipCode(coords.zipCode || "");
      } else {
        if (navigator.geolocation) {
          try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 }));
            coords = { lat: position.coords.latitude, lng: position.coords.longitude, zipCode: null };
            toast.info("Your location detected via browser.");
          } catch (error: any) {
            toast.info("Could not get location from browser. Trying IP-based location...");
          }
        }
        if (coords.lat === null || coords.lng === null) {
          coords = { ...(await getIpLocation()), zipCode: null };
          if (coords.lat !== null && coords.lng !== null) toast.info("Your location detected via IP address.");
          else toast.info("Could not determine your location. Please enter a location.");
        }
      }
      setUserSearchLocation({ lat: coords.lat, lng: coords.lng });
      setLoadingLocation(false);
    };
    determineAndSetLocation();
  }, [searchText]);

  useEffect(() => {
    const fetchInstallersForLocation = async () => {
      if (!userSearchLocation?.lat || !userSearchLocation?.lng) {
        setInstallers([]);
        return;
      }

      setLoadingInstallers(true);
      
      const { data, error } = await supabase.rpc('find_installers_for_public_locator', {
        search_lat: userSearchLocation.lat,
        search_lng: userSearchLocation.lng,
        search_zip: searchedZipCode,
        radius_miles: searchRadius
      });

      if (error) {
        console.error("Error fetching installers via RPC:", error);
        toast.error("Failed to find installers. Please try again.");
        setInstallers([]);
      } else {
        const mappedInstallers: Installer[] = (data || []).map((rawInstaller: any) => {
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
        setInstallers(mappedInstallers);
      }
      setLoadingInstallers(false);
    };

    fetchInstallersForLocation();
  }, [userSearchLocation, searchedZipCode, searchRadius]);

  const filteredAndSortedInstallers = useMemo(() => {
    let currentInstallers = installers;
    if (selectedBrands.length > 0) currentInstallers = currentInstallers.filter(i => selectedBrands.every(b => (i.brands ?? []).includes(b)));
    if (selectedProductSkills.length > 0) currentInstallers = currentInstallers.filter(i => selectedProductSkills.every(s => (i.skills ?? []).includes(s)));
    if (selectedCertifications.length > 0) currentInstallers = currentInstallers.filter(i => selectedCertifications.every(c => (i.certifications ?? []).includes(c)));
    return currentInstallers;
  }, [installers, selectedBrands, selectedProductSkills, selectedCertifications]);

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
          <h1 className="text-3xl font-bold text-gray-700">Installer Locator</h1>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-8">
            <div className="h-[600px]">
              <Card className="h-full flex flex-col">
                <CardHeader>
                  <CardTitle className="text-2xl font-semibold">Find Installers</CardTitle>
                </CardHeader>
                <CardContent className="flex-grow overflow-y-auto space-y-6">
                  <InstallerSearch onSearch={setSearchText} />
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
                </CardContent>
              </Card>
            </div>
            <div className="space-y-4">
              {isLoadingData ? (
                <p className="text-center text-gray-500 mt-8">
                  {loadingInstallers ? "Loading installers..." : ""}
                  {loadingLocation && searchText ? `Getting location for ${searchText}...` : ""}
                  {loadingLocation && !searchText ? "Detecting your location..." : ""}
                </p>
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
          </div>
          <div className="lg:col-span-2 space-y-8">
            <div className="h-[600px] w-full rounded-lg overflow-hidden shadow-sm">
              <InstallerMapComponent 
                userLocation={userSearchLocation} 
                installers={filteredAndSortedInstallers} 
                selectedInstallerId={null}
                isPublicView={true}
              />
            </div>
            {!isLoadingData && filteredAndSortedInstallers.length > 0 && (
              <InstallerSummary 
                installers={filteredAndSortedInstallers} 
                searchedZipCode={searchedZipCode} 
                userLocation={userSearchLocation} 
                showAdditionalFilters={false} 
                selectedStatesProvinces={[]} 
                searchRadius={searchRadius}
                isPublicView={true}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicLocator;