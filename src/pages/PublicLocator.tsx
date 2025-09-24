import React, { useState, useEffect, useMemo, useRef } from "react";
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

const PublicLocator: React.FC = () => {
  const [searchedZipCode, setSearchedZipCode] = useState<string>("");
  const [selectedBrands, setSelectedBrands] = useState<InstallerBrand[]>([]);
  const [selectedProductSkills, setSelectedProductSkills] = useState<InstallerSkill[]>([]);
  const [selectedCertifications, setSelectedCertifications] = useState<InstallerCertification[]>([]);
  const [userSearchLocation, setUserSearchLocation] = useState<{ lat: number | null; lng: number | null } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState<boolean>(false);
  const [installers, setInstallers] = useState<Installer[]>([]);
  const [loadingInstallers, setLoadingInstallers] = useState<boolean>(true);
  const [installerDistancesMap, setInstallerDistancesMap] = useState<Map<string, number>>(new Map()); // Corrected this line
  const [loadingOrs, setLoadingOrs] = useState<boolean>(false);
  const [selectedInstallerId, setSelectedInstallerId] = useState<string | null>(null);
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
    if (normalizedCert.includes("motorization pro")) return "Motorization Pro";
    const validCertificationsMap: { [key: string]: InstallerCertification } = {
      "certified installer": "Certified Installer", "master installer": "Master Installer",
      "master shutter": "Shutter Pro", "drapery pro": "Drapery Pro", "pip certified": "PIP Certified",
    };
    return validCertificationsMap[normalizedCert] || null;
  };

  useEffect(() => {
    const fetchInstallers = async () => {
      setLoadingInstallers(true);
      const { data, error } = await supabase.from('installers').select('*');
      if (error) {
        console.error("Error fetching installers from Supabase:", error);
        toast.error("Failed to load installers. Please try again later.");
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
            rawSupabaseData: rawInstaller,
          };
        });
        setInstallers(mappedInstallers);
      }
      setLoadingInstallers(false);
    };
    fetchInstallers();
  }, []);

  useEffect(() => {
    const determineAndSetLocation = async () => {
      setLoadingLocation(true);
      let coords = { lat: null, lng: null };
      if (searchedZipCode) {
        coords = await getCoordinates({ searchText: searchedZipCode });
        if (coords.lat === null || coords.lng === null) toast.error("Could not find coordinates for the entered zip code.");
      } else {
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
          else toast.info("Could not determine your location. Please enter a zip code.");
        }
      }
      setUserSearchLocation(coords);
      setLoadingLocation(false);
      setSelectedInstallerId(null);
      setInstallerDistancesMap(new Map());
    };
    determineAndSetLocation();
  }, [searchedZipCode]);

  useEffect(() => {
    const fetchDrivingDistances = async () => {
      if (!userSearchLocation || userSearchLocation.lat === null || userSearchLocation.lng === null || installers.length === 0) {
        setInstallerDistancesMap(new Map());
        return;
      }
      setLoadingOrs(true);
      const validInstallers = installers.filter(i => i.latitude != null && i.longitude != null && i.id != null);
      if (validInstallers.length === 0) {
        toast.info("No installers with valid coordinates for distance calculation.");
        setInstallerDistancesMap(new Map());
        setLoadingOrs(false);
        return;
      }
      const locations = [[userSearchLocation.lng, userSearchLocation.lat], ...validInstallers.map(i => [i.longitude!, i.latitude!])];
      
      try {
        const { data, error } = await supabase.functions.invoke('openrouteservice-proxy', {
          body: { locations },
        });

        if (error) throw error;
        if (data.error) throw new Error(data.error);

        const distances = data.distances ? data.distances[0] : [];
        const newMap = new Map<string, number>();
        validInstallers.forEach((installer, index) => {
          const distanceInMeters = distances[index];
          if (distanceInMeters != null && distanceInMeters !== Infinity) {
            newMap.set(installer.id, distanceInMeters / 1609.34); // Convert meters to miles
          }
        });
        setInstallerDistancesMap(newMap);
        toast.info("Driving distances calculated.");

      } catch (error) {
        console.error("Error fetching driving distances, falling back to straight-line distance:", error);
        toast.warning("Could not calculate driving distances. Showing straight-line distances instead.");
        
        const newMap = new Map<string, number>();
        validInstallers.forEach(installer => {
          const distance = calculateDistance(
            userSearchLocation.lat!,
            userSearchLocation.lng!,
            installer.latitude!,
            installer.longitude!
          );
          newMap.set(installer.id, distance);
        });
        setInstallerDistancesMap(newMap);
      } finally {
        setLoadingOrs(false);
      }
    };

    if (userSearchLocation?.lat !== null && userSearchLocation?.lng !== null && installers.length > 0) {
      fetchDrivingDistances();
    } else {
      setInstallerDistancesMap(new Map());
    }
  }, [userSearchLocation, installers]);

  const filteredAndSortedInstallers = useMemo(() => {
    let currentInstallers = installers;
    if (selectedBrands.length > 0) currentInstallers = currentInstallers.filter(i => selectedBrands.every(b => (i.brands ?? []).includes(b)));
    if (selectedProductSkills.length > 0) currentInstallers = currentInstallers.filter(i => selectedProductSkills.every(s => (i.skills ?? []).includes(s)));
    if (selectedCertifications.length > 0) currentInstallers = currentInstallers.filter(i => selectedCertifications.every(c => (i.certifications ?? []).includes(c)));
    let installersWithDistance = currentInstallers.map(i => ({ ...i, distance: installerDistancesMap.get(i.id) ?? Infinity }));
    installersWithDistance.sort((a, b) => a.distance - b.distance);
    return installersWithDistance.filter(i => i.distance <= searchRadius);
  }, [installers, selectedBrands, selectedProductSkills, selectedCertifications, installerDistancesMap, searchRadius, userSearchLocation]);

  const handleBrandChange = (brand: InstallerBrand, checked: boolean) => setSelectedBrands(p => checked ? [...p, brand] : p.filter(b => b !== brand));
  const handleProductSkillChange = (skill: InstallerSkill, checked: boolean) => setSelectedProductSkills(p => checked ? [...p, skill] : p.filter(s => s !== skill));
  const handleCertificationChange = (certification: InstallerCertification, checked: boolean) => setSelectedCertifications(p => checked ? [...p, certification] : p.filter(c => c !== certification));
  const handleInstallerCardClick = (installerId: string) => setSelectedInstallerId(installerId);
  const handleRadiusChange = (radius: number) => setSearchRadius(radius);
  const isLoadingData = loadingInstallers || loadingLocation || loadingOrs;

  return (
    <div className="flex flex-col min-h-screen">
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 flex-grow">
        <div className="flex flex-col sm:flex-row items-center justify-center mb-8 text-center sm:text-left">
          <img src="https://upload.wikimedia.org/wikipedia/commons/a/aa/Hunter_Douglas_Logo.svg" alt="Hunter Douglas Logo" className="h-12 mb-4 sm:mb-0 sm:mr-4" />
          <h1 className="text-3xl font-bold text-gray-700">Installer Locator</h1>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <div className="p-4 border rounded-lg shadow-sm bg-card space-y-6">
              <h2 className="text-2xl font-semibold mb-4">Find Installers</h2>
              <InstallerSearch onSearch={setSearchedZipCode} />
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
            </div>
            <div className="mt-8">
              {isLoadingData ? (
                <p className="text-center text-gray-500 mt-8">
                  {loadingInstallers ? "Loading installers..." : ""}
                  {loadingLocation && searchedZipCode ? `Getting location for ${searchedZipCode}...` : ""}
                  {loadingLocation && !searchedZipCode ? "Detecting your location..." : ""}
                  {loadingOrs && userSearchLocation?.lat !== null ? "Calculating driving distances..." : ""}
                </p>
              ) : (
                <InstallerList 
                  installers={filteredAndSortedInstallers} 
                  searchedZipCode={searchedZipCode} 
                  selectedInstallerId={selectedInstallerId} 
                  onInstallerCardClick={handleInstallerCardClick} 
                  isPublicView={true}
                  searchRadius={searchRadius}
                  distanceUnit={distanceUnit}
                />
              )}
              {searchedZipCode && (!userSearchLocation || userSearchLocation.lat === null) && !loadingLocation && (
                <p className="text-center text-sm text-red-500 mt-4">Could not get coordinates for the entered zip code. Please try another.</p>
              )}
            </div>
          </div>
          <div className="lg:col-span-2">
            <div className="h-[600px] w-full rounded-lg overflow-hidden shadow-sm">
              <InstallerMapComponent userLocation={userSearchLocation} installers={filteredAndSortedInstallers} selectedInstallerId={selectedInstallerId} />
            </div>
            <div className="flex justify-end mt-4 space-x-2">
              <Button onClick={toggleCountry} variant="outline">Switch to {isCanada ? "US" : "Canada"} View</Button>
              {!sessionLoading && user && (
                <Button onClick={() => navigate("/installers")}>
                  Installer Management
                </Button>
              )}
            </div>
            {!isLoadingData && filteredAndSortedInstallers.length > 0 && (
              <InstallerSummary installers={filteredAndSortedInstallers} searchedZipCode={searchedZipCode} userLocation={userSearchLocation} showAdditionalFilters={false} selectedStatesProvinces={[]} searchRadius={searchRadius} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicLocator;