import {
  LayoutDashboard,
  CandlestickChart,
  ListOrdered,
  Briefcase,
  Zap,
  ShieldCheck,
  BookOpen,
  Trophy,
  FlaskConical,
  Boxes,
  Activity,
  BarChart3,
  Sparkles,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavPath =
  | "/dashboard"
  | "/trading"
  | "/orders"
  | "/positions"
  | "/executions"
  | "/risk"
  | "/competition"
  | "/journal"
  | "/research"
  | "/strategies"
  | "/backtesting"
  | "/market-data"
  | "/analytics"
  | "/jarvis"
  | "/settings";

export interface NavItem {
  readonly to: NavPath;
  readonly label: string;
  readonly icon: LucideIcon;
}

export interface NavGroup {
  readonly label: string;
  readonly items: readonly NavItem[];
}

const TRADING: readonly NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/trading", label: "Trading", icon: CandlestickChart },
  { to: "/orders", label: "Orders", icon: ListOrdered },
  { to: "/positions", label: "Positions", icon: Briefcase },
  { to: "/executions", label: "Executions", icon: Zap },
];

const CONTROL: readonly NavItem[] = [
  { to: "/risk", label: "Risk", icon: ShieldCheck },
  { to: "/competition", label: "Competition", icon: Trophy },
];

// Research and Strategies are one workspace now (Research / Library / Builder /
// Experiments tabs), so they share a single entry; Backtesting keeps its own.
const RESEARCH: readonly NavItem[] = [
  { to: "/journal", label: "Journal", icon: BookOpen },
  { to: "/research", label: "Research", icon: FlaskConical },
  { to: "/backtesting", label: "Backtesting", icon: Boxes },
  { to: "/market-data", label: "Market Data", icon: Activity },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
];

const INTELLIGENCE: readonly NavItem[] = [{ to: "/jarvis", label: "JARVIS", icon: Sparkles }];

const SYSTEM: readonly NavItem[] = [{ to: "/settings", label: "Settings", icon: Settings }];

export const NAV_GROUPS: readonly NavGroup[] = [
  { label: "Trading", items: TRADING },
  { label: "Control", items: CONTROL },
  { label: "Research", items: RESEARCH },
  { label: "Intelligence", items: INTELLIGENCE },
  { label: "System", items: SYSTEM },
];

export const NAV: readonly NavItem[] = NAV_GROUPS.flatMap((group) => group.items);
