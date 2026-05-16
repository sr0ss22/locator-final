import React, { memo } from "react";
import { Card } from "@/components/ui/card";
import { Phone, MapPin, BadgeCheck, Truck, Map as MapIcon } from "lucide-react";
import { Installer } from "@/types/installer";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useCountrySettings } from "@/hooks/useCountrySettings";

interface InstallerCardComponentProps {
  installer: Installer;
  distance?: number;
  pinNumber?: number;
  isSelected: boolean;
  onInstallerCardClick: (id: string) => void;
  isPublicView?: boolean;
  searchedZipCode?: string;
  // Internal locator only: when provided, renders the "View coverage"
  // map icon next to the distance. Clicking it should scope the
  // coverage overlay to JUST this installer (parent handles state).
  onViewCoverage?: (installerId: string) => void;
  // When set and equal to this installer's id, the icon renders in an
  // active/selected style so it's obvious which row drove the filter.
  activeCoverageInstallerId?: string | null;
}

const InstallerCardComponent: React.FC<InstallerCardComponentProps> = ({
  installer,
  distance,
  pinNumber,
  isSelected,
  onInstallerCardClick,
  isPublicView = false,
  searchedZipCode,
  onViewCoverage,
  activeCoverageInstallerId,
}) => {
  const { distanceUnit } = useCountrySettings();

  const displayDistance = distance !== undefined && distance !== null && distance !== Infinity
    ? (distanceUnit === 'km' ? (distance * 1.60934).toFixed(1) : distance.toFixed(1))
    : undefined;

  const formattedDistance = displayDistance ? `${displayDistance} ${distanceUnit}` : undefined;

  const cityStateZip = `${installer.rawSupabaseData?.city || ''}, ${installer.rawSupabaseData?.state || ''} ${installer.zipCode || ''}`.trim().replace(/^,\s*/, '');

  const handleClick = () => {
    if (!isPublicView) {
      onInstallerCardClick(installer.id);
    }
  };

  const showMileageBadge = !!searchedZipCode && installer.is_local_service_area !== undefined;
  const hasBrands = installer.brands && installer.brands.length > 0;
  const hasSkills = installer.skills && installer.skills.length > 0;

  // The "View coverage" RPC excludes inactive installers (is_active <> 1)
  // so the icon would just paint an empty overlay. Hide it instead of
  // pretending it'll do something.
  const isActiveInstaller = installer.rawSupabaseData?.is_active === 1;
  const isInactiveInstaller = !isActiveInstaller;
  const showViewCoverageButton =
    !isPublicView && !!onViewCoverage && isActiveInstaller;
  const isCoverageActiveForThisRow =
    !!activeCoverageInstallerId && activeCoverageInstallerId === installer.id;

  // Internal locator only: render the pin number that matches the map
  // marker so admins can easily correlate a card to its pin. Public
  // popups already show pin info as the marker itself.
  const showPinBadge = !isPublicView && typeof pinNumber === "number";

  return (
    <Card
      className={cn(
        "w-full relative transition-all duration-200 p-4",
        isSelected && !isPublicView ? "border-sky-500 ring-2 ring-sky-500 shadow-lg" : "border-gray-200",
        isPublicView ? "cursor-default" : "cursor-pointer hover:border-gray-300"
      )}
      onClick={handleClick}
    >
      <div className="space-y-3 text-sm">
        {/* Top row: name + distance + (public-only) city/state/zip on the left,
            mileage badge anchored top-right. The left side wraps internally when
            the card narrows; the badge always stays on the title row. */}
        <div className="flex items-start gap-x-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 flex-1 min-w-0">
            <div className="flex items-baseline gap-2 min-w-0">
              {showPinBadge && (
                // Inline SVG mirrors the exact map-marker design
                // (solid teardrop + white number on top, no inner
                // circle), so card-to-pin matching is visually
                // unambiguous. Inactive rows render gray to match
                // the gray map pin.
                <svg
                  viewBox="0 0 24 24"
                  className="h-7 w-7 self-center flex-shrink-0"
                  aria-label={`Map pin ${pinNumber}`}
                  role="img"
                >
                  <title>{`Map pin ${pinNumber}`}</title>
                  <path
                    d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
                    fill={isInactiveInstaller ? "#9CA3AF" : "#000000"}
                  />
                  <text
                    x="12"
                    y="9.4"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={String(pinNumber).length >= 3 ? 6 : String(pinNumber).length === 2 ? 7 : 8}
                    fontWeight={700}
                    fontFamily="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
                    fill="#ffffff"
                  >
                    {pinNumber}
                  </text>
                </svg>
              )}
              <h3 className="font-semibold text-lg leading-tight">{installer.name}</h3>
              {formattedDistance && (
                <span className="text-gray-600 whitespace-nowrap">
                  {formattedDistance}
                </span>
              )}
              {showViewCoverageButton && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      // stopPropagation lets the rest of the card stay
                      // clickable for opening the installer record.
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewCoverage?.(installer.id);
                      }}
                      aria-label="View coverage on map"
                      aria-pressed={isCoverageActiveForThisRow}
                      className={cn(
                        "inline-flex items-center justify-center h-6 w-6 rounded-md flex-shrink-0",
                        "text-gray-500 hover:text-sky-700 hover:bg-sky-50",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
                        "transition-colors",
                        isCoverageActiveForThisRow && "text-sky-700 bg-sky-100 hover:bg-sky-100",
                      )}
                    >
                      <MapIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={4}>
                    {isCoverageActiveForThisRow ? "Showing coverage" : "View coverage"}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            {cityStateZip && isPublicView && (
              <span className="inline-flex items-center text-gray-600 whitespace-nowrap">
                <MapPin className="h-4 w-4 mr-1 text-gray-500 flex-shrink-0" aria-hidden="true" />
                {cityStateZip}
              </span>
            )}
          </div>
          {(showMileageBadge || (isInactiveInstaller && !isPublicView)) && (
            <div className="flex flex-row items-center gap-1.5 flex-shrink-0">
              {showMileageBadge && (
                <Badge
                  variant="default"
                  className={cn(
                    "border-transparent",
                    installer.is_local_service_area
                      ? "bg-green-100 text-green-800 hover:bg-green-200"
                      : "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                  )}
                >
                  {installer.is_local_service_area ? "Mileage Covered" : "Mileage Charged"}
                </Badge>
              )}
              {isInactiveInstaller && !isPublicView && (
                // Gray on purpose — matches the gray pin color (#9CA3AF)
                // used in InstallerMapComponent so the badge and pin
                // read as the same "inactive" signal.
                <Badge
                  variant="default"
                  className="border-transparent bg-gray-200 text-gray-700 hover:bg-gray-300"
                >
                  Inactive
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Certifications: badge-check icon + name, plain text */}
        {installer.certifications.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-700">
            {installer.certifications.map((cert) => (
              <span key={cert} className="inline-flex items-center gap-1">
                <BadgeCheck className="h-3.5 w-3.5 text-sky-600 flex-shrink-0" aria-hidden="true" />
                {cert}
              </span>
            ))}
          </div>
        )}

        {/* Admin-only details: address (Google Maps), phone (tel:), accepts-shipments truck, vendor id */}
        {!isPublicView && (
          <div className="space-y-1 text-gray-600">
            {(installer.address || installer.phone || installer.acceptsShipments) && (
              <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
                {installer.address && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(installer.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-start min-w-0 hover:text-sky-600 hover:underline"
                  >
                    <MapPin className="h-4 w-4 mr-1 mt-0.5 text-black flex-shrink-0" />
                    <span className="break-words">{installer.address}</span>
                  </a>
                )}
                {installer.phone && (
                  <a
                    href={`tel:${installer.phone.replace(/[^0-9+]/g, "")}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center hover:text-sky-600 hover:underline whitespace-nowrap"
                  >
                    <Phone className="h-4 w-4 mr-1 text-black flex-shrink-0" />
                    <span>{installer.phone}</span>
                  </a>
                )}
                {installer.acceptsShipments && (
                  <span
                    className="inline-flex items-center whitespace-nowrap"
                    title="Accepts Shipments"
                    aria-label="Accepts Shipments"
                  >
                    <Truck className="h-4 w-4 mr-1 text-black flex-shrink-0" />
                    <span>Accepts Shipments</span>
                  </span>
                )}
              </div>
            )}
            {installer.installerVendorId && (
              <div className="text-gray-700">
                <span className="font-medium">Installer Vendor Id:</span> {installer.installerVendorId}
              </div>
            )}
          </div>
        )}

        {/* Brands and Product Skills, side by side */}
        {(hasBrands || hasSkills) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            {hasBrands && (
              <div>
                <h4 className="font-semibold text-sm mb-1.5">Brands</h4>
                <div className="flex flex-wrap gap-1.5">
                  {installer.brands.map((brand) => (
                    <Badge key={brand} variant="secondary" className="bg-indigo-100 text-indigo-700 border-transparent hover:bg-indigo-200">
                      {brand}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {hasSkills && (
              <div>
                <h4 className="font-semibold text-sm mb-1.5">Product Skills</h4>
                <div className="flex flex-wrap gap-1.5">
                  {installer.skills.map((skill) => (
                    <Badge key={skill} variant="secondary">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

export default memo(InstallerCardComponent);
