import React, { useState, useEffect, useMemo } from "react";
import InstallerSearch from "@/components/InstallerSearch";
import BrandSkillFilter from "@/components/BrandSkillFilter"; // Updated import
import InstallerList from "@/components/InstallerList";
import InstallerMapComponent from "@/components/InstallerMapComponent";
import { Installer, InstallerCertification, InstallerBrand, InstallerSkill } from "@/types/installer"; // Import new types
import { Separator } from "@/components/ui/separator";
import { run as getCoordinates } from "@/functions/getCoordinates";
import { supabase } from "@/integrations/supabase/client"; // Updated import
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import DistanceFilter from "@/components/DistanceFilter";
import { useCountrySettings } from "@/hooks/useCountrySettings";
import { Switch } from "@/components/ui/switch"; // Import Switch
import { Label } from "@/components/ui/label"; // Import Label
import MultiSelect from "@/components/MultiSelect"; // Import MultiSelect
import InstallerSummary from "@/components/InstallerSummary"; // Import InstallerSummary

const Locator: React.FC = () => {
  const [searchedZipCode, setSearchedZipCode] = useState<string>("");
  const [selectedBrands, setSelectedBrands] = useState<InstallerBrand[]>([]); // New state
  const [selectedProductSkills, setSelectedProductSkills] = useState<InstallerSkill[]>([]); // New state
  const [selectedCertifications, setSelectedCertifications] = useState<InstallerCertification[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number | null; lng: number | null } | null>(null);
  const [installers, setInstallers] = useState<Installer[]>([]);
  const [loadingInstallers, setLoadingInstallers] = useState<boolean>(true);
  const [loadingUserLocation, setLoadingUserLocation] = useState<boolean>(false);
  const [installerDistancesMap, setInstallerDistancesMap] = useState<Map<string, number>>(new Map()); // Corrected this line
  const [loadingOrs, setLoadingOrs] = useState<boolean>(false);
  const [selectedInstallerId, setSelectedInstallerId] = useState<string | null>(null);
  const [searchRadius, setSearchRadius] = useState<number>(50); // State for search radius in miles

  // New states for additional filters
  const [showAdditionalFilters, setShowAdditionalFilters] = useState(false);
  const [selectedStatesProvinces, setSelectedStatesProvinces] = useState<string[]>([]);
  const [allStatesProvinces, setAllStatesProvinces] = useState<string[]>([]);

  const navigate = useNavigate();
  const { isCanada, distanceUnit, toggleCountry } = useCountrySettings();

  const OPENROUTESERVICE_API_KEY = '5b3ce3597851110001cf6248d8c27a7c67644fb391eaf7080c84c301';

  // Helper to convert Supabase boolean-like values to actual booleans
  const toBoolean = (value: any): boolean => {
    if (typeof value === 'string') {
      return value.toLowerCase() === '1' || value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';
    }
    return value === 1 || value === true;
  };

  // Helper function to standardize certification names
  const standardizeCertificationName = (cert: string | null | undefined): InstallerCertification | null => {
    if (!cert) return null;

    // Aggressive normalization: remove non-alphanumeric (except spaces), replace multiple spaces, trim, and lowercase
    const normalizedCert = cert
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    // Check for Motorization Pro variations
    if (normalizedCert.includes("motorization pro")) { // Renamed here
      return "Motorization Pro";
    }
    
    // For other certifications, use a map for direct lookup
    const validCertificationsMap: { [key: string]: InstallerCertification } = {
      "certified installer": "Certified Installer",
      "master installer": "Master Installer",
      "master shutter": "Shutter Pro", // Mapped to new type
      "drapery pro": "Drapery Pro",
      "pip certified": "PIP Certified",
    };
    
    return validCertificationsMap[normalizedCert] || null;
  };

  useEffect(() => {
    const fetchInstallers = async () => {
      setLoadingInstallers(true);
      const { data, error } = await supabase
        .from('installers')
        .select('*');

      if (error) {
        console.error("Error fetching installers from Supabase:", error);
        toast.error("Failed to load installers. Please try again later.");
        setInstallers([]);
      } else {
        const mappedInstallers: Installer[] = (data || []).map((rawInstaller: any) => {
          const skills: InstallerSkill[] = [];
          if (toBoolean(rawInstaller.Blinds_and_Shades)) skills.push("Blinds & Shades");
          if (toBoolean(rawInstaller.PowerView)) skills.push("Motorization"); // Mapped from PowerView_Raw
          if (toBoolean(rawInstaller.Shutters)) skills.push("Shutters");
          if (toBoolean(rawInstaller.Draperies)) skills.push("Drapery");
          if (toBoolean(rawInstaller.Service_Call)) skills.push("Service Call");
          // Removed Alta Motorization: if (toBoolean(rawInstaller.alta_motorization)) skills.push("Alta Motorization");
          if (toBoolean(rawInstaller.tall_window)) skills.push("Tall Window"); // Use DB column name
          if (toBoolean(rawInstaller.fixture_displays)) skills.push("Fixture Displays"); // Use DB column name
          if (toBoolean(rawInstaller.outdoor)) skills.push("Outdoor"); // Use DB column name
          if (toBoolean(rawInstaller.high_voltage_hardwired)) skills.push("High Voltage Hardwired"); // Use DB column name

          const brands: InstallerBrand[] = [];
          if (toBoolean(rawInstaller.hunter_douglas)) brands.push("Hunter Douglas"); // Use DB column name
          if (toBoolean(rawInstaller.Alta)) brands.push("Alta");
          if (toBoolean(rawInstaller.carole)) brands.push("Carole"); // Use DB column name
          if (toBoolean(rawInstaller.architectural)) brands.push("Architectural"); // Use DB column name
          if (toBoolean(rawInstaller.levolor)) brands.push("Levolor"); // Use DB column name
          if (toBoolean(rawInstaller.three_day_blinds)) brands.push("Three Day Blinds"); // Use DB column name

          const certifications: InstallerCertification[] = [];
          const pvCert = standardizeCertificationName(rawInstaller.Powerview_Certification);
          if (pvCert) certifications.push(pvCert);
          
          const shutterCert = standardizeCertificationName(rawInstaller.Shutter_Certification_Level);
          if (shutterCert) certifications.push(shutterCert);

          const draperyCert = standardizeCertificationName(rawInstaller.Draperies_Certification_Level);
          if (draperyCert) certifications.push(draperyCert);

          const pipCert = standardizeCertificationName(rawInstaller.PIP_Certification_Level);
          if (pipCert) certifications.push(pipCert);

          return {
            id: rawInstaller.id,
            name: rawInstaller.name || rawInstaller.H,
            address: `${rawInstaller.address1 || ''} ${rawInstaller.add2 || ''}, ${rawInstaller.city || ''}, ${rawInstaller.state || ''} ${rawInstaller.postalcode || ''}`.trim(),
            phone: rawInstaller.primary_phone,
            skills: skills,
            brands: brands, // New
            certifications: certifications,
            latitude: rawInstaller.latitude,
            longitude: rawInstaller.longitude,
            zipCode: rawInstaller.postalcode,
            installerVendorId: rawInstaller.Installer_Vendor_ID?.toString(),
            acceptsShipments: rawInstaller.Shipment === 'Yes',
            rawSupabaseData: rawInstaller,
          };
        });

        setInstallers(mappedInstallers);

        // Extract unique states/provinces for the MultiSelect
        const uniqueStates = new Set<string>();
        (data || []).forEach((rawInstaller: any) => {
            if (rawInstaller.state) {
                uniqueStates.add(rawInstaller.state);
            }
        });
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
    // Only fetch user location if additional filters are NOT active
    if (!showAdditionalFilters || selectedStatesProvinces.length === 0) {
      fetchUserLocation();
    } else {
      setUserLocation(null); // Clear user location if state filter is active
      setInstallerDistancesMap(new Map()); // Clear distances
    }
  }, [searchedZipCode, showAdditionalFilters, selectedStatesProvinces]); // Add new dependencies

  useEffect(() => {
    const fetchDrivingDistances = async () => {
      if (!userLocation || userLocation.lat === null || userLocation.lng === null || !installers.length) {
        setInstallerDistancesMap(new Map());
        return;
      }

      if (!OPENROUTESERVICE_API_KEY) {
        console.error("OpenRouteService API key is not set.");
        toast.error("Mapping service is not configured. Please ensure your OpenRouteService API key is set.");
        setInstallerDistancesMap(new Map());
        return;
      }

      setLoadingOrs(true);
      setInstallerDistancesMap(new Map());

      const validInstallers = installers.filter(i => 
        i.latitude !== null && i.latitude !== undefined && 
        i.longitude !== null && i.longitude !== undefined &&
        i.id !== null && i.id !== undefined
      );

      if (validInstallers.length === 0) {
        toast.info("No installers with valid coordinates or IDs found for distance calculation.");
        setInstallerDistancesMap(new Map());
        setLoadingOrs(false);
        return;
      }

      const locations = [
        [userLocation.lng, userLocation.lat],
        ...validInstallers.map(i => [i.longitude!, i.latitude!])
      ];

      const destinationsIndices = Array.from({ length: validInstallers.length }, (_, i) => i + 1);

      try {
        const res = await fetch("https://api.openrouteservice.org/v2/matrix/driving-car", {
          method: "POST",
          headers: {
            "Authorization": OPENROUTESERVICE_API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            locations: locations,
            sources: [0],
            destinations: destinationsIndices,
            metrics: ["distance"]
          })
        });

        if (!res.ok) {
          const errorData = await res.json();
          console.error("OpenRouteService API error:", errorData);
          throw new Error(`OpenRouteService API error: ${res.status} - ${errorData.error?.message || res.statusText}`);
        }

        const data = await res.json();
        const distances = data.distances ? data.distances[0] : [];
        
        const newMap = new Map<string, number>();
        validInstallers.forEach((installer, index) => {
          const distanceInMeters = distances[index];
          if (distanceInMeters !== undefined && distanceInMeters !== null && distanceInMeters !== Infinity) {
            // Store distance in miles (for consistent filtering with searchRadius)
            newMap.set(installer.id, distanceInMeters / 1609.34); 
          }
        });
        setInstallerDistancesMap(newMap);

      } catch (error) {
        console.error("Error fetching driving distances:", error);
        toast.error("Failed to calculate driving distances. Please try again.");
        setInstallerDistancesMap(new Map());
      } finally {
        setLoadingOrs(false);
      }
    };

    // Only fetch driving distances if additional filters are NOT active
    if (!showAdditionalFilters || selectedStatesProvinces.length === 0) {
      if (searchedZipCode && userLocation?.lat !== null && userLocation?.lng !== null && installers.length > 0) {
        fetchDrivingDistances();
      } else {
        setInstallerDistancesMap(new Map());
      }
    } else {
      setInstallerDistancesMap(new Map()); // Clear distances if state filter is active
    }
  }, [userLocation, installers, searchedZipCode, OPENROUTESERVICE_API_KEY, showAdditionalFilters, selectedStatesProvinces]);

  const filteredAndSortedInstallers = useMemo(() => {
    let currentInstallers = installers;

    // Apply brand filters
    if (selectedBrands.length > 0) {
      currentInstallers = currentInstallers.filter((installer) =>
        selectedBrands.every((brand) => (installer.brands ?? []).includes(brand))
      );
    }

    // Apply product skill filters
    if (selectedProductSkills.length > 0) {
      currentInstallers = currentInstallers.filter((installer) =>
        selectedProductSkills.every((skill) => (installer.skills ?? []).includes(skill))
      );
    }

    // Apply certification filters
    if (selectedCertifications.length > 0) {
      currentInstallers = currentInstallers.filter((installer) =>
        selectedCertifications.every((cert) => (installer.certifications ?? []).includes(cert))
      );
    }

    // Apply state/province filter if enabled and selected
    if (showAdditionalFilters && selectedStatesProvinces.length > 0) {
      currentInstallers = currentInstallers.filter(installer =>
        installer.rawSupabaseData?.state && selectedStatesProvinces.includes(installer.rawSupabaseData.state)
      );
      // When filtering by state/province, we don't apply distance/zip code logic
      return currentInstallers; // Return early
    }

    // Otherwise, apply distance/zip code filter
    let installersWithDistance = currentInstallers.map(installer => {
      const distance = installerDistancesMap.get(installer.id);
      return {
        ...installer,
        distance: distance !== undefined ? distance : Infinity
      };
    });

    installersWithDistance.sort((a, b) => a.distance - b.distance);

    const installersWithinRadius = installersWithDistance.filter(installer => installer.distance <= searchRadius);

    return installersWithinRadius;
  }, [installers, selectedBrands, selectedProductSkills, selectedCertifications, installerDistancesMap, searchRadius, showAdditionalFilters, selectedStatesProvinces]);

  const handleBrandChange = (brand: InstallerBrand, checked: boolean) => {
    setSelectedBrands((prev) =>
      checked ? [...prev, brand] : prev.filter((b) => b !== brand)
    );
  };

  const handleProductSkillChange = (skill: InstallerSkill, checked: boolean) => {
    setSelectedProductSkills((prev) =>
      checked ? [...prev, skill] : prev.filter((s) => s !== skill)
    );
  };

  const handleCertificationChange = (certification: InstallerCertification, checked: boolean) => {
    setSelectedCertifications((prev) =>
      checked ? [...prev, certification] : prev.filter((c) => c !== certification)
    );
  };

  const handleInstallerCardClick = (installerId: string) => {
    setSelectedInstallerId(installerId);
  };

  const handleRadiusChange = (radius: number) => {
    setSearchRadius(radius); // radius is always in miles from DistanceFilter
  };

  const isLoadingData = loadingInstallers || loadingUserLocation || loadingOrs;

  return (
    <div className="flex flex-col min-h-screen">
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 flex-grow">
        <div className="flex flex-col sm:flex-row items-center justify-center mb-8 text-center sm:text-left">
          <img 
            src="https://upload.wikimedia.org/wikipedia/commons/a/aa/Hunter_Douglas_Logo.svg" 
            alt="Hunter Douglas Logo" 
            className="h-12 mb-4 sm:mb-0 sm:mr-4" 
          />
          <h1 className="text-3xl font-bold text-gray-700">
            Installer Locator
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Filters + Installer List */}
          <div className="lg:col-span-1 space-y-6">
            {/* Filter Sidebar content */}
            <div className="p-4 border rounded-lg shadow-sm bg-card space-y-6">
              <h2 className="text-2xl font-semibold mb-4">Find Installers</h2>
              
              {/* Conditional rendering based on Additional Filters toggle */}
              {!showAdditionalFilters && (
                <>
                  <InstallerSearch onSearch={setSearchedZipCode} />
                  <DistanceFilter selectedRadius={searchRadius} onRadiusChange={handleRadiusChange} />
                  <Separator />
                </>
              )}

              <BrandSkillFilter // Updated component name
                selectedBrands={selectedBrands}
                selectedProductSkills={selectedProductSkills}
                selectedCertifications={selectedCertifications}
                onBrandChange={handleBrandChange}
                onProductSkillChange={handleProductSkillChange}
                onCertificationChange={handleCertificationChange}
                hideBrands={true} // Hide brands on Locator page
              />

              <Separator />

              {/* Additional Filters Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-lg">Additional Filters</h3>
                  <Switch
                    id="additional-filters-toggle"
                    checked={showAdditionalFilters}
                    onCheckedChange={setShowAdditionalFilters}
                  />
                </div>
                {showAdditionalFilters && (
                  <div className="space-y-2 mt-2">
                    <Label htmlFor="state-province-select">State / Province</Label>
                    <MultiSelect
                      options={allStatesProvinces}
                      selectedValues={selectedStatesProvinces}
                      onValueChange={setSelectedStatesProvinces}
                      placeholder="Select States/Provinces"
                    />
                  </div>
                )}
              </div>
            </div>
            {/* Installer List (moved here) */}
            <div className="mt-8">
              {isLoadingData ? (
                <p className="text-center text-gray-500 mt-8">
                  {loadingInstallers ? "Loading installers..." : ""}
                  {loadingUserLocation && searchedZipCode && (!showAdditionalFilters || selectedStatesProvinces.length === 0) ? `Getting location for ${searchedZipCode}...` : ""}
                  {loadingOrs && searchedZipCode && userLocation?.lat !== null && (!showAdditionalFilters || selectedStatesProvinces.length === 0) ? "Calculating driving distances..." : ""}
                </p>
              ) : (
                <InstallerList
                  installers={filteredAndSortedInstallers}
                  searchedZipCode={searchedZipCode}
                  selectedInstallerId={selectedInstallerId}
                  onInstallerCardClick={handleInstallerCardClick}
                />
              )}
              {searchedZipCode && (!userLocation || userLocation.lat === null) && !loadingUserLocation && (!showAdditionalFilters || selectedStatesProvinces.length === 0) && (
                <p className="text-center text-sm text-red-500 mt-4">
                  Could not get coordinates for the entered zip code. Please try another.
                </p>
              )}
            </div>
          </div>

          {/* Right Column: Map and Button */}
          <div className="lg:col-span-2">
            <div className="h-[600px] w-full rounded-lg overflow-hidden shadow-sm">
              <InstallerMapComponent
                userLocation={userLocation}
                installers={filteredAndSortedInstallers}
                selectedInstallerId={selectedInstallerId}
              />
            </div>
            <div className="flex justify-end mt-4 space-x-2">
              <Button 
                onClick={() => navigate("/public-locator")} // New button to navigate to public locator
                variant="outline"
              >
                Public Locator View
              </Button>
              <Button 
                onClick={toggleCountry}
                variant="outline"
              >
                Switch to {isCanada ? "US" : "Canada"} View
              </Button>
              <Button 
                onClick={() => navigate("/installers")}
              >
                Installer Management
              </Button>
            </div>
            {/* Installer Summary */}
            {!isLoadingData && filteredAndSortedInstallers.length > 0 && (
              <InstallerSummary
                installers={filteredAndSortedInstallers}
                searchedZipCode={searchedZipCode}
                userLocation={userLocation}
                showAdditionalFilters={showAdditionalFilters}
                selectedStatesProvinces={selectedStatesProvinces}
                searchRadius={searchRadius}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Locator;