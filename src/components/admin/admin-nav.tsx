"use client";

import {
  BarChart3,
  CalendarDays,
  Clock,
  Images,
  LayoutDashboard,
  ListChecks,
  Scissors,
  Settings,
  Store,
  UserRound,
  Users,
  Bell,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type NavKey =
  | "dashboard"
  | "calendar"
  | "appointments"
  | "employees"
  | "services"
  | "customers"
  | "salon"
  | "workingHours"
  | "availability"
  | "gallery"
  | "notifications"
  | "settings";

type NavItem = { key: NavKey; segment: string; icon: LucideIcon; enabled: boolean };

export const ADMIN_NAV: NavItem[] = [
  { key: "dashboard", segment: "", icon: LayoutDashboard, enabled: true },
  { key: "calendar", segment: "calendar", icon: CalendarDays, enabled: false },
  { key: "appointments", segment: "appointments", icon: ListChecks, enabled: false },
  { key: "employees", segment: "employees", icon: Users, enabled: true },
  { key: "services", segment: "services", icon: Scissors, enabled: false },
  { key: "customers", segment: "customers", icon: UserRound, enabled: false },
  { key: "salon", segment: "salon", icon: Store, enabled: true },
  { key: "workingHours", segment: "working-hours", icon: Clock, enabled: true },
  { key: "availability", segment: "availability", icon: BarChart3, enabled: true },
  { key: "gallery", segment: "gallery", icon: Images, enabled: false },
  { key: "notifications", segment: "notifications", icon: Bell, enabled: false },
  { key: "settings", segment: "settings", icon: Settings, enabled: true },
];

export function AdminNav({
  salonSlug,
  onNavigate,
}: {
  salonSlug: string;
  onNavigate?: () => void;
}) {
  const t = useTranslations("adminNav");
  const pathname = usePathname();
  const base = `/admin/${salonSlug}`;

  return (
    <nav aria-label={t("label")} className="flex flex-col gap-0.5">
      {ADMIN_NAV.map(({ key, segment, icon: Icon, enabled }) => {
        const href = segment ? `${base}/${segment}` : base;
        const active = segment ? pathname.startsWith(href) : pathname === base;
        const className = cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
          active
            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            : "text-sidebar-foreground/80",
          enabled
            ? "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            : "cursor-not-allowed opacity-60",
        );
        if (!enabled) {
          return (
            <span key={key} className={className} aria-disabled>
              <Icon className="size-4" aria-hidden />
              <span className="flex-1">{t(key)}</span>
              <Badge variant="outline" className="text-[10px]">
                {t("soon")}
              </Badge>
            </span>
          );
        }
        return (
          <Link
            key={key}
            href={href}
            className={className}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
          >
            <Icon className="size-4" aria-hidden />
            <span>{t(key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
