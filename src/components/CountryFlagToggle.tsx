import React from "react";
import { cn } from "@/lib/utils";

/**
 * Two-button flag toggle for switching the locator between US and
 * Canadian search modes. Lives next to "Find Installers" so the
 * country choice is obvious before the user even hits Search —
 * decoupling the country signal from anything geocoding can or
 * can't infer.
 *
 * Inline SVG flags (rather than emoji) so the glyphs render
 * crisply at any size and look identical across Mac/Windows/Linux
 * (where the flag emoji story is famously inconsistent).
 */

interface CountryFlagToggleProps {
  isCanada: boolean;
  onChange: (isCanada: boolean) => void;
  className?: string;
  // When true, hides the "US" / "CA" text labels and renders just the
  // flag glyphs as small square pills. Used in tight mobile headers
  // where the surrounding "Find Installers" + chevron + filter-count
  // badge are already eating the row.
  iconOnly?: boolean;
}

const UsFlag: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 60 30"
    className={className}
    aria-hidden="true"
    role="img"
  >
    <rect width="60" height="30" fill="#B22234" />
    <g fill="#FFFFFF">
      {/* 6 white stripes — drawn over the red base. */}
      {[1, 3, 5, 7, 9, 11].map((i) => (
        <rect key={i} x="0" y={i * (30 / 13)} width="60" height={30 / 13} />
      ))}
    </g>
    <rect width="24" height={30 * (7 / 13)} fill="#3C3B6E" />
  </svg>
);

const CaFlag: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 64 32"
    className={className}
    aria-hidden="true"
    role="img"
  >
    <rect width="64" height="32" fill="#D52B1E" />
    <rect x="16" width="32" height="32" fill="#FFFFFF" />
    {/* Stylised maple leaf — single path, scaled to fit the centre
        white panel. Coordinates from the official Canada flag spec
        simplified for inline rendering. */}
    <path
      d="M32 6 L33.2 9.4 L36.8 8.8 L35.6 12 L38.4 13.2 L35.2 15.2 L36 17.6 L33.2 17 L32.8 19.4 L31.2 19.4 L30.8 17 L28 17.6 L28.8 15.2 L25.6 13.2 L28.4 12 L27.2 8.8 L30.8 9.4 Z M31.4 19.4 L32.6 19.4 L32.4 26 L31.6 26 Z"
      fill="#D52B1E"
    />
  </svg>
);

const Pill: React.FC<{
  active: boolean;
  label: string;
  onClick: () => void;
  flag: React.ReactNode;
  iconOnly?: boolean;
}> = ({ active, label, onClick, flag, iconOnly }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    aria-label={`Search ${label} installers`}
    title={label}
    className={cn(
      // Match the distance/brand pill aesthetic the locator already
      // uses (h-[30px], rounded-full, sky-50 selected state) so this
      // doesn't introduce a third button style.
      "h-[30px] inline-flex items-center rounded-full border transition-colors",
      iconOnly
        ? "w-[30px] justify-center p-0"
        : "gap-1.5 px-2.5 text-[13.5px] font-medium",
      active
        ? "border-sky-300 bg-sky-50 text-sky-700"
        : "border-input bg-transparent text-gray-700 hover:bg-gray-50",
    )}
  >
    <span
      className={cn(
        "block overflow-hidden rounded-sm ring-1 ring-black/10 flex-shrink-0",
        iconOnly ? "w-5 h-3.5" : "w-5 h-3",
      )}
    >
      {flag}
    </span>
    {!iconOnly && <span className="leading-none">{label}</span>}
  </button>
);

const CountryFlagToggle: React.FC<CountryFlagToggleProps> = ({
  isCanada,
  onChange,
  className,
  iconOnly,
}) => (
  <div
    className={cn("inline-flex items-center gap-1.5", className)}
    role="group"
    aria-label="Country"
  >
    <Pill
      active={!isCanada}
      label="US"
      onClick={() => onChange(false)}
      flag={<UsFlag className="w-full h-full" />}
      iconOnly={iconOnly}
    />
    <Pill
      active={isCanada}
      label="CA"
      onClick={() => onChange(true)}
      flag={<CaFlag className="w-full h-full" />}
      iconOnly={iconOnly}
    />
  </div>
);

export default CountryFlagToggle;
