"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type RefObject,
} from "react";
import {
  CalendarDays,
  ClipboardList,
  FlaskConical,
  Gauge,
  HeartPulse,
  History,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  PawPrint,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Waves,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/auth/logout-button";

const focusRingClassName =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

const iconButtonClassName = cn(
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:h-9 sm:w-9 [@media(hover:none)_and_(pointer:coarse)]:!h-11 [@media(hover:none)_and_(pointer:coarse)]:!w-11",
  focusRingClassName,
);

const activeClassName =
  "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary";

// Matches Tailwind's `sm` breakpoint, where the sidebar expands inline.
const DESKTOP_QUERY = "(min-width: 640px)";

function LinkPendingTracker({ pendingRef }: { pendingRef: RefObject<boolean> }) {
  const { pending } = useLinkStatus();
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending, pendingRef]);
  return null;
}

// Each prefetch or navigation is a full server render on the Worker, and bursts of them
// hit the Workers CPU limit. Sidebar links therefore skip prefetch and ignore repeat clicks
// on the page already shown or already loading.
function SidebarLink({
  children,
  href,
  ...props
}: Omit<ComponentProps<typeof Link>, "href" | "prefetch" | "onNavigate"> & { href: string }) {
  const pendingRef = useRef(false);
  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onNavigate={(event) => {
        const { pathname, search } = window.location;
        if (pendingRef.current || href === pathname + search) event.preventDefault();
      }}
    >
      <LinkPendingTracker pendingRef={pendingRef} />
      {children}
    </Link>
  );
}

function SidebarToggleButton({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const label = expanded ? "Collapse sidebar" : "Expand sidebar";
  const Icon = expanded ? PanelLeftClose : PanelLeftOpen;
  return (
    <button
      type="button"
      onClick={onToggle}
      title={label}
      aria-label={label}
      aria-expanded={expanded}
      className={iconButtonClassName}
    >
      <Icon size={18} strokeWidth={2} />
    </button>
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
  overlayOpen: boolean;
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
      {/* px-3.5 puts the Waves mark and toggle on the same column as the collapsed rail, so they don't jump. */}
      <div className="flex shrink-0 flex-col gap-1 px-3.5 pb-2 pt-3">
        <SidebarLink
          href="/protected/home"
          title="Home"
          aria-label="Home"
          aria-current={isHomeActive ? "page" : undefined}
          className={cn(
            "flex min-w-0 items-center gap-2 rounded-lg pr-2",
            focusRingClassName,
            isHomeActive && activeClassName,
          )}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center sm:h-9 sm:w-9">
            <Waves size={20} strokeWidth={2} className="text-primary" />
          </span>
          <span className="truncate text-sm font-semibold">SSL Data Collection</span>
        </SidebarLink>
        <div className="flex items-center">
          <SidebarToggleButton expanded onToggle={onToggleCollapsed} />
        </div>
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
                      <SidebarLink
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:min-h-0 [@media(hover:none)_and_(pointer:coarse)]:!min-h-11",
                          focusRingClassName,
                          active && activeClassName,
                        )}
                      >
                        <Icon size={18} strokeWidth={2} className="shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </SidebarLink>
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
  overlayOpen,
  userEmail,
  initial,
  onToggleCollapsed,
}: SidebarViewProps) {
  const divider = <div className="h-px w-8 shrink-0 bg-border" aria-hidden="true" />;

  return (
    <div className="flex h-full w-full shrink-0 items-center justify-between px-2 sm:w-16 sm:flex-col sm:items-center sm:justify-start sm:px-0">
      <div className="flex w-full items-center justify-between sm:w-auto sm:flex-col sm:items-center sm:gap-1 sm:pb-2 sm:pt-3">
        <SidebarLink
          href="/protected/home"
          title="Home"
          aria-label="Home"
          aria-current={isHomeActive ? "page" : undefined}
          className={cn(iconButtonClassName, isHomeActive && activeClassName)}
        >
          <Waves size={20} strokeWidth={2} className="text-primary" />
        </SidebarLink>
        <SidebarToggleButton expanded={overlayOpen} onToggle={onToggleCollapsed} />
      </div>
      <div className="hidden sm:block">{divider}</div>

      <nav
        aria-label="Main"
        className="hidden min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto overflow-x-hidden overscroll-contain py-2 sm:flex"
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
                <SidebarLink
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className={cn(iconButtonClassName, active && activeClassName)}
                >
                  <Icon size={18} strokeWidth={2} />
                </SidebarLink>
              );
            })}
          </Fragment>
        ))}
      </nav>

      <div className="hidden shrink-0 flex-col items-center gap-2 pb-3 pt-2 sm:flex">
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
  // Below sm there is no room to push the page aside, so expanding opens a modal overlay
  // instead. It is per-visit state and does not change the saved desktop preference.
  const [overlayOpen, setOverlayOpen] = useState(false);
  const overlayRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<Element | null>(null);

  useEffect(() => setOverlayOpen(false), [pathname]);

  useEffect(() => {
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const close = () => {
      if (desktop.matches) setOverlayOpen(false);
    };
    desktop.addEventListener("change", close);
    return () => desktop.removeEventListener("change", close);
  }, []);

  useEffect(() => {
    const dialog = overlayRef.current;
    if (!dialog) return;
    if (overlayOpen && !dialog.open) {
      openerRef.current = document.activeElement;
      dialog.showModal();
    } else if (!overlayOpen && dialog.open) {
      dialog.close();
    }
    if (!overlayOpen && openerRef.current instanceof HTMLElement) {
      openerRef.current.focus();
      openerRef.current = null;
    }
  }, [overlayOpen]);

  const toggleSidebar = () => {
    if (window.matchMedia(DESKTOP_QUERY).matches) onToggleCollapsed();
    else setOverlayOpen((open) => !open);
  };

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
        { href: "/protected/iseau", label: "ISeaU", icon: HeartPulse },
        { href: "/protected/systems", label: "Systems", icon: Gauge },
        { href: "/protected/history", label: "History", icon: History },
      ],
    },
    {
      label: "Lab setup",
      items: showLabSettings
        ? [
            {
              href: "/protected/settings/animal-setup",
              label: "Animal setup",
              icon: PawPrint,
            },
            {
              href: "/protected/settings/water-quality-targets",
              label: "Water quality targets",
              icon: SlidersHorizontal,
            },
            {
              href: "/protected/settings/feeding-schedules",
              label: "Feeding schedules",
              icon: CalendarDays,
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
    overlayOpen,
    userEmail,
    userRole,
    initial,
    onToggleCollapsed: toggleSidebar,
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
      <dialog
        ref={overlayRef}
        aria-label="Navigation"
        onClose={() => setOverlayOpen(false)}
        onKeyDown={(event) => {
          // Not every browser fires the native cancel for Escape, so close explicitly.
          if (event.key === "Escape") {
            event.preventDefault();
            setOverlayOpen(false);
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOverlayOpen(false);
        }}
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-60 max-w-[85vw] overflow-hidden border-r border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/40 open:flex motion-safe:open:duration-200 motion-safe:open:animate-in motion-safe:open:slide-in-from-left sm:hidden"
      >
        {overlayOpen ? <ExpandedSidebar {...viewProps} /> : null}
      </dialog>
    </>
  );
}
