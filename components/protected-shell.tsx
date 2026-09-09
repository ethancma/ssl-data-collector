"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { ProtectedSidebar } from "@/components/protected-sidebar";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "ssl:sidebar-collapsed";

export function ProtectedShell({
  showAdmin,
  authSlot,
  userEmail,
  children,
}: {
  showAdmin: boolean;
  authSlot: React.ReactNode;
  userEmail?: string | null;
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
    <div className="flex min-h-screen">
      <aside
        className={cn(
          "sticky top-0 flex h-screen shrink-0 flex-col border-r border-border transition-[width] duration-200 ease-in-out",
          collapsed ? "w-16" : "w-56",
        )}
      >
        <ProtectedSidebar
          showAdmin={showAdmin}
          authSlot={authSlot}
          userEmail={userEmail}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />
      </aside>
      <main className="min-w-0 flex-1 overflow-x-auto p-5 sm:p-8">
        {children}
      </main>
    </div>
  );
}
