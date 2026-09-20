"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  ClipboardList,
  Home,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Sun,
  Waves,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

const iconButtonClassName =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground";

const THEME_CYCLE = ["light", "dark", "system"] as const;

function ThemeToggleButton() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <span className={iconButtonClassName} aria-hidden="true" />;
  }

  const current = THEME_CYCLE.includes(theme as (typeof THEME_CYCLE)[number])
    ? (theme as (typeof THEME_CYCLE)[number])
    : "system";
  const next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length];
  const label = `Switch to ${next} mode`;
  const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={label}
      aria-label={label}
      className={iconButtonClassName}
    >
      <Icon size={18} strokeWidth={2} />
    </button>
  );
}

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export function ProtectedSidebar({
  showAdmin,
  authSlot,
  userEmail,
  collapsed,
  onToggleCollapsed,
}: {
  showAdmin: boolean;
  authSlot: React.ReactNode;
  userEmail?: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const pathname = usePathname();
  const isHomeActive = pathname === "/protected/home";

  const items: NavItem[] = [
    { href: "/protected/daily-operations", label: "Daily Operations", icon: ClipboardList },
    { href: "/protected/systems", label: "Systems", icon: Waves },
    { href: "/protected/settings", label: "Settings", icon: Settings },
  ];
  if (showAdmin) {
    items.push({ href: "/protected/admin", label: "Admin", icon: ShieldCheck });
  }

  const initial = userEmail?.trim()?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-border px-3">
        <Link
          href="/protected/home"
          title="SSL Data Collection home"
          aria-label="SSL Data Collection home"
          className={cn(iconButtonClassName, "sm:hidden")}
        >
          <Waves size={18} strokeWidth={2} />
        </Link>
        <Link
          href="/protected/home"
          className={cn(
            "hidden flex-1 truncate text-sm font-semibold sm:block",
            collapsed && "hidden",
          )}
        >
          SSL Data Collection
        </Link>
        <button
          type="button"
          onClick={onToggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(iconButtonClassName, "hidden sm:flex", collapsed && "mx-auto")}
        >
          {collapsed ? (
            <PanelLeftOpen size={18} strokeWidth={2} />
          ) : (
            <PanelLeftClose size={18} strokeWidth={2} />
          )}
        </button>
      </div>
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 border-b border-border px-3 py-2 sm:flex-row sm:justify-between",
          collapsed && "sm:flex-col sm:justify-center",
        )}
      >
        <Link
          href="/protected/home"
          title="Home"
          aria-label="Home"
          className={cn(
            iconButtonClassName,
            isHomeActive
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground",
          )}
        >
          <Home size={18} strokeWidth={2} />
        </Link>
        <ThemeToggleButton />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              aria-label={label}
              className={cn(
                "flex items-center justify-center gap-3 rounded-md px-0 py-2 text-sm font-medium transition-colors sm:justify-start sm:px-3",
                collapsed && "sm:justify-center sm:px-0",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon size={16} strokeWidth={2} className="shrink-0" />
              <span className={cn("hidden sm:inline", collapsed && "sm:hidden")}>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3 text-sm">
        <div
          className={cn("flex items-center justify-center", !collapsed && "sm:hidden")}
          title={userEmail ?? undefined}
          aria-label={userEmail ? `Signed in as ${userEmail}` : "Account"}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
            {initial}
          </div>
        </div>
        <div className={cn("hidden sm:block", collapsed && "sm:hidden")}>{authSlot}</div>
      </div>
    </div>
  );
}
