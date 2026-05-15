import React from "react";
import {
  Blinds,
  Columns3,
  Zap,
  Wrench,
  MoveVertical,
  Store,
  Sun,
  PlugZap,
  type LucideIcon,
} from "lucide-react";
import { InstallerSkill } from "@/types/installer";

// Lucide doesn't ship a curtains icon, so we draw a small one in the same
// stroke style: a horizontal rod across the top, two paneled drapes hanging
// down, each with a soft droop at the hem.
export const Curtains: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <path d="M3 4h18" />
    <path d="M5 4v17" />
    <path d="M11 4v17" />
    <path d="M13 4v17" />
    <path d="M19 4v17" />
    <path d="M5 21q3 -2 6 0" />
    <path d="M13 21q3 -2 6 0" />
  </svg>
);

// Visual mapping from product skill to an icon. Picked to be evocative of each
// skill: louvers for shutters, drapes for drapery, lightning for motorization,
// etc. Used in both the public-locator pin popup and the public filter pills.
export const SKILL_ICON_MAP: Record<InstallerSkill, React.ComponentType<React.SVGProps<SVGSVGElement>> | LucideIcon> = {
  "Blinds & Shades": Blinds,
  "Shutters": Columns3,
  "Drapery": Curtains,
  "Automation": Zap,
  "Service Call": Wrench,
  "Tall Window": MoveVertical,
  "Fixture Displays": Store,
  "Outdoor": Sun,
  "High Voltage Hardwired": PlugZap,
};
