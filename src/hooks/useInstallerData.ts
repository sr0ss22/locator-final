import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { run as getCoordinates } from "@/functions/getCoordinates";
import { toast } from "sonner";
import { calculateDistance } from "@/utils/distance";
import { Installer } from "@/types/installer";

// --- Queries ---

const fetchInstaller = async (installerId: string) => {
  const { data, error } = await supabase
    .from('installers')
    .select('*')
    .eq('id', installerId)
    .single();
  if (error) throw error;
  return data;
};

export const useInstaller = (installerId: string) => {
  return useQuery({
    queryKey: ['installer', installerId],
    queryFn: () => fetchInstaller(installerId),
    enabled: !!installerId,
    refetchOnWindowFocus: false,
    staleTime: Infinity, // Cache data indefinitely
  });
};

type InstallerZipRow = { zip_code: string; status: string; state_province: string };

const fetchInstallerZipCodes = async (installerId: string): Promise<InstallerZipRow[]> => {
  // PostgREST applies its db-max-rows cap (default 1,000 on Supabase) to ANY
  // multi-row response, including SETOF / TABLE-returning RPCs. A previous
  // attempt swapped a paginated table loop for a TABLE-returning RPC and was
  // silently truncated to 1,000 rows for installers with very large
  // territories. Returning a single jsonb value sidesteps the cap entirely
  // (one row = one parsed JSON array).
  const { data, error } = await supabase.rpc('get_installer_zip_codes_admin_v2', {
    p_installer_id: installerId,
  });
  if (error) throw error;
  if (!data) return [];
  // Supabase parses jsonb to a JS value automatically.
  return data as InstallerZipRow[];
};

export const useInstallerZipCodes = (installerId: string) => {
  return useQuery({
    queryKey: ['installerZipCodes', installerId],
    queryFn: () => fetchInstallerZipCodes(installerId),
    enabled: !!installerId,
    refetchOnWindowFocus: false,
    staleTime: Infinity, // Cache data indefinitely
  });
};

const fetchCanadianFsaPostalCounts = async (): Promise<Map<string, number>> => {
  // Returns total postal codes per FSA (3-char prefix) across all of Canada.
  // Used by TerritoryMap to colour FSAs accurately: fully covered vs partial
  // vs mixed. ~3,800 FSAs in Canada; jsonb avoids the row cap and arrives as
  // a single parsed object.
  const { data, error } = await supabase.rpc('get_canadian_fsa_postal_counts');
  if (error) throw error;
  const out = new Map<string, number>();
  if (!data || typeof data !== 'object') return out;
  for (const [fsa, count] of Object.entries(data as Record<string, number>)) {
    if (typeof count === 'number' && Number.isFinite(count)) {
      out.set(fsa.toUpperCase(), count);
    }
  }
  return out;
};

export const useCanadianFsaPostalCounts = (enabled: boolean) => {
  return useQuery({
    queryKey: ['canadianFsaPostalCounts'],
    queryFn: fetchCanadianFsaPostalCounts,
    enabled,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
};

export type CanadianPostalForFsa = {
  postal_code: string;
  province_abbr: string | null;
  latitude: number | null;
  longitude: number | null;
};

// Fetches the distinct, normalized postal codes for a single Canadian FSA.
// Used by the FSA bulk-action popup so a user can mark every postal in an
// FSA as Free, Paid, or remove all of them with one click.
export const fetchCanadianPostalsForFsa = async (
  fsa: string,
): Promise<CanadianPostalForFsa[]> => {
  const { data, error } = await supabase.rpc('get_canadian_postals_for_fsa', {
    p_fsa: fsa,
  });
  if (error) throw error;
  if (!Array.isArray(data)) return [];
  return data as CanadianPostalForFsa[];
};

// --- Mutation ---

const fromBooleanToSupabase = (value: boolean): number => {
  return value ? 1 : 0;
};

const saveInstallerChanges = async ({
  installerId,
  formData,
  initialFormData,
  selectedMapZipCodes,
  initialSelectedMapZipCodes,
}: {
  installerId: string;
  formData: any;
  initialFormData: any;
  selectedMapZipCodes: any[];
  initialSelectedMapZipCodes: any[];
}) => {
  // 1. Update installer profile if changed
  if (JSON.stringify(formData) !== JSON.stringify(initialFormData)) {
    const formattedData: any = {};
    for (const key in formData) {
      if (Object.prototype.hasOwnProperty.call(formData, key)) {
        const val = formData[key];
        if (typeof val === 'boolean') {
          formattedData[key] = fromBooleanToSupabase(val);
        } else if (['powerview_certification', 'shutter_certification_level', 'draperies_certification_level', 'pip_certification_level'].includes(key)) {
          formattedData[key] = Array.isArray(val) ? val.join(', ') : val;
        } else if (['installer_vendor_id', 'star_rating'].includes(key) && typeof val === 'string' && val !== '') {
          formattedData[key] = parseFloat(val);
        } else {
          formattedData[key] = val === "" ? null : val;
        }
      }
    }
    const { error: updateError } = await supabase.from("installers").update(formattedData).eq("id", installerId);
    if (updateError) throw updateError;
  }

  // 2. Update territories if changed
  const initialZipMap = new Map(initialSelectedMapZipCodes.map(z => [z.zipCode, z]));
  const currentZipMap = new Map(selectedMapZipCodes.map(z => [z.zipCode, z]));

  const addedZips = selectedMapZipCodes.filter(z => !initialZipMap.has(z.zipCode)).map(z => ({ zip_code: z.zipCode, state_province: z.stateProvince, assigned_status: z.assignedStatus }));
  const updatedZips = selectedMapZipCodes.filter(z => initialZipMap.has(z.zipCode) && initialZipMap.get(z.zipCode)!.assignedStatus !== z.assignedStatus).map(z => ({ zip_code: z.zipCode, assigned_status: z.assignedStatus }));
  const removedZips = initialSelectedMapZipCodes.filter(z => !currentZipMap.has(z.zipCode)).map(z => ({ zipCode: z.zipCode }));

  if (addedZips.length > 0 || updatedZips.length > 0 || removedZips.length > 0) {
    const { data: { session } } = await supabase.auth.getSession();
    const CHUNK_SIZE = 200;

    const processChanges = async (type: 'added' | 'updated' | 'removed', items: any[]) => {
      if (items.length === 0) return;
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        const body: any = { 
          installerId,
          addedZips: type === 'added' ? chunk : [],
          updatedZips: type === 'updated' ? chunk : [],
          removedZips: type === 'removed' ? chunk : [],
        };
        const { error } = await supabase.functions.invoke('save-public-territory-data', {
          headers: { Authorization: `Bearer ${session?.access_token}` },
          body,
        });
        if (error) throw new Error(`Failed during ${type} step: ${error.message}`);
      }
    };

    await processChanges('removed', removedZips);
    await processChanges('updated', updatedZips);
    await processChanges('added', addedZips);
  }
};

export const useSaveInstaller = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveInstallerChanges,
    onSuccess: (data, variables) => {
      // Invalidate queries to refetch data automatically
      queryClient.invalidateQueries({ queryKey: ['installer', variables.installerId] });
      queryClient.invalidateQueries({ queryKey: ['installerZipCodes', variables.installerId] });
    },
  });
};

// --- NEW QUERIES FOR LOCATOR PAGES ---

export const useAllInstallers = () => {
  return useQuery({
    queryKey: ['allInstallers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('installers').select('*');
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    refetchOnWindowFocus: false, // Prevent refetching on window focus
  });
};

// Returns the set of installer IDs whose territory has the given zip approved.
// Used by the admin Locator to surface the "Mileage Covered" badge on cards
// when the admin searches by zip (mirrors the public locator behavior).
//
// Only fires for inputs that actually look like a postal code (US ZIP or
// Canadian 6-char). Free-form city searches like "toronto" used to pass
// straight through to `zip_code=eq.toronto`, which produced an avalanche
// of meaningless 500s in the network panel.
const looksLikePostalCode = (raw: string): boolean => {
  const trimmed = raw.trim();
  // US ZIP (5 digits, optional +4)
  if (/^\d{5}(-?\d{4})?$/.test(trimmed)) return true;
  // Canadian postal code (A1A 1A1 or A1A1A1), space optional
  if (/^[A-Za-z]\d[A-Za-z][ ]?\d[A-Za-z]\d$/.test(trimmed)) return true;
  return false;
};

export const useInstallersInLocalArea = (zip: string | null | undefined) => {
  const enabled = !!zip && looksLikePostalCode(zip);
  return useQuery({
    queryKey: ['installersInLocalArea', zip],
    queryFn: async () => {
      if (!zip) return new Set<string>();
      let allRows: { installer_id: string }[] = [];
      let page = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('installer_zip_codes')
          .select('installer_id')
          .eq('zip_code', zip)
          .eq('status', 'Approved')
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows = allRows.concat(data);
        if (data.length < pageSize) break;
        page++;
      }
      return new Set(allRows.map((r) => r.installer_id));
    },
    enabled,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });
};

export const usePublicInstallers = (location: { lat: number | null, lng: number | null }, zip: string, radius: number) => {
  return useQuery({
    queryKey: ['publicInstallers', location.lat, location.lng, zip, radius],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('find_installers_for_public_locator', {
        search_lat: location.lat!,
        search_lng: location.lng!,
        search_zip: zip,
        radius_miles: radius
      });
      if (error) throw error;
      return data;
    },
    enabled: !!location.lat && !!location.lng,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    refetchOnWindowFocus: false, // Prevent refetching on window focus
  });
};

export const useDrivingDistances = (userLocation: { lat: number | null, lng: number | null }, installers: any[]) => {
    return useQuery({
        queryKey: ['drivingDistances', userLocation.lat, userLocation.lng, installers.map(i => i.id).join(',')],
        queryFn: async () => {
            try {
                const validInstallers = installers.filter(i => i.latitude != null && i.longitude != null && i.id != null);
                if (validInstallers.length === 0) {
                    return new Map<string, number>();
                }
                const locations = [[userLocation.lng!, userLocation.lat!], ...validInstallers.map(i => [i.longitude!, i.latitude!])];
                
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
                toast.info("Driving distances calculated.");
                return newMap;
            } catch (error) {
                console.error("Error fetching driving distances, falling back to straight-line distance:", error);
                toast.warning("Could not calculate driving distances. Showing straight-line distances instead.");
                const newMap = new Map<string, number>();
                installers.forEach(installer => {
                    if (installer.latitude && installer.longitude && userLocation.lat && userLocation.lng) {
                        const distance = calculateDistance(
                            userLocation.lat,
                            userLocation.lng,
                            installer.latitude,
                            installer.longitude
                        );
                        newMap.set(installer.id, distance);
                    }
                });
                return newMap;
            }
        },
        enabled: !!userLocation.lat && !!userLocation.lng && installers.length > 0,
        staleTime: 1000 * 60 * 5, // Cache for 5 minutes
        refetchOnWindowFocus: false, // Prevent refetching on window focus
    });
};