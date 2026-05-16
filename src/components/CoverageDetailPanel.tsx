import React, { useEffect, useMemo } from "react";
import { Loader2, MapPin, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useCoverageDetail, type CoverageDetailRow } from "@/hooks/useInstallerData";

/**
 * Slide-in side panel that shows the per-postal-code coverage breakdown
 * for a single ZIP (USA) or FSA (Canada). Opened by clicking a coverage
 * polygon on the internal locator's map. Admin only — exposes installer
 * names and so is gated by the underlying `get_coverage_detail` RPC,
 * which itself enforces `public.is_admin()`.
 *
 * Implemented as a NON-MODAL slide-out (not the shadcn `<Sheet>` /
 * Radix Dialog) so the map, filters, and installer list all remain
 * fully visible and interactive while the panel is open. The previous
 * Sheet implementation dimmed the page with a dark overlay which
 * defeated the whole point of letting an admin compare the panel
 * against the polygon they just clicked.
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

  // ESC to close — matches the affordance the dialog version had for
  // free, since we no longer get it from Radix.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
    <aside
      // Anchored to the LEFT edge of the viewport — small enough that
      // the map (in the centre column of the locator layout) is still
      // visible to its right, but tall enough to scroll a long postal-
      // code list. `pointer-events-none` when closed so clicks pass
      // through to anything underneath.
      aria-hidden={!open}
      aria-label="Coverage details"
      className={cn(
        "fixed left-0 top-0 bottom-0 z-[1100]",
        "w-[min(380px,92vw)] sm:w-[380px]",
        "bg-white border-r border-gray-200 shadow-xl",
        "flex flex-col",
        "transform-gpu transition-transform duration-300 ease-out",
        open ? "translate-x-0" : "-translate-x-full pointer-events-none",
      )}
    >
      <div className="flex items-start justify-between gap-2 px-5 pt-5 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-base font-semibold text-gray-900">
            <MapPin className="h-4 w-4 text-sky-500" aria-hidden="true" />
            {title}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {ratioText ??
              (installerCount > 0
                ? `${installerCount} installer${installerCount === 1 ? "" : "s"} covering this area`
                : "Coverage breakdown")}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          aria-label="Close coverage details"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <Separator />

      <div className="flex-1 overflow-y-auto px-5 py-4">
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
    </aside>
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
