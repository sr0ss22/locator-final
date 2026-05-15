import { useEffect, useState } from "react";
import { loadCanadaFsaGeometries, type CanadaFsaFeatureCollection } from "@/lib/canadaFsaGeometries";

interface UseCanadaFsaGeometriesArgs {
  enabled: boolean;
}

interface UseCanadaFsaGeometriesResult {
  data: CanadaFsaFeatureCollection | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * React wrapper around `loadCanadaFsaGeometries`. Triggers the lazy
 * dynamic-import + reprojection on first `enabled=true`, then resolves
 * to the cached FeatureCollection for every subsequent caller.
 *
 * Not implemented as a useQuery hook because the underlying work is
 * pure-CPU (file fetch + reproject), not a network request, and the
 * cached result lives in a module variable for the life of the page.
 */
export function useCanadaFsaGeometries({ enabled }: UseCanadaFsaGeometriesArgs): UseCanadaFsaGeometriesResult {
  const [data, setData] = useState<CanadaFsaFeatureCollection | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled || data) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    loadCanadaFsaGeometries()
      .then((fc) => {
        if (cancelled) return;
        setData(fc);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, data]);

  return { data, isLoading, error };
}
