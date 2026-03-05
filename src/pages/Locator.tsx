import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import InstallerSearch from "@/components/InstallerSearch";
import BrandSkillFilter from "@/components/BrandSkillFilter";
import InstallerList from "@/components/InstallerList";
import InstallerMapComponent from "@/components/InstallerMapComponent";
import { Installer, InstallerCertification, InstallerBrand, InstallerSkill } from "@/types/installer";
import { Separator } from "@/components/ui/separator";
import { run as getCoordinates } from "@/functions/getCoordinates";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import DistanceFilter from "@/components/DistanceFilter";
import { useCountrySettings } from "@/hooks/useCountrySettings";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import MultiSelect from "@/components/MultiSelect";
import InstallerSummary from "@/components/InstallerSummary";
import { calculateDistance } from "@/utils/distance";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import LoadingSayings from "@/components/LoadingSayings";

const Locator: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [inputValue, setInputValue] = useState<string>(searchParams.get('q') || "");
  const [searchedZipCode, setSearchedZipCode] = useState<string>(searchParams.get('q') || "");
  const [searchRadius, setSearchRadius] = useState<number>(Number(searchParams.get('radius')) || 50);
  const [showAdditionalFilters, setShowAdditionalFilters] = useState<boolean>(searchParams.get('showAdditionalFilters') === 'true');
  const [filterBrands, setFilterBrands] = useState<InstallerBrand[]>(() => (searchParams.get('brands')?.split(',') as InstallerBrand[] || []).filter(Boolean));
  const [filterProductSkills, setFilterProductSkills] = useState<InstallerSkill[]>(() => (searchParams.get('skills')?.split(',') as InstallerSkill[] || []).filter(Boolean));
  const [filterCertifications, setFilterCertifications] = useState<InstallerCertification[]>(() => (searchParams.get('certs')?.split(',') as InstallerCertification[] || []).filter(Boolean));
  const [filterStates, setFilterStates] = useState<string[]>(() => (searchParams.get('states')?.split(',') || []).filter(Boolean));
  const [filterAcceptsShipments, setFilterAcceptsShipments] = useState<'any' | 'yes' | 'no'>(() => (searchParams.get('shipments') as 'any' | 'yes' | 'no') || 'any');

  const [userLocation, setUserLocation] = useState<{ lat: number | null; lng: number | null } | null>(null);
  const [installers, setInstallers] = useState<Installer[]>([]);
  const [loadingInstallers, setLoadingInstallers] = useState<boolean>(true);
  const [loadingUserLocation, setLoadingUserLocation] = useState<boolean>(false);
  const [installerDistancesMap, setInstallerDistancesMap] = useState<Map<string, number>>(new Map());
  const [loadingOrs, setLoadingOrs] = useState<boolean>(false);
  const [selectedInstallerId, setSelectedInstallerId] = useState<string | null>(null);
  const [allStatesProvinces, setAllStatesProvinces] = useState<string[]>([]);
  const navigate = useNavigate();
  const { isCanada, distanceUnit, toggleCountry } = useCountrySettings();

  const handleSearch = () => {
    setSearchedZipCode(inputValue);
  };

  useEffect(() => {
    const params = new URLSearchParams();
    if (searchedZipCode) params.set('q', searchedZipCode);
    if (searchRadius !== 50) params.set('radius', String(searchRadius));
    if (showAdditionalFilters) params.set('showAdditionalFilters', 'true');
    if (filterBrands.length > 0) params.set('brands', filterBrands.join(','));
    if (filterProductSkills.length > 0) params.set('skills', filterProductSkills.join(','));
    if (filterCertifications.length > 0) params.set('certs', filterCertifications.join(','));
    if (filterStates.length > 0) params.set('states', filterStates.join(','));
    if (filterAcceptsShipments !== 'any') params.set('shipments', filterAcceptsShipments);
    setSearchParams(params, { replace: true });
  }, [searchedZipCode, searchRadius, showAdditionalFilters, filterBrands, filterProductSkills, filterCertifications, filterStates, filterAcceptsShipments, setSearchParams]);

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
            zipCode: rawInstaller.postalcode, phone: rawInstaller.primary_phone, email: rawInstaller.email,
            skills, brands, certifications,
            latitude: rawInstaller.latitude, longitude: rawInstaller.longitude,
            installerVendorId: rawInstaller.installer_vendor_id?.toString(),
            acceptsShipments: toBoolean(rawInstaller.shipment),
            rawSupabaseData: rawInstaller,
          };
        });
        setInstallers(mappedInstallers);
        const uniqueStates = new Set<string>();
        (data || []).forEach((rawInstaller: any) => { if (rawInstaller.state) uniqueStates.add(rawInstaller.state); });
        setAllStatesProvinces(Array.from(uniqueStates).sort());
      }
      setLoadingInstallers(false);
    };
    fetchInstallers();
  }, []);

  useEffect(() => {
    const fetchUserLocation = async () => {
      if (searchedZipCode) {
        setLoadingUserLocation(true);
        setInstallerDistancesMap(new Map());
        const coords = await getCoordinates({ searchText: searchedZipCode });
        setUserLocation(coords);
        setLoadingUserLocation(false);
        if (coords.lat === null || coords.lng === null) {
          toast.error("Could not find coordinates for the entered zip code. Please ensure it's valid.");
        }
      } else {
        setUserLocation(null);
        setInstallerDistancesMap(new Map());
      }
      setSelectedInstallerId(null);
    };
    if (!showAdditionalFilters || selectedStatesProvinces.length === 0) {
      fetchUserLocation();
    } else {
      setUserLocation(null);
      setInstallerDistancesMap(new Map());
    }
  }, [searchedZipCode, showAdditionalFilters, selectedStatesProvinces]);

  useEffect(() => {
    const fetchDrivingDistances = async () => {
      if (!userLocation || userLocation.lat === null || userLocation.lng === null || !installers.length) {
        setInstallerDistancesMap(new Map());
        return;
      }
      setLoadingOrs(true);
      setInstallerDistancesMap(new Map());
      const validInstallers = installers.filter(i => i.latitude != null && i.longitude != null && i.id != null);
      if (validInstallers.length === 0) {
        toast.info("No installers with valid coordinates for distance calculation.");
        setInstallerDistancesMap(new Map());
        setLoadingOrs(false);
        return;
      }
      const locations = [[userLocation.lng, userLocation.lat], ...validInstallers.map(i => [i.longitude!, i.latitude!])];
      
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
            userLocation.lat!,
            userLocation.lng!,
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

    if (!showAdditionalFilters || selectedStatesProvinces.length === 0) {
      if (searchedZipCode && userLocation?.lat !== null && userLocation?.lng !== null && installers.length > 0) {
        fetchDrivingDistances();
      } else {
        setInstallerDistancesMap(new Map());
      }
    } else {
      setInstallerDistancesMap(new Map());
    }
  }, [userLocation, installers, searchedZipCode, showAdditionalFilters, selectedStatesProvinces]);

  const filteredAndSortedInstallers = useMemo(() => {
    let currentInstallers = installers;
    if (selectedBrands.length > 0) currentInstallers = currentInstallers.filter(i => selectedBrands.every(b => (i.brands ?? []).includes(b)));
    if (selectedProductSkills.length > 0) currentInstallers = currentInstallers.filter(i => selectedProductSkills.every(s => (i.skills ?? []).includes(s)));
    if (selectedCertifications.length > 0) currentInstallers = currentInstallers.filter(i => selectedCertifications.every(c => (i.certifications ?? []).includes(c)));
    
    if (showAdditionalFilters) {
      if (selectedStatesProvinces.length > 0) {
        currentInstallers = currentInstallers.filter(i => i.rawSupabaseData?.state && selectedStatesProvinces.includes(i.rawSupabaseData.state));
      }
      if (filterAcceptsShipments === 'yes') {
        currentInstallers = currentInstallers.filter(i => i.acceptsShipments);
      } else if (filterAcceptsShipments === 'no') {
        currentInstallers = currentInstallers.filter(i => !i.acceptsShipments);
      }
    }

    if (showAdditionalFilters && selectedStatesProvinces.length > 0) {
      return currentInstallers;
    }

    let installersWithDistance = currentInstallers.map(i => ({ ...i, distance: installerDistancesMap.get(i.id) ?? Infinity }));
    installersWithDistance.sort((a, b) => a.distance - b.distance);
    return installersWithDistance.filter(i => i.distance <= searchRadius);
  }, [installers, selectedBrands, selectedProductSkills, selectedCertifications, installerDistancesMap, searchRadius, showAdditionalFilters, selectedStatesProvinces, filterAcceptsShipments]);

  const handleBrandChange = (brand: InstallerBrand, checked: boolean) => setSelectedBrands(p => checked ? [...p, brand] : p.filter(b => b !== brand));
  const handleProductSkillChange = (skill: InstallerSkill, checked: boolean) => setSelectedProductSkills(p => checked ? [...p, skill] : p.filter(s => s !== skill));
  const handleCertificationChange = (certification: InstallerCertification, checked: boolean) => setSelectedCertifications(p => checked ? [...p, certification] : p.filter(c => c !== certification));
  
  const handleInstallerCardClick = useCallback((installerId: string) => {
    setSelectedInstallerId(installerId);
  }, []);

  const handleRadiusChange = (radius: number) => setSearchRadius(radius);
  const isLoadingData = loadingInstallers || loadingUserLocation || loadingOrs;

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
              {!showAdditionalFilters && (<>
                <InstallerSearch value={inputValue} onChange={setInputValue} onSearch={handleSearch} />
                <DistanceFilter selectedRadius={searchRadius} onRadiusChange={handleRadiusChange} />
                <Separator />
              </>)}
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
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-lg">Additional Filters</h3>
                  <Switch id="additional-filters-toggle" checked={showAdditionalFilters} onCheckedChange={setShowAdditionalFilters} />
                </div>
                {showAdditionalFilters && (
                  <div className="space-y-4 mt-2">
                    <div>
                      <Label htmlFor="state-province-select">State / Province</Label>
                      <MultiSelect options={allStatesProvinces} selectedValues={filterStates} onValueChange={setFilterStates} placeholder="Select States/Provinces" />
                    </div>
                    <div>
                      <Label className="mb-2 block">Accepts Shipments</Label>
                      <RadioGroup
                        value={filterAcceptsShipments}
                        onValueChange={(value) => setFilterAcceptsShipments(value as 'any' | 'yes' | 'no')}
                        className="flex space-x-4"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="any" id="shipments-any-locator" />
                          <Label htmlFor="shipments-any-locator">Any</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="yes" id="shipments-yes-locator" />
                          <Label htmlFor="shipments-yes-locator">Yes</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="no" id="shipments-no-locator" />
                          <Label htmlFor="shipments-no-locator">No</Label>
                        </div>
                      </RadioGroup>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-8">
              {isLoadingData ? (
                <div className="text-center text-gray-500 mt-8">
                  <LoadingSayings />
                </div>
              ) : (
                <InstallerList 
                  installers={filteredAndSortedInstallers} 
                  searchedZipCode={searchedZipCode} 
                  selectedInstallerId={selectedInstallerId} 
                  onInstallerCardClick={handleInstallerCardClick}
                  searchRadius={searchRadius}
                  distanceUnit={distanceUnit}
                />
              )}
              {searchedZipCode && (!userLocation || userLocation.lat === null) && !loadingUserLocation && (!showAdditionalFilters || selectedStatesProvinces.length === 0) && (
                <p className="text-center text-sm text-red-500 mt-4">Could not get coordinates for the entered zip code. Please try another.</p>
              )}
            </div>
          </div>
          <div className="lg:col-span-2">
            <div className="h-[600px] w-full rounded-lg overflow-hidden shadow-sm">
              <InstallerMapComponent userLocation={userLocation} installers={filteredAndSortedInstallers} selectedInstallerId={selectedInstallerId} />
            </div>
            <div className="flex justify-end mt-4 space-x-2">
              <Button onClick={() => navigate("/public-locator")} variant="outline">Public Locator View</Button>
              <Button onClick={toggleCountry} variant="outline">Switch to {isCanada ? "US" : "Canada"} View</Button>
              <Button onClick={() => navigate("/installers")}>Installer Management</Button>
            </div>
            {!isLoadingData && filteredAndSortedInstallers.length > 0 && (
              <InstallerSummary installers={filteredAndSortedInstallers} searchedZipCode={searchedZipCode} userLocation={userLocation} showAdditionalFilters={showAdditionalFilters} selectedStatesProvinces={filterStates} searchRadius={searchRadius} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Locator;