"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { ProtectedSidebar } from "@/components/protected-sidebar";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "ssl:sidebar-collapsed";

export function ProtectedShell({
  showAdmin,
  showDailyOperations,
  showLabSettings,
  userEmail,
  userRole,
  children,
}: {
  showAdmin: boolean;
  showDailyOperations: boolean;
  showLabSettings: boolean;
  userEmail?: string | null;
  userRole?: string | null;
  children: React.ReactNode;
}) {
  // Default to expanded so SSR markup matches the first client render; the
  // real value (if any) is reconciled from localStorage after mount.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    if (stored !== null) {
      setCollapsed(stored === "true");
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside
        className={cn(
          "flex h-full shrink-0 flex-col overflow-hidden border-r border-border transition-[width] duration-200 ease-in-out",
          collapsed ? "w-16" : "w-16 sm:w-60",
        )}
      >
        <ProtectedSidebar
          showAdmin={showAdmin}
          showDailyOperations={showDailyOperations}
          showLabSettings={showLabSettings}
          userEmail={userEmail}
          userRole={userRole}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto overflow-x-auto p-5 sm:p-8">
        {children}
      </main>
    </div>
  );
}
