import React, { useMemo } from "react";
import { Loader2, MapPin } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useCoverageDetail, type CoverageDetailRow } from "@/hooks/useInstallerData";

/**
 * Slide-in side panel that shows the per-postal-code coverage breakdown
 * for a single ZIP (USA) or FSA (Canada). Opened by clicking a coverage
 * polygon on the internal locator's map. Admin only — exposes installer
 * names and so is gated by the underlying `get_coverage_detail` RPC,
 * which itself enforces `public.is_admin()`.
 *
 * The Canadian "partial coverage" striped polygons are the primary reason
 * this panel exists: they're a great at-a-glance signal but say nothing
 * about WHICH of the FSA's postal codes are covered. Clicking the polygon
 * lists them.
 */

export interface CoverageDetailPanelTarget {
  country: "USA" | "Canada";
  zipOrFsa: string;
  totalPostalCodes?: number | null;
}

interface CoverageDetailPanelProps {
  target: CoverageDetailPanelTarget | null;
  onClose: () => void;
  // The same installer filter the overlay is currently using. Passed
  // through to the RPC so the panel only shows postal codes covered by
  // installers actually on the map (matching the polygon colouring).
  installerIds: string[] | null;
}

const CoverageDetailPanel: React.FC<CoverageDetailPanelProps> = ({
  target,
  onClose,
  installerIds,
}) => {
  const open = target != null;

  const { data, isLoading, error } = useCoverageDetail({
    country: target?.country ?? "USA",
    zipOrFsa: target?.zipOrFsa ?? null,
    installerIds,
    enabled: open,
  });

  // Group rows by postal code so each postal renders as a small section
  // with the installers covering it. For US ZIPs this collapses to a
  // single section (one polygon = one postal code) which is exactly
  // what we want.
  const grouped = useMemo(() => {
    const map = new Map<string, CoverageDetailRow[]>();
    if (!data?.rows) return map;
    for (const row of data.rows) {
      const bucket = map.get(row.postal_code) ?? [];
      bucket.push(row);
      map.set(row.postal_code, bucket);
    }
    return map;
  }, [data]);

  const coveredPostalCount = grouped.size;
  const totalPostalCount = target?.totalPostalCodes ?? null;
  const installerCount = useMemo(() => {
    if (!data?.rows) return 0;
    const ids = new Set<string>();
    for (const row of data.rows) ids.add(row.installer_id);
    return ids.size;
  }, [data]);

  const title = target
    ? target.country === "USA"
      ? `ZIP ${target.zipOrFsa}`
      : `FSA ${target.zipOrFsa}`
    : "";

  const ratioText = (() => {
    if (target?.country !== "Canada") return null;
    if (totalPostalCount == null || totalPostalCount <= 0) {
      return coveredPostalCount > 0
        ? `${coveredPostalCount} postal code${coveredPostalCount === 1 ? "" : "s"} covered`
        : null;
    }
    const pct = Math.round((coveredPostalCount / totalPostalCount) * 100);
    const displayPct =
      pct === 0 && coveredPostalCount > 0 ? "<1" : `${pct}`;
    return `${coveredPostalCount} / ${totalPostalCount} postal codes covered (${displayPct}%)`;
  })();

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-[min(420px,100vw)] sm:max-w-md flex flex-col p-0"
      >
        <SheetHeader className="px-6 pt-6 pb-3">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <MapPin className="h-4 w-4 text-sky-500" aria-hidden="true" />
            {title}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {ratioText ??
              (installerCount > 0
                ? `${installerCount} installer${installerCount === 1 ? "" : "s"} covering this area`
                : "Coverage breakdown")}
          </SheetDescription>
        </SheetHeader>

        <Separator />

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
              Loading coverage details…
            </div>
          ) : error ? (
            <div className="text-sm text-red-600">
              Failed to load coverage details.
            </div>
          ) : coveredPostalCount === 0 ? (
            <div className="text-sm text-gray-500 py-6 text-center">
              No coverage from the currently visible installers.
            </div>
          ) : (
            <ul className="space-y-3">
              {Array.from(grouped.entries()).map(([postal, rows]) => (
                <li
                  key={postal}
                  className="rounded-md border border-gray-200 p-3 bg-white"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-sm font-mono font-semibold text-gray-900">
                      {formatPostal(postal, target?.country ?? "USA")}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-gray-400">
                      {rows.length} installer{rows.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {rows.map((row) => (
                      <li
                        key={`${row.installer_id}-${row.status}`}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="text-gray-800 truncate">
                          {row.installer_name}
                        </span>
                        <StatusBadge status={row.status} />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  // Map territory status to the same green/orange palette the overlay
  // uses so the panel and the polygon read as the same thing visually.
  const normalized = status?.trim();
  if (normalized === "Approved") {
    return (
      <Badge
        variant="outline"
        className="border-green-200 bg-green-50 text-green-700 text-[10px] uppercase tracking-wide"
      >
        Free
      </Badge>
    );
  }
  if (normalized === "Needs Approval") {
    return (
      <Badge
        variant="outline"
        className="border-orange-200 bg-orange-50 text-orange-700 text-[10px] uppercase tracking-wide"
      >
        Paid
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
      {normalized || "—"}
    </Badge>
  );
};

// Re-inserts the space in a Canadian postal code (e.g. K1A0B1 → K1A 0B1)
// so the panel renders the familiar A1A 1A1 form. US ZIPs are returned
// raw.
function formatPostal(postal: string, country: "USA" | "Canada"): string {
  if (country !== "Canada") return postal;
  const cleaned = postal.replace(/\s+/g, "").toUpperCase();
  if (cleaned.length === 6) {
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
  }
  return cleaned;
}

export default CoverageDetailPanel;
