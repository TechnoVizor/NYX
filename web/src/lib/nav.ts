import { Activity, Boxes, Crosshair, Home, Layers, type LucideIcon, Puzzle, Settings, ShieldAlert } from "lucide-react";

// `step` numbers the path a new user follows; `tour` is the data-tour id the guided tour points at.
export type NavItem = { label: string; href: string; icon: LucideIcon; tour: string; step?: number };
export type NavGroup = { label: string; items: NavItem[] };

// Only screens that work. Graph, reports, experiments, audit log and settings come back with their phases.
export const primaryNav: NavItem[] = [
  { label: "Home", href: "/app/dashboard", icon: Home, tour: "nav-home" },
  { label: "Targets", href: "/app/targets", icon: Crosshair, tour: "nav-targets", step: 1 },
  { label: "Scans", href: "/app/scans", icon: Activity, tour: "nav-scans", step: 2 },
  { label: "Findings", href: "/app/findings", icon: ShieldAlert, tour: "nav-findings", step: 3 },
  { label: "Assets", href: "/app/assets", icon: Boxes, tour: "nav-assets", step: 4 },
];

export const navGroups: NavGroup[] = [
  { label: "Path", items: primaryNav },
  {
    label: "Setup",
    items: [
      { label: "Scan profiles", href: "/app/profiles", icon: Layers, tour: "nav-profiles" },
      { label: "Plugins", href: "/app/plugins", icon: Puzzle, tour: "nav-plugins" },
    ],
  },
];

export const settingsNav: NavItem = { label: "Settings", href: "/app/settings/appearance", icon: Settings, tour: "nav-settings" };

// Other settings (workspace, credentials, AI, resources, system) return with their phases; their routes stay URL-only.
export const settingsTabs = [
  { label: "Appearance", href: "/app/settings/appearance" },
];

export const scanTabs = [
  { label: "Overview", path: "" },
  { label: "Findings", path: "/findings" },
  { label: "Metrics", path: "/metrics" },
];
