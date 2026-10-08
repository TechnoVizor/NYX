import {
  Activity,
  Boxes,
  FileText,
  FlaskConical,
  Gauge,
  Layers,
  type LucideIcon,
  Network,
  Puzzle,
  ScrollText,
  Settings,
  ShieldAlert,
} from "lucide-react";

export type NavItem = { label: string; href: string; icon: LucideIcon };
export type NavGroup = { label: string; items: NavItem[] };

export const navGroups: NavGroup[] = [
  {
    label: "Analysis",
    items: [
      { label: "Dashboard", href: "/app/dashboard", icon: Gauge },
      { label: "Assets", href: "/app/assets", icon: Boxes },
      { label: "Findings", href: "/app/findings", icon: ShieldAlert },
      { label: "Graph", href: "/app/graph", icon: Network },
    ],
  },
  {
    label: "Scans",
    items: [
      { label: "Scans", href: "/app/scans", icon: Activity },
      { label: "Scan Profiles", href: "/app/profiles", icon: Layers },
      { label: "Experiments", href: "/app/experiments", icon: FlaskConical },
    ],
  },
  { label: "Extensions", items: [{ label: "Plugins", href: "/app/plugins", icon: Puzzle }] },
  { label: "Output", items: [{ label: "Reports", href: "/app/reports", icon: FileText }] },
  {
    label: "System",
    items: [
      { label: "Audit Log", href: "/app/audit", icon: ScrollText },
      { label: "Settings", href: "/app/settings/workspace", icon: Settings },
    ],
  },
];

export const settingsTabs = [
  { label: "Workspace", href: "/app/settings/workspace" },
  { label: "Credentials", href: "/app/settings/credentials" },
  { label: "Policies", href: "/app/settings/policies" },
  { label: "AI", href: "/app/settings/ai" },
  { label: "Resources", href: "/app/settings/resources" },
  { label: "System", href: "/app/settings/system" },
];

export const scanTabs = [
  { label: "Overview", path: "" },
  { label: "Live", path: "/live" },
  { label: "Findings", path: "/findings" },
  { label: "Graph", path: "/graph" },
  { label: "Evidence", path: "/evidence" },
  { label: "Changes", path: "/changes" },
  { label: "Metrics", path: "/metrics" },
  { label: "Report", path: "/report" },
];

