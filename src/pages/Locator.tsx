import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import InstallerSearch from "@/components/InstallerSearch";
import PublicBrandSkillFilter from "@/components/PublicBrandSkillFilter";
import InstallerList from "@/components/InstallerList";
import InstallerMapComponent from "@/components/InstallerMapComponent";
import { Installer, InstallerCertification, InstallerBrand, InstallerSkill } from "@/types/installer";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { run as getCoordinates } from "@/functions/getCoordinates";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useCountrySettings } from "@/hooks/useCountrySettings";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import MultiSelect from "@/components/MultiSelect";
import InstallerSummary from "@/components/InstallerSummary";
import LoadingSayings from "@/components/LoadingSayings";
import { useQuery } from "@tanstack/react-query";
import { useAllInstallers, useDrivingDistances, useInstallersInLocalArea } from "@/hooks/useInstallerData";
import CountryFlagToggle from "@/components/CountryFlagToggle";
import CoverageDetailPanel, {
  type CoverageDetailPanelTarget,
} from "@/components/CoverageDetailPanel";

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
  // Drives the click-to-inspect side panel. Cleared via Sheet close or
  // by clicking the same polygon a second time (handled inside the
  // click callback below).
  const [coverageDetailTarget, setCoverageDetailTarget] =
    useState<CoverageDetailPanelTarget | null>(null);
  const [allStatesProvinces, setAllStatesProvinces] = useState<string[]>([]);
  const navigate = useNavigate();
  const { isCanada, distanceUnit, setIsCanada } = useCountrySettings();

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
        // Only stamp a real true/false when we actually have a local-area
        // lookup to consult. The hook deliberately skips itself for
        // free-form searches like "Calgary" (no eq.calgary against
        // installer_zip_codes), so `localAreaInstallerIds` will be
        // undefined in that case and we leave `is_local_service_area`
        // undefined too — that hides the mileage badge instead of
        // falsely tagging every installer as "Mileage Charged".
        is_local_service_area:
          searchedZipCode && localAreaInstallerIds
            ? localAreaInstallerIds.has(rawInstaller.id)
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

    // NOTE: deliberately no country-boundary filter here. We previously
    // gated on the app's isCanada toggle, but that hides Canadian
    // installers from any unintended-US-mode Canadian search (e.g.
    // typing "toronto" without flipping the toggle first) and the
    // installers.country column is too inconsistent ("USA" / "US" /
    // "United States" / blank) to be a reliable filter anyway.
    // Coverage now also reuses the visible installer list (see
    // installerIds below), so cross-border leakage naturally limits
    // itself to what the radius actually reaches.

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
  }, [installers, filterBrands, filterProductSkills, filterCertifications, installerDistancesMap, searchRadius, showAdditionalFilters, filterStates, filterAcceptsShipments]);

  // Array-based handlers wired directly into PublicBrandSkillFilter
  // (and the inline "Other" pill ToggleGroup further below). Matches
  // the public locator's filter shape so both pages now share the same
  // pill-button look and the same component for brands/skills/certs.
  const handleBrandsChange = (brands: InstallerBrand[]) => setFilterBrands(brands);
  const handleProductSkillsChange = (skills: InstallerSkill[]) => setFilterProductSkills(skills);
  const handleCertificationsChange = (certifications: InstallerCertification[]) => setFilterCertifications(certifications);

  // Distance options preserve the internal locator's wider radii
  // (admins often need to see further than end-users). Stored in
  // miles for downstream math; the km column is shown when the
  // country toggle is set to Canada.
  const distanceOptions = useMemo(
    () => [
      { miles: 50, km: 80 },
      { miles: 100, km: 150 },
      { miles: 250, km: 400 },
      { miles: 500, km: 800 },
    ],
    [],
  );
  
  const handleInstallerCardClick = useCallback((installerId: string) => {
    navigate(`/installers/edit/${installerId}`);
  }, [navigate]);

  const handleViewCoverage = useCallback((installerId: string) => {
    setCoverageInstallerId(prev => (prev === installerId ? null : installerId));
  }, []);

  const handleClearCoverageFilter = useCallback(() => {
    setCoverageInstallerId(null);
  }, []);

  const handleZipClick = useCallback(
    (
      zip: string,
      _counts: { free: number; paid: number },
      meta: { country: "USA" | "Canada"; totalPostalCodes: number | null },
    ) => {
      setCoverageDetailTarget((prev) =>
        prev && prev.zipOrFsa === zip && prev.country === meta.country
          ? null
          : {
              country: meta.country,
              zipOrFsa: zip,
              totalPostalCodes: meta.totalPostalCodes,
            },
      );
    },
    [],
  );

  const handleCloseDetailPanel = useCallback(() => {
    setCoverageDetailTarget(null);
  }, []);

  const handleOpenCoverageSearch = useCallback(() => {
    // Empty zipOrFsa = search mode. The panel renders the search input
    // and a hint instead of running a query until the user submits one.
    setCoverageDetailTarget((prev) =>
      prev ? prev : { country: isCanada ? "Canada" : "USA", zipOrFsa: "" },
    );
  }, [isCanada]);

  const handleTargetChange = useCallback(
    (next: CoverageDetailPanelTarget | null) => {
      setCoverageDetailTarget(next);
    },
    [],
  );

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

  // Auto-close the drill-down panel whenever the country changes — the
  // open target's zip/FSA almost certainly won't exist in the other
  // country and the panel would otherwise render an empty "no coverage"
  // state until the user dismissed it.
  useEffect(() => {
    setCoverageDetailTarget(null);
  }, [isCanada]);

  // The installer-id list passed to the coverage overlay (and reused
  // when fetching the drill-down detail). Memoized so the panel's
  // query doesn't re-fire on every render.
  const overlayInstallerIds = useMemo(
    () =>
      coverageInstallerId
        ? [coverageInstallerId]
        : filteredAndSortedInstallers.map((i) => i.id),
    [coverageInstallerId, filteredAndSortedInstallers],
  );

  const handleRadiusChange = (radius: number) => setSearchRadius(radius);
  const isLoadingData = loadingInstallers || loadingUserLocation || loadingOrs;

  return (
    <div className="flex flex-col min-h-screen">
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 flex-grow">
        {/* Page header — logo + title on the left, action buttons on
            the right. Moved out of the grid (was previously a row 2
            cell) so the map and the installer list can stack
            directly under each other in the right column with no
            dead vertical space waiting on the buttons to clear. */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-3">
            <img src="https://upload.wikimedia.org/wikipedia/commons/a/aa/Hunter_Douglas_Logo.svg" alt="Hunter Douglas Logo" className="h-10 sm:h-12" />
            <h1
              className="text-2xl sm:text-3xl font-bold text-[#5b676f]"
              style={{ fontFamily: 'Lato, system-ui, sans-serif' }}
            >
              Installer Locator
            </h1>
          </div>
          <div className="flex flex-wrap justify-center sm:justify-end gap-2">
            <Button onClick={() => navigate("/public-locator")} variant="outline" size="sm">Public Locator View</Button>
            <Button onClick={() => navigate("/installers")} size="sm">Installer Management</Button>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-4 lg:auto-rows-min">
          {/* 1. Filters card — mobile #1, desktop col 1 row 1.
              Pill-button styling matches /public-locator so admins and
              end users see the same filter aesthetic. Section labels
              use the same small uppercase treatment; the pill class
              itself is reused from PublicBrandSkillFilter and the
              public locator's inline distance/other pill rows. */}
          <div className="lg:col-start-1 lg:col-span-1 lg:row-start-1">
            <div className="p-4 border rounded-lg shadow-sm bg-card space-y-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h2 className="text-xl font-semibold">Find Installers</h2>
                <CountryFlagToggle isCanada={isCanada} onChange={setIsCanada} />
              </div>
              {!showAdditionalFilters && (
                <>
                  <InstallerSearch value={inputValue} onChange={setInputValue} onSearch={handleSearch} />
                  <div>
                    <div className="text-[13px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                      Distance ({distanceUnit})
                    </div>
                    <ToggleGroup
                      type="single"
                      value={String(searchRadius)}
                      onValueChange={(value) => {
                        if (value) handleRadiusChange(Number(value));
                      }}
                      className="flex flex-wrap items-center justify-start gap-1.5"
                    >
                      {distanceOptions.map((option) => (
                        <ToggleGroupItem
                          key={option.miles}
                          value={String(option.miles)}
                          aria-label={`${isCanada ? option.km : option.miles} ${distanceUnit}`}
                          className="h-[30px] px-[11px] text-[13.5px] rounded-full border border-input bg-transparent text-gray-700 hover:bg-gray-50 data-[state=on]:bg-sky-50 data-[state=on]:text-sky-700 data-[state=on]:border-sky-300"
                        >
                          {isCanada ? option.km : option.miles}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                </>
              )}
              <PublicBrandSkillFilter
                selectedBrands={filterBrands}
                selectedProductSkills={filterProductSkills}
                selectedCertifications={filterCertifications}
                onBrandsChange={handleBrandsChange}
                onProductSkillsChange={handleProductSkillsChange}
                onCertificationsChange={handleCertificationsChange}
                brandsToShow={["Hunter Douglas", "Alta"]}
              />
              <div>
                <div className="text-[13px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                  Other
                </div>
                <ToggleGroup
                  type="multiple"
                  value={filterAcceptsShipments === 'yes' ? ['shipments'] : []}
                  onValueChange={(value) =>
                    setFilterAcceptsShipments(value.includes('shipments') ? 'yes' : 'any')
                  }
                  className="flex flex-wrap items-center justify-start gap-1.5"
                >
                  <ToggleGroupItem
                    value="shipments"
                    aria-label="Accepts Shipments"
                    className="h-[30px] px-[11px] text-[13.5px] rounded-full border border-input bg-transparent text-gray-700 hover:bg-gray-50 data-[state=on]:bg-sky-50 data-[state=on]:text-sky-700 data-[state=on]:border-sky-300"
                  >
                    Accepts Shipments
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              <Separator />
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[13px] font-semibold uppercase tracking-wide text-gray-500">Additional Filters</h3>
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

          {/* 2. Map — mobile #2, desktop col 2-3 row 1.
              Map height matches the filter card on lg+ so the two
              row-1 cells stay aligned and there's no gap underneath
              while the row resolves to the taller of the two. */}
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
                  // Sync coverage with the pin list: only paint
                  // territories of installers we're actually showing
                  // on the map. Without this, far-away installers
                  // whose territories extend INTO the radius would
                  // paint polygons here with no corresponding pin —
                  // confusing at large radii where the polygon centroid
                  // is in range but the installer's home isn't.
                  installerIds: overlayInstallerIds,
                  filterLabel: coverageFilterLabel,
                  onClearFilter: handleClearCoverageFilter,
                  onZipClick: handleZipClick,
                  onSearchClick: handleOpenCoverageSearch,
                }}
              />
            </div>
          </div>

          {/* 3. Installer list — mobile #3, desktop col 2-3 row 2.
              Flows directly under the map in the right column so
              there's no dead vertical space waiting on the action-
              button row (those buttons moved up to the page header). */}
          <div className="lg:col-start-2 lg:col-span-2 lg:row-start-2">
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

          {/* 4. Installer summary — mobile #4, desktop col 1 row 2 (under filters) */}
          {!isLoadingData && filteredAndSortedInstallers.length > 0 && (
            <div className="lg:col-start-1 lg:col-span-1 lg:row-start-2">
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
      <CoverageDetailPanel
        target={coverageDetailTarget}
        onTargetChange={handleTargetChange}
        country={isCanada ? "Canada" : "USA"}
        onClose={handleCloseDetailPanel}
        installerIds={overlayInstallerIds}
      />
    </div>
  );
};

export default Locator;