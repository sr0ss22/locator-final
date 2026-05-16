import React from "react";
import { Eye, EyeOff } from "lucide-react";
import { COVERAGE_COLORS } from "@/lib/coverageStyle";
import { cn } from "@/lib/utils";

interface CoverageLegendProps {
  visible: boolean;
  onToggle: () => void;
  // Optional: rendered loading state, e.g. while RPC is in flight.
  isLoading?: boolean;
  className?: string;
}

/**
 * Floating legend + show/hide toggle for the coverage overlay. Designed
 * to live as an absolutely-positioned child of the map container.
 *
 * Rendered as a single compact card (collapsed) or with the swatch list
 * expanded — toggled by the eye/eye-off button.
 */
// Swatch opacity intentionally kept higher than the live polygon
// opacity (0.3) so the legend reads clearly against the white card
// background — the polygons rely on the basemap underneath for
// contrast, the legend doesn't.
const SwatchSolid: React.FC<{ color: string }> = ({ color }) => (
  <span
    className="inline-block w-3.5 h-3.5 rounded-sm border border-black/10"
    style={{ backgroundColor: color, opacity: 0.55 }}
    aria-hidden="true"
  />
);

const SwatchStriped: React.FC<{ base: string; stripe: string }> = ({ base, stripe }) => (
  <span
    className="inline-block w-3.5 h-3.5 rounded-sm border border-black/10"
    aria-hidden="true"
    style={{
      backgroundColor: base,
      opacity: 0.55,
      backgroundImage: `repeating-linear-gradient(45deg, transparent 0 4px, ${stripe} 4px 6px)`,
      backgroundBlendMode: "multiply",
    }}
  />
);

export const CoverageLegend: React.FC<CoverageLegendProps> = ({
  visible,
  onToggle,
  isLoading,
  className,
}) => {
  return (
    <div
      className={cn(
        "absolute z-[1000] bg-white/95 backdrop-blur rounded-md shadow-md border border-gray-200 text-xs",
        "select-none",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={visible}
          aria-label={visible ? "Hide coverage overlay" : "Show coverage overlay"}
          className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-gray-100 text-gray-700"
        >
          {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
        <span className="font-semibold text-gray-800">Coverage</span>
        {isLoading && visible && (
          <span className="text-[10px] text-gray-500 ml-1">loading…</span>
        )}
      </div>
      {visible && (
        <ul className="px-2 pb-2 pt-0 space-y-1 text-gray-700">
          <li className="flex items-center gap-2">
            <SwatchSolid color={COVERAGE_COLORS.free.fill} />
            <span>All free</span>
          </li>
          <li className="flex items-center gap-2">
            <SwatchSolid color={COVERAGE_COLORS.paid.fill} />
            <span>All paid</span>
          </li>
          <li className="flex items-center gap-2">
            <SwatchStriped base={COVERAGE_COLORS.free.fill} stripe={COVERAGE_COLORS.paid.fill} />
            <span>Mostly free, some paid</span>
          </li>
          <li className="flex items-center gap-2">
            <SwatchStriped base={COVERAGE_COLORS.paid.fill} stripe={COVERAGE_COLORS.free.fill} />
            <span>Mostly paid, some free</span>
          </li>
        </ul>
      )}
    </div>
  );
};

export default CoverageLegend;
