import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import InstallerSearch from "@/components/InstallerSearch";
import PublicBrandSkillFilter from "@/components/PublicBrandSkillFilter";
import InstallerMapComponent from "@/components/InstallerMapComponent";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { run as getCoordinates } from "@/functions/getCoordinates";
import { run as getIpLocation } from "@/functions/getIpLocation";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCountrySettings } from "@/hooks/useCountrySettings";
import InstallerSummary from "@/components/InstallerSummary";
import { Installer, InstallerCertification, InstallerBrand, InstallerSkill } from "@/types/installer";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/components/SessionContextProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const { isCanada, distanceUnit, setIsCanada } = useCountrySettings();
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
        return {
          lat: coords.lat,
          lng: coords.lng,
          zipCode: coords.zipCode || "",
          countryCode: coords.countryCode ?? null,
        };
      } else {
        // Initial load: try browser geolocation (most accurate), then
        // IP. Country is taken from IP because the browser geolocation
        // API gives lat/lng only — we fall back to a lat/lng heuristic
        // if even that fails.
        let coords: { lat: number | null; lng: number | null } = { lat: null, lng: null };
        let countryCode: string | null = null;
        if (navigator.geolocation) {
          try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) =>
              navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 }),
            );
            coords = { lat: position.coords.latitude, lng: position.coords.longitude };
          } catch (_error) {
            // Suppressed: silently fall through to IP location. The
            // previous version surfaced these as toasts but they fire
            // routinely on browsers with location prompts dismissed,
            // creating noise on first load.
          }
        }
        if (coords.lat === null || coords.lng === null) {
          const ip = await getIpLocation();
          coords = { lat: ip.lat, lng: ip.lng };
          countryCode = ip.countryCode;
        } else {
          // Browser geolocation succeeded but doesn't carry a country;
          // ask the IP service for the country code only so we still
          // pick the right US/CA mode.
          const ip = await getIpLocation();
          countryCode = ip.countryCode;
        }
        return {
          lat: coords.lat,
          lng: coords.lng,
          zipCode: "",
          countryCode,
        };
      }
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // Single source of truth for country mode: prefer the explicit
  // ISO country code returned by the geocoder / IP service, fall
  // back to a coarse lat/lng heuristic (Canada is everything above
  // roughly the 49th parallel within longitudes -141..-52, with a
  // little slack for southernmost Ontario which dips below 42°).
  // Updates the shared isCanada setting whenever a fresh location
  // resolves — replaces the previous US/CA flag toggle on this page.
  useEffect(() => {
    if (!locationData) return;
    const cc = locationData.countryCode?.toLowerCase();
    if (cc === 'ca') {
      if (!isCanada) setIsCanada(true);
      return;
    }
    if (cc === 'us') {
      if (isCanada) setIsCanada(false);
      return;
    }
    // No reliable country code — heuristic from coordinates.
    const lat = locationData.lat;
    const lng = locationData.lng;
    if (lat == null || lng == null) return;
    const looksCanadian =
      lng >= -141 && lng <= -52 && (lat >= 49 || (lat >= 41.7 && lng >= -83 && lng <= -74));
    if (looksCanadian !== isCanada) setIsCanada(looksCanadian);
    // We intentionally don't depend on `isCanada` to avoid a feedback
    // loop where setting isCanada re-triggers this effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationData, setIsCanada]);

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

    // Country filter — only show installers whose country matches the
    // active isCanada toggle. The DB column is inconsistent so we
    // normalise: "Canada"/"CA" → Canadian, everything else → US.
    const isInstallerCanadian = (raw: any): boolean => {
      const c = (raw?.country ?? '').trim().toLowerCase();
      return c === 'canada' || c === 'ca';
    };
    currentInstallers = currentInstallers.filter(i =>
      isCanada
        ? isInstallerCanadian(i.rawSupabaseData)
        : !isInstallerCanadian(i.rawSupabaseData),
    );

    if (selectedBrands.length > 0) currentInstallers = currentInstallers.filter(i => selectedBrands.every(b => (i.brands ?? []).includes(b)));
    if (selectedProductSkills.length > 0) currentInstallers = currentInstallers.filter(i => selectedProductSkills.every(s => (i.skills ?? []).includes(s)));
    if (selectedCertifications.length > 0) currentInstallers = currentInstallers.filter(i => selectedCertifications.every(c => (i.certifications ?? []).includes(c)));
    if (filterAcceptsShipments) currentInstallers = currentInstallers.filter(i => i.acceptsShipments === true);
    if (filterMileageCovered) currentInstallers = currentInstallers.filter(i => i.is_local_service_area === true);
    return currentInstallers;
  }, [installers, isCanada, selectedBrands, selectedProductSkills, selectedCertifications, filterAcceptsShipments, filterMileageCovered]);

  const handleRadiusChange = (radius: number) => setSearchRadius(radius);
  const isLoadingData = loadingInstallers || loadingLocation;

  // Public locator distance options. Country-specific so the displayed label
  // matches the actual search radius:
  // - US: rounded mile values (25/50/100/250 mi)
  // - Canada: rounded km labels with their mile equivalent (so picking "250
  //   km" actually searches ~250 km, not 250 mi).
  const publicDistanceOptions = useMemo(
    () =>
      isCanada
        ? [
            { miles: 22, km: 35 },   // 35 km ≈ 21.7 mi
            { miles: 43, km: 70 },   // 70 km ≈ 43.5 mi
            { miles: 93, km: 150 },  // 150 km ≈ 93.2 mi
            { miles: 155, km: 250 }, // 250 km ≈ 155.3 mi
          ]
        : [
            { miles: 25, km: 35 },
            { miles: 50, km: 70 },
            { miles: 100, km: 150 },
            { miles: 250, km: 250 },
          ],
    [isCanada]
  );

  // If the URL or a previous country's selection left searchRadius outside the
  // current option set (e.g. user lands on /public-locator?radius=50 in Canada
  // mode), snap to the closest valid option so a radio button is always lit.
  useEffect(() => {
    const matchesCurrent = publicDistanceOptions.some((o) => o.miles === searchRadius);
    if (matchesCurrent) return;
    const nearest = publicDistanceOptions.reduce((prev, curr) =>
      Math.abs(curr.miles - searchRadius) < Math.abs(prev.miles - searchRadius) ? curr : prev
    );
    setSearchRadius(nearest.miles);
  }, [publicDistanceOptions, searchRadius]);

  // Whatever number the user sees on the radio button is what we display
  // everywhere else (summary card, "no results" message, collapsed filter
  // header) so the page stays internally consistent.
  const selectedDistanceOption = publicDistanceOptions.find((o) => o.miles === searchRadius);
  const displayedRadius = isCanada
    ? (selectedDistanceOption?.km ?? Math.round(searchRadius * 1.60934))
    : (selectedDistanceOption?.miles ?? searchRadius);

  // On mobile the filter panel collapses so the map / results aren't pushed
  // far down the page. Default open if the user has no search yet (they need
  // to type one), default collapsed if a search is already populated from the
  // URL so they immediately see the map.
  const [isFiltersOpen, setIsFiltersOpen] = useState<boolean>(() => !searchParams.get('q'));

  const activeFilterCount =
    selectedBrands.length +
    selectedProductSkills.length +
    selectedCertifications.length +
    (filterAcceptsShipments ? 1 : 0) +
    (filterMileageCovered ? 1 : 0);

  // The search input itself is always visible on mobile, so the collapsed
  // summary doesn't need to repeat the zip code — it just covers what's
  // hidden by the collapse: the radius and any active filters.
  const collapsedSummary = (() => {
    const parts: string[] = [];
    parts.push(`${displayedRadius} ${distanceUnit === 'km' ? 'km' : 'mi'}`);
    if (activeFilterCount > 0) parts.push(`${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'}`);
    return parts.join(' · ');
  })();

  return (
    <div className="flex flex-col min-h-screen">
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 lg:pt-4 flex-grow">
        <div className="flex flex-row items-center justify-center gap-2 sm:gap-3 mb-4 text-left">
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/a/aa/Hunter_Douglas_Logo.svg"
            alt="Hunter Douglas Logo"
            className="h-8 sm:h-9 flex-shrink-0"
          />
          {/* Hidden on mobile to save vertical space — the logo is
              enough branding for the small viewport, and getting to
              the filters / map faster matters more than a title bar. */}
          <h1
            className="hidden sm:block text-lg sm:text-2xl font-bold text-[#5b676f] whitespace-nowrap"
            style={{ fontFamily: 'Lato, system-ui, sans-serif' }}
          >
            Installer Locator
          </h1>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-4 lg:auto-rows-min">
          {/* 1. Filters card — mobile #1, desktop col 1 row 1.
              On mobile the whole card body collapses behind the header so the
              map and summary aren't pushed off-screen. On lg+ it's always
              visible (the toggle button is hidden, body has `lg:block`).
              Height is locked to the map column below so the two stay aligned. */}
          <div className="lg:col-start-1 lg:col-span-1 lg:row-start-1">
            <div className="lg:h-[540px]">
              <Card className="h-full flex flex-col">
                <CardHeader className="pb-2 pt-4">
                  {/* Mobile: clickable header acts as the collapse toggle and
                      shows a 1-line summary of the current filter state.
                      No country toggle — the US/CA mode is derived from
                      the user's IP / browser geolocation and from any
                      location they search for. */}
                  <div className="lg:hidden w-full flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setIsFiltersOpen((o) => !o)}
                      aria-expanded={isFiltersOpen}
                      aria-controls="public-locator-filters"
                      className="flex-1 min-w-0 flex items-baseline gap-2 text-left"
                    >
                      <CardTitle className="text-xl font-semibold whitespace-nowrap">Find Installers</CardTitle>
                      {!isFiltersOpen && (
                        <span className="text-xs text-gray-500 truncate">{collapsedSummary}</span>
                      )}
                    </button>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {activeFilterCount > 0 && !isFiltersOpen && (
                        <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-sky-500 text-white text-xs font-semibold">
                          {activeFilterCount}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsFiltersOpen((o) => !o)}
                        aria-label={isFiltersOpen ? "Collapse filters" : "Expand filters"}
                        className="p-1"
                      >
                        <ChevronDown
                          className={`h-5 w-5 text-gray-500 transition-transform duration-200 ${isFiltersOpen ? 'rotate-180' : ''}`}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </div>
                  {/* Desktop: static title; country auto-detects from
                      the user's location so end users never see a
                      US/CA toggle. */}
                  <div className="hidden lg:flex items-center justify-between gap-2">
                    <CardTitle className="text-xl font-semibold">Find Installers</CardTitle>
                  </div>
                </CardHeader>
                {/* Search bar lives outside the collapsible body so it stays
                    accessible on mobile even when filters are collapsed. */}
                <div className="px-6 pt-2 pb-1">
                  <InstallerSearch
                    value={inputValue}
                    onChange={setInputValue}
                    onSearch={handleSearch}
                    iconOnly
                  />
                </div>
                <CardContent
                  id="public-locator-filters"
                  className={`flex-grow space-y-3 pt-2 pb-4 lg:block lg:overflow-y-auto ${isFiltersOpen ? 'block' : 'hidden'}`}
                >
                  {/* Distance — single-select pill row matching the brand/skill aesthetic. */}
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
                      {publicDistanceOptions.map((option) => (
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

                  <PublicBrandSkillFilter
                    selectedBrands={selectedBrands}
                    selectedProductSkills={selectedProductSkills}
                    selectedCertifications={selectedCertifications}
                    onBrandsChange={setSelectedBrands}
                    onProductSkillsChange={setSelectedProductSkills}
                    onCertificationsChange={setSelectedCertifications}
                    brandsToShow={["Hunter Douglas", "Alta"]}
                  />

                  {/* Other — multi-select pills mirror the rest of the filter pattern. */}
                  <div>
                    <div className="text-[13px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                      Other
                    </div>
                    <ToggleGroup
                      type="multiple"
                      value={[
                        ...(filterAcceptsShipments ? ["shipments"] : []),
                        ...(filterMileageCovered ? ["mileage"] : []),
                      ]}
                      onValueChange={(value) => {
                        setFilterAcceptsShipments(value.includes("shipments"));
                        setFilterMileageCovered(value.includes("mileage"));
                      }}
                      className="flex flex-wrap items-center justify-start gap-1.5"
                    >
                      <ToggleGroupItem
                        value="shipments"
                        aria-label="Accepts Shipments"
                        className="h-[30px] px-[11px] text-[13.5px] rounded-full border border-input bg-transparent text-gray-700 hover:bg-gray-50 data-[state=on]:bg-sky-50 data-[state=on]:text-sky-700 data-[state=on]:border-sky-300"
                      >
                        Accepts Shipments
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="mileage"
                        aria-label="Mileage Covered"
                        className="h-[30px] px-[11px] text-[13.5px] rounded-full border border-input bg-transparent text-gray-700 hover:bg-gray-50 data-[state=on]:bg-sky-50 data-[state=on]:text-sky-700 data-[state=on]:border-sky-300"
                      >
                        Mileage Covered
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 2. Map — mobile #2, desktop col 2-3 row 1.
              Height matches the filter card on lg+ so the two columns stay aligned. */}
          <div className="lg:col-start-2 lg:col-span-2 lg:row-start-1">
            <div className="h-[540px] w-full rounded-lg overflow-hidden shadow-sm">
              <InstallerMapComponent
                userLocation={userSearchLocation}
                installers={filteredAndSortedInstallers}
                selectedInstallerId={null}
                isPublicView={true}
                // Coverage overlay intentionally disabled on the public
                // locator for now — leaves the underlying machinery in place
                // (and still active on /locator for admins) but hides both
                // the polygons and the legend from end users. Flip
                // `enabled: true` and set `defaultVisible` to expose it again.
                coverageOverlay={{
                  enabled: false,
                  defaultVisible: false,
                  searchCenter: userSearchLocation ?? { lat: null, lng: null },
                  searchRadiusMiles: searchRadius,
                  brands: selectedBrands,
                  skills: selectedProductSkills,
                  certifications: selectedCertifications,
                  acceptsShipments: filterAcceptsShipments,
                  // Sync coverage with visible pins so we never paint
                  // polygons for installers that aren't on the map.
                  // (Preserved here for the moment we re-enable the
                  // public overlay; today `enabled: false` short-
                  // circuits it.)
                  installerIds: filteredAndSortedInstallers.map((i) => i.id),
                  // Public locator: default the legend OPEN so first-
                  // time visitors immediately see what the colours
                  // mean. Persisted per page so once they collapse it
                  // their preference sticks for the session.
                  legendDefaultExpanded: true,
                  legendPersistKey: 'hdis:coverage-legend-expanded:public-locator',
                }}
              />
            </div>
            {isLoadingData && (
              <div className="text-center text-gray-500 mt-4">
                <LoadingSayings />
              </div>
            )}
            {!isLoadingData && filteredAndSortedInstallers.length === 0 && searchedZipCode && (
              <p className="text-center text-sm text-gray-500 mt-4">
                No installers found within {displayedRadius} {distanceUnit}. Try expanding the search radius or changing filters.
              </p>
            )}
            {searchText && (!userSearchLocation || userSearchLocation.lat === null) && !loadingLocation && (
              <p className="text-center text-sm text-red-500 mt-4">Could not get coordinates for your search. Please try another location.</p>
            )}
          </div>

          {/* 3. Installer summary — mobile #3, desktop full-width row 2 (spans under filters AND map) */}
          {!isLoadingData && filteredAndSortedInstallers.length > 0 && (
            <div className="lg:col-start-1 lg:col-span-3 lg:row-start-2">
              <InstallerSummary
                installers={filteredAndSortedInstallers}
                searchedZipCode={searchedZipCode}
                userLocation={userSearchLocation}
                showAdditionalFilters={false}
                selectedStatesProvinces={[]}
                searchRadius={searchRadius}
                isPublicView={true}
                displayRadiusOverride={displayedRadius}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PublicLocator;