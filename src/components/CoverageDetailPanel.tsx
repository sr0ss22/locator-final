import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { useCoverageDetail, type CoverageDetailRow } from "@/hooks/useInstallerData";

type StatusFilter = "all" | "free" | "paid";

/**
 * Slide-in side panel that shows the per-postal-code coverage breakdown
 * for a ZIP (USA), FSA (Canada), or a full 6-character Canadian postal
 * code. Opened either by clicking a coverage polygon on the internal
 * locator's map OR by clicking the search-coverage button in the
 * coverage legend (which opens the panel in "search mode" — empty
 * results, focused search input).
 *
 * Admin only — exposes installer names and so the underlying
 * get_coverage_detail RPC enforces public.is_admin().
 *
 * Implemented as a NON-MODAL slide-out (not the shadcn `<Sheet>` /
 * Radix Dialog) so the map, filters, and installer list all remain
 * fully visible and interactive while the panel is open.
 */

export interface CoverageDetailPanelTarget {
  country: "USA" | "Canada";
  // For Canada this is either a 3-char FSA (lookup the whole FSA) or
  // a 6-char normalized postal code (lookup that one postal). For US
  // it's the 5-digit ZIP. Empty string = search mode (panel renders
  // the input but no results).
  zipOrFsa: string;
  totalPostalCodes?: number | null;
}

interface CoverageDetailPanelProps {
  target: CoverageDetailPanelTarget | null;
  onTargetChange: (target: CoverageDetailPanelTarget | null) => void;
  // The current country toggle on the map. Used as the default for
  // user-typed searches so an admin in Canada mode doesn't have to
  // restate it.
  country: "USA" | "Canada";
  onClose: () => void;
  // The same installer filter the overlay is currently using. Passed
  // through to the RPC so the panel only shows postal codes covered by
  // installers actually on the map (matching the polygon colouring).
  installerIds: string[] | null;
}

const CoverageDetailPanel: React.FC<CoverageDetailPanelProps> = ({
  target,
  onTargetChange,
  country,
  onClose,
  installerIds,
}) => {
  const open = target != null;
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Controlled search input. Re-syncs whenever the target changes so
  // clicking a polygon updates the visible text and a fresh "search
  // mode" open clears it.
  const [searchValue, setSearchValue] = useState<string>(target?.zipOrFsa ?? "");
  useEffect(() => {
    setSearchValue(target?.zipOrFsa ?? "");
  }, [target]);

  const [searchError, setSearchError] = useState<string | null>(null);

  // Status pill filter — restricts the rendered postal-code list to
  // Free (status = Approved) or Paid (status = Needs Approval). The
  // colour/label scheme mirrors the legend swatches and the row
  // badges below. Resets to "all" whenever the user opens a new
  // target so an old filter doesn't accidentally hide everything on
  // a fresh lookup.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  useEffect(() => {
    setStatusFilter("all");
  }, [target?.country, target?.zipOrFsa]);

  // Auto-focus the input the first time the panel opens — covers both
  // polygon clicks (so the input is ready for a follow-up search) and
  // the search-mode entry (where it's the only thing to interact with).
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 100);
      return () => window.clearTimeout(id);
    }
  }, [open]);

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

  // Only fetch when we have a concrete lookup target (empty zipOrFsa
  // means we're sitting in search mode with no query yet).
  const enabled = open && !!target?.zipOrFsa;
  const { data, isLoading, error } = useCoverageDetail({
    country: target?.country ?? country,
    zipOrFsa: enabled ? target!.zipOrFsa : null,
    installerIds,
    enabled,
  });

  // Bucket counts off the unfiltered row set so the tab labels
  // always show the underlying totals (filtering shouldn't make the
  // counts in the tabs themselves move).
  const totalRowCount = data?.rows.length ?? 0;
  const freeRowCount = useMemo(
    () => (data?.rows ?? []).filter((r) => r.status === "Approved").length,
    [data],
  );
  const paidRowCount = useMemo(
    () => (data?.rows ?? []).filter((r) => r.status === "Needs Approval").length,
    [data],
  );

  // Rows after the status pill is applied — drives the rendered list
  // and the "X covering this area" header subtitle.
  const filteredRows = useMemo<CoverageDetailRow[]>(() => {
    if (!data?.rows) return [];
    if (statusFilter === "all") return data.rows;
    const wanted = statusFilter === "free" ? "Approved" : "Needs Approval";
    return data.rows.filter((r) => r.status === wanted);
  }, [data, statusFilter]);

  // Group rows by postal code so each postal renders as a small section
  // with the installers covering it. For US ZIPs this collapses to a
  // single section (one polygon = one postal code) which is exactly
  // what we want.
  const grouped = useMemo(() => {
    const map = new Map<string, CoverageDetailRow[]>();
    for (const row of filteredRows) {
      const bucket = map.get(row.postal_code) ?? [];
      bucket.push(row);
      map.set(row.postal_code, bucket);
    }
    return map;
  }, [filteredRows]);

  // Count of postals across the WHOLE result set (independent of the
  // status filter) so the FSA ratio subtitle stays accurate even
  // while the user is poking at the tabs.
  const coveredPostalCount = useMemo(() => {
    if (!data?.rows) return 0;
    const postals = new Set<string>();
    for (const row of data.rows) postals.add(row.postal_code);
    return postals.size;
  }, [data]);
  const totalPostalCount = target?.totalPostalCodes ?? null;
  const installerCount = useMemo(() => {
    const ids = new Set<string>();
    for (const row of filteredRows) ids.add(row.installer_id);
    return ids.size;
  }, [filteredRows]);

  const filteredPostalCount = grouped.size;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseSearchInput(searchValue, country);
    if (!parsed) {
      setSearchError("Enter a 5-digit US ZIP, a Canadian FSA (e.g. V0X), or a full Canadian postal code (e.g. V0X 1T0).");
      return;
    }
    setSearchError(null);
    onTargetChange({
      country: parsed.country,
      zipOrFsa: parsed.normalized,
      totalPostalCodes: null,
    });
  };

  const handleClearSearch = () => {
    setSearchValue("");
    setSearchError(null);
    onTargetChange({ country, zipOrFsa: "" });
    inputRef.current?.focus();
  };

  const title = target?.zipOrFsa
    ? target.country === "USA"
      ? `ZIP ${target.zipOrFsa}`
      : target.zipOrFsa.length === 6
        ? `Postal ${formatPostal(target.zipOrFsa, "Canada")}`
        : `FSA ${target.zipOrFsa}`
    : "Coverage lookup";

  const subtitle = !target?.zipOrFsa
    ? "Search by ZIP, FSA, or full postal code"
    : target.country === "Canada" && target.zipOrFsa.length === 3
      ? canadaFsaSubtitle({
          coveredPostalCount,
          totalPostalCount,
          installerCount,
        })
      : installerCount > 0
        ? `${installerCount} installer${installerCount === 1 ? "" : "s"} covering this area`
        : "Coverage breakdown";

  return (
    <aside
      // Anchored to the LEFT edge of the viewport. Full-screen width
      // on small viewports (a 380 px panel on a 360 px phone leaves a
      // useless sliver of map behind it and the user can't scroll
      // through long postal lists with one thumb). Locked at 380 px
      // from sm+ so on desktop the map and the rest of the layout
      // stay visible. `pointer-events-none` when closed so clicks
      // pass through to anything underneath.
      aria-hidden={!open}
      aria-label="Coverage details"
      className={cn(
        "fixed left-0 top-0 bottom-0 z-[1100]",
        "w-screen sm:w-[380px]",
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
            <span className="truncate">{title}</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
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

      <form onSubmit={handleSubmit} className="px-5 pb-3" role="search">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
          <Input
            ref={inputRef}
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder={country === "Canada" ? "FSA or postal (V0X 1T0)" : "US ZIP (12345)"}
            aria-label="Search by ZIP, FSA, or postal code"
            className="h-9 pl-8 pr-8 text-sm"
          />
          {searchValue && (
            <button
              type="button"
              onClick={handleClearSearch}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {searchError && (
          <p className="text-[11px] text-red-600 mt-1.5 leading-snug">{searchError}</p>
        )}
      </form>

      {/* Status pill row — only shown when there are results to filter.
          Mirrors the Free / Paid colour vocabulary the legend and row
          badges use so it reads as "filter by the colours you see".
          Counts come off the unfiltered row set so each pill always
          shows the true total in its bucket. */}
      {enabled && !isLoading && totalRowCount > 0 && (
        <div className="px-5 pb-3">
          <ToggleGroup
            type="single"
            value={statusFilter}
            onValueChange={(value) => {
              if (value) setStatusFilter(value as StatusFilter);
            }}
            className="flex w-full items-center gap-1.5"
          >
            <ToggleGroupItem
              value="all"
              aria-label="Show all"
              className="flex-1 h-7 text-[12px] rounded-full border border-input bg-transparent text-gray-700 hover:bg-gray-50 data-[state=on]:bg-sky-50 data-[state=on]:text-sky-700 data-[state=on]:border-sky-300"
            >
              All <span className="ml-1 text-[10px] text-gray-400">{totalRowCount}</span>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="free"
              aria-label="Show free only"
              className="flex-1 h-7 text-[12px] rounded-full border border-input bg-transparent text-gray-700 hover:bg-gray-50 data-[state=on]:bg-green-50 data-[state=on]:text-green-700 data-[state=on]:border-green-300"
            >
              Free <span className="ml-1 text-[10px] text-gray-400">{freeRowCount}</span>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="paid"
              aria-label="Show paid only"
              className="flex-1 h-7 text-[12px] rounded-full border border-input bg-transparent text-gray-700 hover:bg-gray-50 data-[state=on]:bg-orange-50 data-[state=on]:text-orange-700 data-[state=on]:border-orange-300"
            >
              Paid <span className="ml-1 text-[10px] text-gray-400">{paidRowCount}</span>
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}

      <Separator />

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {!enabled ? (
          <div className="text-sm text-gray-500 py-6 text-center space-y-1">
            <p>Type a ZIP, FSA, or full postal code above and press enter.</p>
            <p className="text-xs text-gray-400">
              Tip: click any coverage polygon on the map to inspect it directly.
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
            Loading coverage details…
          </div>
        ) : error ? (
          <div className="text-sm text-red-600">Failed to load coverage details.</div>
        ) : totalRowCount === 0 ? (
          <div className="text-sm text-gray-500 py-6 text-center">
            No coverage from the currently visible installers.
          </div>
        ) : filteredPostalCount === 0 ? (
          <div className="text-sm text-gray-500 py-6 text-center space-y-2">
            <p>
              No {statusFilter === "free" ? "free" : "paid"} coverage from the
              currently visible installers.
            </p>
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className="text-xs text-sky-600 hover:text-sky-800 underline-offset-2 hover:underline"
            >
              Show all coverage
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {Array.from(grouped.entries()).map(([postal, rows]) => (
              <li key={postal} className="rounded-md border border-gray-200 p-3 bg-white">
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
                      <span className="text-gray-800 truncate">{row.installer_name}</span>
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

// Parses a free-form search input and normalizes it for the RPC.
// Returns null if the input doesn't match any known format. Country
// is auto-detected from the format itself — a 5-digit input is always
// a US ZIP, a 3- or 6-char alphanumeric (FSA pattern) is always Canada
// — so admins don't have to flip the country toggle just to inspect
// a coverage area across the border.
function parseSearchInput(
  raw: string,
  defaultCountry: "USA" | "Canada",
): { country: "USA" | "Canada"; normalized: string } | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;

  // US ZIP: 5 digits or 5-4. We strip the +4 (the RPC doesn't index it).
  const zipMatch = /^(\d{5})(?:-?\d{4})?$/.exec(cleaned);
  if (zipMatch) {
    return { country: "USA", normalized: zipMatch[1] };
  }

  // Canadian FSA (A1A) — 3 chars, letter-digit-letter.
  const fsaMatch = /^([A-Za-z]\d[A-Za-z])$/.exec(cleaned);
  if (fsaMatch) {
    return { country: "Canada", normalized: fsaMatch[1].toUpperCase() };
  }

  // Canadian full postal (A1A 1A1 or A1A1A1).
  const postalMatch = /^([A-Za-z]\d[A-Za-z])\s*(\d[A-Za-z]\d)$/.exec(cleaned);
  if (postalMatch) {
    return {
      country: "Canada",
      normalized: `${postalMatch[1]}${postalMatch[2]}`.toUpperCase(),
    };
  }

  // Fall back to the current country toggle so a stray short input
  // doesn't silently jump countries.
  void defaultCountry;
  return null;
}

function canadaFsaSubtitle(args: {
  coveredPostalCount: number;
  totalPostalCount: number | null;
  installerCount: number;
}): string {
  const { coveredPostalCount, totalPostalCount, installerCount } = args;
  if (totalPostalCount == null || totalPostalCount <= 0) {
    if (coveredPostalCount > 0) {
      return `${coveredPostalCount} postal code${coveredPostalCount === 1 ? "" : "s"} covered · ${installerCount} installer${installerCount === 1 ? "" : "s"}`;
    }
    return "Coverage breakdown";
  }
  const pct = Math.round((coveredPostalCount / totalPostalCount) * 100);
  const displayPct = pct === 0 && coveredPostalCount > 0 ? "<1" : `${pct}`;
  return `${coveredPostalCount} / ${totalPostalCount} postal codes covered (${displayPct}%)`;
}

export default CoverageDetailPanel;
