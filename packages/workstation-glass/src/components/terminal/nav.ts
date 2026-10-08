import {
  LayoutDashboard, CandlestickChart, ListOrdered, Briefcase, Zap, ShieldCheck, BookOpen, Trophy,
  FlaskConical, Boxes, Activity, BarChart3, Sparkles, Settings,
} from "lucide-react";

export const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/trading", label: "Trading", icon: CandlestickChart },
  { to: "/orders", label: "Orders", icon: ListOrdered },
  { to: "/positions", label: "Positions", icon: Briefcase },
  { to: "/executions", label: "Executions", icon: Zap },
  { to: "/risk", label: "Risk", icon: ShieldCheck },
  { to: "/competition", label: "Competition", icon: Trophy },
  { to: "/journal", label: "Journal", icon: BookOpen },
  { to: "/research", label: "Research", icon: FlaskConical },
  { to: "/strategies", label: "Strategies", icon: Boxes },
  { to: "/market-data", label: "Market Data", icon: Activity },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/jarvis", label: "JARVIS", icon: Sparkles },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export type NavPath = (typeof NAV)[number]["to"];
