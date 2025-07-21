import React, { useState, useEffect, useMemo, useRef } from "react";
import InstallerSearch from "@/components/InstallerSearch";
import BrandSkillFilter from "@/components/BrandSkillFilter"; // Updated import
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
import { Installer, InstallerCertification, InstallerBrand, InstallerSkill } from "@/types/installer"; // Ensure Installer type is imported

const PublicLocator: React.FC = () => {
  const [searchedZipCode, setSearchedZipCode] = useState<string>("");
  const [selectedBrands, setSelectedBrands] = useState<InstallerBrand[]>([]); // New state
  const [selectedProductSkills, setSelectedProductSkills] = useState<InstallerSkill[]>([]); // New state
  const [selectedCertifications, setSelectedCertifications] = useState<InstallerCertification[]>([]);
  
  // Single state for the user's determined search location
  const [userSearchLocation, setUserSearchLocation] = useState<{ lat: number | null; lng: number | null } | null>(null);
  
  const [loadingLocation, setLoadingLocation] = useState<boolean>(false);
  const [installers, setInstallers] = useState<Installer[]>([]);
  const [loadingInstallers, setLoadingInstallers] = useState<boolean>(true);
  const [installerDistancesMap, setInstallerDistancesMap] = useState<Map<string, number>>(new Map());
  const [loadingOrs, setLoadingOrs] = useState<boolean>(false);
  const [selectedInstallerId, setSelectedInstallerId] = useState<string | null>(null);
  const [searchRadius, setSearchRadius] = useState<number>(50); // State for search radius in miles

  const { distanceUnit } = useCountrySettings();

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

    const normalizedCert = cert
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    if (normalizedCert.includes("motorization pro")) { // Renamed here
      return "Motorization Pro";
    }
    
    const validCertificationsMap: { [key: string]: InstallerCertification } = {
      "certified installer": "Certified Installer",
      "master installer": "Master Installer",
      "master shutter": "Shutter Pro",
      "drapery pro": "Drapery Pro",
      "pip certified": "PIP Certified",
    };
    
    return validCertificationsMap[normalizedCert] || null;
  };

  // Effect to fetch all installers once on mount
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
      }
      setLoadingInstallers(false);
    };

    fetchInstallers();
  }, []);

  // Effect to determine user's location (manual search takes precedence, then auto-detect)
  useEffect(() => {
    const determineAndSetLocation = async () => {
      setLoadingLocation(true);
      let coords = { lat: null, lng: null };

      if (searchedZipCode) {
        // Manual search takes precedence
        console.log("Location: Fetching coordinates for searched ZIP code:", searchedZipCode);
        coords = await getCoordinates({ searchText: searchedZipCode });
        if (coords.lat === null || coords.lng === null) {
          toast.error("Could not find coordinates for the entered zip code. Please ensure it's valid.");
        }
      } else {
        // Auto-detect if no manual search
        console.log("Location: Attempting auto-detection (browser geolocation first, then IP)...");
        if (navigator.geolocation) {
          try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: false,
                timeout: 5000,
                maximumAge: 0
              });
            });
            coords = { lat: position.coords.latitude, lng: position.coords.longitude };
            console.log("Location: Browser geolocation successful:", coords);
            toast.info("Your location detected via browser.");
          } catch (error: any) {
            console.warn("Location: Browser geolocation failed:", error.message);
            toast.info("Could not get location from browser. Trying IP-based location...");
          }
        } else {
          console.warn("Location: Browser does not support navigator.geolocation.");
          toast.info("Your browser does not support location detection. Trying IP-based location...");
        }

        if (coords.lat === null || coords.lng === null) {
          console.log("Location: Falling back to IP-based location...");
          coords = await getIpLocation();
          if (coords.lat !== null && coords.lng !== null) {
            console.log("Location: IP geolocation successful:", coords);
            toast.info("Your location detected via IP address.");
          } else {
            console.warn("Location: IP geolocation failed.");
            toast.info("Could not determine your location. Please enter a zip code.");
          }
        }
      }
      setUserSearchLocation(coords);
      setLoadingLocation(false);
      setSelectedInstallerId(null); // Clear selected installer on new search
      setInstallerDistancesMap(new Map()); // Clear distances for new location
      console.log("Location: setUserSearchLocation to", coords);
    };

    determineAndSetLocation();
  }, [searchedZipCode]); // This effect now depends only on searchedZipCode

  // Effect to fetch driving distances based on the userSearchLocation and installers
  useEffect(() => {
    const fetchDrivingDistances = async () => {
      console.log("ORS: Attempting to fetch driving distances...");
      console.log("ORS: userSearchLocation:", userSearchLocation);
      console.log("ORS: installers.length:", installers.length);

      if (!userSearchLocation || userSearchLocation.lat === null || userSearchLocation.lng === null || installers.length === 0) {
        console.log("ORS: Conditions not met for fetching distances. Skipping.");
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
      // No need to clear map here, it's done when userSearchLocation changes
      // setInstallerDistancesMap(new Map()); 

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
        [userSearchLocation.lng, userSearchLocation.lat],
        ...validInstallers.map(i => [i.longitude!, i.latitude!])
      ];

      const destinationsIndices = Array.from({ length: validInstallers.length }, (_, i) => i + 1);

      try {
        console.log("ORS: Making API call to OpenRouteService...");
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
          if (res.status === 429) {
            toast.error("Rate limit exceeded for distance calculation. Please wait a moment and try again.", { duration: 5000 });
          } else if (res.status === 0) { // CORS or network error
            toast.error("Network or CORS error when fetching distances. Ensure your domain is allowed by OpenRouteService.", { duration: 5000 });
          } else {
            toast.error(`Failed to calculate driving distances: ${errorData.error?.message || res.statusText}`, { duration: 5000 });
          }
          throw new Error(`OpenRouteService API error: ${res.status} - ${errorData.error?.message || res.statusText}`);
        }

        const data = await res.json();
        const distances = data.distances ? data.distances[0] : [];
        
        const newMap = new Map<string, number>();
        validInstallers.forEach((installer, index) => {
          const distanceInMeters = distances[index];
          if (distanceInMeters !== undefined && distanceInMeters !== null && distanceInMeters !== Infinity) {
            newMap.set(installer.id, distanceInMeters / 1609.34); 
          }
        });
        setInstallerDistancesMap(newMap);
        console.log("ORS: Successfully fetched distances. Map updated.");

      } catch (error) {
        console.error("Error fetching driving distances:", error);
        // Toast messages are already handled above for specific ORS errors
      } finally {
        setLoadingOrs(false);
      }
    };

    // This condition ensures the fetch only happens when userSearchLocation is valid
    // and installers are loaded.
    if (userSearchLocation?.lat !== null && userSearchLocation?.lng !== null && installers.length > 0) {
      console.log("ORS Effect: Dependencies met. Triggering fetchDrivingDistances.");
      fetchDrivingDistances();
    } else {
      console.log("ORS Effect: Dependencies NOT met. userSearchLocation:", userSearchLocation, "installers.length:", installers.length);
      setInstallerDistancesMap(new Map());
    }
  }, [userSearchLocation, installers, OPENROUTESERVICE_API_KEY]);

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

    if (selectedCertifications.length > 0) {
      currentInstallers = currentInstallers.filter((installer) =>
        selectedCertifications.every((cert) => (installer.certifications ?? []).includes(cert))
      );
    }

    let installersWithDistance = currentInstallers.map(installer => {
      const distance = installerDistancesMap.get(installer.id);
      return {
        ...installer,
        distance: distance !== undefined ? distance : Infinity
      };
    });

    installersWithDistance.sort((a, b) => a.distance - b.distance);

    const installersWithinRadius = installersWithDistance.filter(installer => installer.distance <= searchRadius);

    console.log(`Filtered and sorted installers count: ${installersWithinRadius.length}`);
    if (installersWithinRadius.length === 0 && userSearchLocation?.lat !== null && userSearchLocation?.lng !== null) {
      console.log("No installers found within the current radius. Consider increasing the search radius or searching a different area.");
      console.log("Current userSearchLocation:", userSearchLocation);
      console.log("Current searchRadius:", searchRadius);
    }

    return installersWithinRadius;
  }, [installers, selectedBrands, selectedProductSkills, selectedCertifications, installerDistancesMap, searchRadius, userSearchLocation]);

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

  const isLoadingData = loadingInstallers || loadingLocation || loadingOrs;

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
              
              <InstallerSearch onSearch={setSearchedZipCode} />
              <DistanceFilter selectedRadius={searchRadius} onRadiusChange={handleRadiusChange} />
              <Separator />

              <BrandSkillFilter // Updated component name
                selectedBrands={selectedBrands}
                selectedProductSkills={selectedProductSkills}
                selectedCertifications={selectedCertifications}
                onBrandChange={handleBrandChange}
                onProductSkillChange={handleProductSkillChange}
                onCertificationChange={handleCertificationChange}
                hideBrands={true} // Hide brands on PublicLocator page
              />
            </div>
            {/* Installer List (moved here) */}
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
                />
              )}
              {searchedZipCode && (!userSearchLocation || userSearchLocation.lat === null) && !loadingLocation && (
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
                userLocation={userSearchLocation}
                installers={filteredAndSortedInstallers}
                selectedInstallerId={selectedInstallerId}
              />
            </div>
            
            {/* Installer Summary */}
            {!isLoadingData && filteredAndSortedInstallers.length > 0 && (
              <InstallerSummary
                installers={filteredAndSortedInstallers}
                searchedZipCode={searchedZipCode}
                userLocation={userSearchLocation}
                showAdditionalFilters={false}
                selectedStatesProvinces={[]}
                searchRadius={searchRadius}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicLocator;