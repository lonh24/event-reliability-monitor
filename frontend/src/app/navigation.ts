import {
  Activity,
  AppWindow,
  Gauge,
  GitBranch,
  ShieldAlert,
} from "lucide-react";
import { matchPath } from "react-router-dom";

export const navigationItems = [
  { to: "/", label: "Overview", icon: Gauge },
  { to: "/applications", label: "Applications", icon: AppWindow },
  { to: "/events", label: "Events", icon: Activity },
  { to: "/rules", label: "Monitoring Rules", icon: GitBranch },
  { to: "/incidents", label: "Incidents", icon: ShieldAlert },
];

export function getPageContext(pathname: string): string {
  if (matchPath("/events/:id", pathname)) return "Event detail";
  if (matchPath("/incidents/:id", pathname)) return "Incident detail";
  return (
    navigationItems.find(({ to }) =>
      matchPath({ path: to, end: true }, pathname),
    )?.label ?? "Page not found"
  );
}
