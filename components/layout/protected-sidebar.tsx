"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  ClipboardList,
  FlaskConical,
  Home,
  LogOut,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Waves,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/auth/logout-button";

const focusRingClassName =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

const iconButtonClassName = cn(
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
  focusRingClassName,
);

// Wider pill used for the expanded sidebar's Home/theme action row.
const actionPillClassName = "w-12";

const activeClassName =
  "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary";

const THEME_CYCLE = ["light", "dark", "system"] as const;

function ThemeToggleButton({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <span className={cn(iconButtonClassName, className)} aria-hidden="true" />;
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
      className={cn(iconButtonClassName, className)}
    >
      <Icon size={18} strokeWidth={2} />
    </button>
  );
}

function HomeButton({ active, className }: { active: boolean; className?: string }) {
  return (
    <Link
      href="/protected/home"
      title="Home"
      aria-label="Home"
      aria-current={active ? "page" : undefined}
      className={cn(iconButtonClassName, className, active && activeClassName)}
    >
      <Home size={18} strokeWidth={2} />
    </Link>
  );
}

function SidebarLogoutButton() {
  return (
    <LogoutButton
      variant="ghost"
      size="icon"
      title="Log out"
      aria-label="Log out"
      className={cn(iconButtonClassName, "[&_svg]:size-[18px]")}
    >
      <LogOut strokeWidth={2} />
    </LogoutButton>
  );
}

function Avatar({ initial, email }: { initial: string; email?: string | null }) {
  return (
    <div
      role="img"
      title={email ?? undefined}
      aria-label={email ? `Signed in as ${email}` : "Account"}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold text-foreground"
    >
      {initial}
    </div>
  );
}

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

type SidebarViewProps = {
  sections: NavSection[];
  isActive: (item: NavItem) => boolean;
  isHomeActive: boolean;
  userEmail?: string | null;
  userRole?: string | null;
  initial: string;
  onToggleCollapsed: () => void;
};

function ExpandedSidebar({
  sections,
  isActive,
  isHomeActive,
  userEmail,
  userRole,
  initial,
  onToggleCollapsed,
}: SidebarViewProps) {
  return (
    <div className="flex h-full w-60 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 px-3">
        <Link
          href="/protected/home"
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1",
            focusRingClassName,
          )}
        >
          <Waves size={20} strokeWidth={2} className="shrink-0 text-primary" />
          <span className="truncate text-sm font-semibold">SSL Data Collection</span>
        </Link>
        <button
          type="button"
          onClick={onToggleCollapsed}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          className={iconButtonClassName}
        >
          <PanelLeftClose size={18} strokeWidth={2} />
        </button>
      </div>

      <div className="flex shrink-0 items-center justify-evenly px-3 pb-3">
        <HomeButton active={isHomeActive} className={actionPillClassName} />
        <ThemeToggleButton className={actionPillClassName} />
      </div>
      <div className="mx-4 shrink-0 border-t border-border" />

      <nav
        aria-label="Main"
        className="min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-4"
      >
        {sections.map((section) => {
          const headingId = `sidebar-section-${section.label.toLowerCase().replace(/\s+/g, "-")}`;
          return (
            <div key={section.label}>
              <p id={headingId} className="px-3 pb-1.5 text-xs font-medium text-muted-foreground">
                {section.label}
              </p>
              <ul aria-labelledby={headingId} className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                          focusRingClassName,
                          active && activeClassName,
                        )}
                      >
                        <Icon size={18} strokeWidth={2} className="shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center gap-3 border-t border-border px-3 py-3">
        <Avatar initial={initial} email={userEmail} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={userEmail ?? undefined}>
            {userEmail ?? "Account"}
          </p>
          {userRole ? (
            <p className="truncate text-xs capitalize text-muted-foreground">{userRole}</p>
          ) : null}
        </div>
        <div className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />
        <SidebarLogoutButton />
      </div>
    </div>
  );
}

function CollapsedSidebar({
  sections,
  isActive,
  isHomeActive,
  userEmail,
  initial,
  onToggleCollapsed,
}: SidebarViewProps) {
  const divider = <div className="h-px w-8 shrink-0 bg-border" aria-hidden="true" />;

  return (
    <div className="flex h-full w-16 flex-col items-center">
      <div className="flex shrink-0 flex-col items-center gap-1 pb-2 pt-3">
        <Link
          href="/protected/home"
          title="SSL Data Collection"
          aria-label="SSL Data Collection"
          className={iconButtonClassName}
        >
          <Waves size={20} strokeWidth={2} className="text-primary" />
        </Link>
        {/* Below sm the sidebar is always collapsed, so expanding would do nothing. */}
        <button
          type="button"
          onClick={onToggleCollapsed}
          title="Expand sidebar"
          aria-label="Expand sidebar"
          className={cn(iconButtonClassName, "hidden sm:flex")}
        >
          <PanelLeftOpen size={18} strokeWidth={2} />
        </button>
      </div>
      {divider}
      <div className="flex shrink-0 flex-col items-center gap-1 py-2">
        <HomeButton active={isHomeActive} />
        <ThemeToggleButton />
      </div>
      {divider}

      <nav
        aria-label="Main"
        className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto overflow-x-hidden overscroll-contain py-2"
      >
        {sections.map((section, index) => (
          <Fragment key={section.label}>
            {index > 0 ? (
              <div className="my-1.5 h-px w-6 shrink-0 bg-border" aria-hidden="true" />
            ) : null}
            {section.items.map((item) => {
              const active = isActive(item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className={cn(iconButtonClassName, active && activeClassName)}
                >
                  <Icon size={18} strokeWidth={2} />
                </Link>
              );
            })}
          </Fragment>
        ))}
      </nav>

      <div className="flex shrink-0 flex-col items-center gap-2 pb-3 pt-2">
        <SidebarLogoutButton />
        <Avatar initial={initial} email={userEmail} />
      </div>
    </div>
  );
}

export function ProtectedSidebar({
  showAdmin,
  showDailyOperations,
  showLabSettings,
  userEmail,
  userRole,
  collapsed,
  onToggleCollapsed,
}: {
  showAdmin: boolean;
  showDailyOperations: boolean;
  showLabSettings: boolean;
  userEmail?: string | null;
  userRole?: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const pathname = usePathname();
  const isHomeActive = pathname === "/protected/home";

  const sections: NavSection[] = [
    {
      label: "Operations",
      items: [
        ...(showDailyOperations
          ? [
              {
                href: "/protected/daily-operations",
                label: "Daily Operations",
                icon: ClipboardList,
              },
            ]
          : []),
        { href: "/protected/systems", label: "Systems", icon: Waves },
      ],
    },
    {
      label: "Lab setup",
      items: showLabSettings
        ? [
            {
              href: "/protected/settings/water-quality-targets",
              label: "Water quality targets",
              icon: SlidersHorizontal,
            },
            {
              href: "/protected/settings/quick-picks",
              label: "Quick-pick catalogs",
              icon: FlaskConical,
            },
          ]
        : [],
    },
    {
      label: "Manage",
      items: [
        { href: "/protected/settings", label: "Settings", icon: Settings, exact: true },
        ...(showAdmin
          ? [{ href: "/protected/admin", label: "Admin", icon: ShieldCheck, exact: true }]
          : []),
      ],
    },
  ].filter((section) => section.items.length > 0);

  const isActive = ({ href, exact }: NavItem) =>
    pathname === href || (!exact && pathname.startsWith(`${href}/`));

  const initial = userEmail?.trim()?.[0]?.toUpperCase() ?? "?";

  const viewProps: SidebarViewProps = {
    sections,
    isActive,
    isHomeActive,
    userEmail,
    userRole,
    initial,
    onToggleCollapsed,
  };

  return (
    <>
      {collapsed ? null : (
        <div className="hidden min-h-0 flex-1 sm:flex">
          <ExpandedSidebar {...viewProps} />
        </div>
      )}
      <div className={cn("flex min-h-0 flex-1", !collapsed && "sm:hidden")}>
        <CollapsedSidebar {...viewProps} />
      </div>
    </>
  );
}
