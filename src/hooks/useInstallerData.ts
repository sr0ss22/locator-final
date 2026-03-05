import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
  });
};

const fetchInstallerZipCodes = async (installerId: string) => {
  let allZipData: any[] = [];
  let page = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabase
      .from('installer_zip_codes')
      .select('zip_code, status, state_province')
      .eq('installer_id', installerId)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (data) allZipData = allZipData.concat(data);
    if (!data || data.length < 1000) hasMore = false;
    else page++;
  }
  return allZipData;
};

export const useInstallerZipCodes = (installerId: string) => {
  return useQuery({
    queryKey: ['installerZipCodes', installerId],
    queryFn: () => fetchInstallerZipCodes(installerId),
    enabled: !!installerId,
  });
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