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
import LoadingSayings from "@/components/LoadingSayings";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery } from "@tanstack/react-query";
import { useAllInstallers, useDrivingDistances, useInstallersInLocalArea } from "@/hooks/useInstallerData";

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

  const [selectedInstallerId, setSelectedInstallerId] = useState<string | null>(null);
  // Per-installer coverage filter — populated when an admin clicks the
  // "View coverage" map icon on a card. Null means the overlay shows
  // every matching installer (the default).
  const [coverageInstallerId, setCoverageInstallerId] = useState<string | null>(null);
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

  const { data: locationData, isLoading: loadingUserLocation } = useQuery({
    queryKey: ['location', searchedZipCode],
    queryFn: async () => {
      if (searchedZipCode) {
        const coords = await getCoordinates({ searchText: searchedZipCode });
        if (coords.lat === null || coords.lng === null) {
          toast.error("Could not find coordinates for the entered zip code. Please ensure it's valid.");
        }
        return coords;
      }
      return { lat: null, lng: null, zipCode: null };
    },
    enabled: !showAdditionalFilters || filterStates.length === 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const userLocation = useMemo(() => ({
    lat: locationData?.lat || null,
    lng: locationData?.lng || null,
  }), [locationData]);

  const { data: allInstallersData, isLoading: loadingInstallers } = useAllInstallers();
  const { data: localAreaInstallerIds } = useInstallersInLocalArea(searchedZipCode);

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
    if (!allInstallersData) return [];
    const mappedInstallers: Installer[] = (allInstallersData || []).map((rawInstaller: any) => {
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
        is_local_service_area: searchedZipCode
          ? localAreaInstallerIds?.has(rawInstaller.id) ?? false
          : undefined,
        rawSupabaseData: rawInstaller,
      };
    });
    const uniqueStates = new Set<string>();
    (allInstallersData || []).forEach((rawInstaller: any) => { if (rawInstaller.state) uniqueStates.add(rawInstaller.state); });
    setAllStatesProvinces(Array.from(uniqueStates).sort());
    return mappedInstallers;
  }, [allInstallersData, searchedZipCode, localAreaInstallerIds]);

  const { data: installerDistancesMap, isLoading: loadingOrs } = useDrivingDistances(userLocation, installers);

  const filteredAndSortedInstallers = useMemo(() => {
    let currentInstallers = installers;

    // Country boundary filter — admins use a country toggle to switch the
    // search basemap and distance units; we shouldn't surface cross-border
    // installers (e.g. Detroit installers showing up for a Windsor, ON
    // search) since the locator's country is the source of truth for the
    // session. Installers with a NULL country are treated as USA so we
    // don't accidentally drop legacy rows from the default-US view.
    const expectedCountry = isCanada ? "Canada" : "USA";
    currentInstallers = currentInstallers.filter((i) => {
      const c = i.rawSupabaseData?.country;
      if (!c) return !isCanada;
      return c === expectedCountry;
    });

    if (filterBrands.length > 0) currentInstallers = currentInstallers.filter(i => filterBrands.every(b => (i.brands ?? []).includes(b)));
    if (filterProductSkills.length > 0) currentInstallers = currentInstallers.filter(i => filterProductSkills.every(s => (i.skills ?? []).includes(s)));
    if (filterCertifications.length > 0) currentInstallers = currentInstallers.filter(i => filterCertifications.every(c => (i.certifications ?? []).includes(c)));
    
    if (showAdditionalFilters) {
      if (filterStates.length > 0) {
        currentInstallers = currentInstallers.filter(i => i.rawSupabaseData?.state && filterStates.includes(i.rawSupabaseData.state));
      }
      if (filterAcceptsShipments === 'yes') {
        currentInstallers = currentInstallers.filter(i => i.acceptsShipments);
      } else if (filterAcceptsShipments === 'no') {
        currentInstallers = currentInstallers.filter(i => !i.acceptsShipments);
      }
    }

    if (showAdditionalFilters && filterStates.length > 0) {
      return currentInstallers;
    }

    let installersWithDistance = currentInstallers.map(i => ({ ...i, distance: installerDistancesMap?.get(i.id) ?? Infinity }));
    installersWithDistance.sort((a, b) => a.distance - b.distance);
    return installersWithDistance.filter(i => i.distance <= searchRadius);
  }, [installers, filterBrands, filterProductSkills, filterCertifications, installerDistancesMap, searchRadius, showAdditionalFilters, filterStates, filterAcceptsShipments, isCanada]);

  const handleBrandChange = (brand: InstallerBrand, checked: boolean) => setFilterBrands(p => checked ? [...p, brand] : p.filter(b => b !== brand));
  const handleProductSkillChange = (skill: InstallerSkill, checked: boolean) => setFilterProductSkills(p => checked ? [...p, skill] : p.filter(s => s !== skill));
  const handleCertificationChange = (certification: InstallerCertification, checked: boolean) => setFilterCertifications(p => checked ? [...p, certification] : p.filter(c => c !== certification));
  
  const handleInstallerCardClick = useCallback((installerId: string) => {
    navigate(`/installers/edit/${installerId}`);
  }, [navigate]);

  const handleViewCoverage = useCallback((installerId: string) => {
    setCoverageInstallerId(prev => (prev === installerId ? null : installerId));
  }, []);

  const handleClearCoverageFilter = useCallback(() => {
    setCoverageInstallerId(null);
  }, []);

  // Resolve the human-readable label for the active filter chip. We pull
  // from the (already-loaded) installers list so we don't need an extra
  // round trip — if the user switches search location and the installer
  // drops off the list, the label gracefully falls back to "Installer".
  const coverageFilterLabel = useMemo(() => {
    if (!coverageInstallerId) return null;
    const match = installers.find(i => i.id === coverageInstallerId);
    return match?.name ?? "Installer";
  }, [coverageInstallerId, installers]);

  // Auto-clear the per-installer coverage filter whenever the user
  // changes the active filter set, since the chosen installer may no
  // longer match (and the visible cards reset accordingly).
  useEffect(() => {
    setCoverageInstallerId(null);
  }, [filterBrands, filterProductSkills, filterCertifications, filterStates, filterAcceptsShipments]);

  const handleRadiusChange = (radius: number) => setSearchRadius(radius);
  const isLoadingData = loadingInstallers || loadingUserLocation || loadingOrs;

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
            <div className="p-4 border rounded-lg shadow-sm bg-card space-y-3">
              <h2 className="text-xl font-semibold mb-2">Find Installers</h2>
              {!showAdditionalFilters && (<>
                <InstallerSearch value={inputValue} onChange={setInputValue} onSearch={handleSearch} />
                <DistanceFilter selectedRadius={searchRadius} onRadiusChange={handleRadiusChange} />
                <Separator />
              </>)}
              <BrandSkillFilter
                selectedBrands={filterBrands}
                selectedProductSkills={filterProductSkills}
                selectedCertifications={filterCertifications}
                onBrandChange={handleBrandChange}
                onProductSkillChange={handleProductSkillChange}
                onCertificationChange={handleCertificationChange}
                brandsToShow={["Hunter Douglas", "Alta"]}
              />
              <Separator />
              <div>
                <h3 className="font-semibold text-lg mb-2">Other</h3>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="filter-accepts-shipments"
                    checked={filterAcceptsShipments === 'yes'}
                    onCheckedChange={(checked) => setFilterAcceptsShipments(checked ? 'yes' : 'any')}
                  />
                  <Label htmlFor="filter-accepts-shipments">Accepts Shipments</Label>
                </div>
              </div>
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
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 2. Installer list — mobile #2, desktop col 2-3 row 3 */}
          <div className="lg:col-start-2 lg:col-span-2 lg:row-start-3">
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
                onViewCoverage={handleViewCoverage}
                activeCoverageInstallerId={coverageInstallerId}
              />
            )}
            {searchedZipCode && (!userLocation || userLocation.lat === null) && !loadingUserLocation && (!showAdditionalFilters || filterStates.length === 0) && (
              <p className="text-center text-sm text-red-500 mt-4">Could not get coordinates for the entered zip code. Please try another.</p>
            )}
          </div>

          {/* 3. Map — mobile #3, desktop col 2-3 row 1.
              On lg screens the map stretches to match the height of the
              "Find Installers" filter card (the tallest item in row 1).
              On mobile it falls back to a fixed height since the layout
              is stacked. */}
          <div className="lg:col-start-2 lg:col-span-2 lg:row-start-1 lg:h-full">
            <div className="h-[500px] lg:h-full w-full rounded-lg overflow-hidden shadow-sm">
              <InstallerMapComponent
                userLocation={userLocation}
                installers={filteredAndSortedInstallers}
                selectedInstallerId={selectedInstallerId}
                coverageOverlay={{
                  enabled: true,
                  defaultVisible: true,
                  searchCenter: userLocation,
                  searchRadiusMiles: searchRadius,
                  brands: filterBrands,
                  skills: filterProductSkills,
                  certifications: filterCertifications,
                  acceptsShipments: filterAcceptsShipments === 'yes',
                  installerIds: coverageInstallerId ? [coverageInstallerId] : null,
                  filterLabel: coverageFilterLabel,
                  onClearFilter: handleClearCoverageFilter,
                }}
              />
            </div>
          </div>

          {/* 4. Action buttons — mobile #4, desktop col 2-3 row 2 */}
          <div className="lg:col-start-2 lg:col-span-2 lg:row-start-2">
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={() => navigate("/public-locator")} variant="outline">Public Locator View</Button>
              <Button onClick={toggleCountry} variant="outline">Switch to {isCanada ? "US" : "Canada"} View</Button>
              <Button onClick={() => navigate("/installers")}>Installer Management</Button>
            </div>
          </div>

          {/* 5. Installer summary — mobile #5, desktop col 1 row 2 (under filters) */}
          {!isLoadingData && filteredAndSortedInstallers.length > 0 && (
            <div className="lg:col-start-1 lg:col-span-1 lg:row-start-2 lg:row-span-2">
              <InstallerSummary
                installers={filteredAndSortedInstallers}
                searchedZipCode={searchedZipCode}
                userLocation={userLocation}
                showAdditionalFilters={showAdditionalFilters}
                selectedStatesProvinces={filterStates}
                searchRadius={searchRadius}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Locator;