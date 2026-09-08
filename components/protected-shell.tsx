"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";

const CHIP_GRADIENTS = [
  "from-blue-400 to-blue-600",
  "from-purple-400 to-purple-600",
  "from-teal-400 to-teal-600",
  "from-amber-400 to-amber-600",
  "from-rose-400 to-rose-600",
];

export function ProtectedShell({
  authSlot,
  navLinks,
  children,
}: {
  authSlot: React.ReactNode;
  navLinks: { label: string; href: string }[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col items-center">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
          <div className="w-full max-w-5xl flex items-center gap-3 p-3 px-5 text-sm">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
            >
              {open ? <X size={16} /> : <Menu size={16} />}
            </Button>
            <div className="flex gap-5 items-center font-semibold">
              <Link href={"/protected"}>SSL Data Collection</Link>
            </div>
            <div className="flex-1" />
            {authSlot}
          </div>
        </nav>
        <div className="w-full max-w-5xl flex flex-row gap-4 p-5">
          <aside
            className={`flex flex-col gap-2 overflow-hidden transition-all duration-200 ${
              open ? "w-64" : "w-0"
            }`}
          >
            {navLinks.map((link, i) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-3 rounded-xl p-3 hover:bg-accent transition-colors"
              >
                <span
                  className={`h-8 w-8 shrink-0 rounded-md bg-gradient-to-br ${CHIP_GRADIENTS[i % CHIP_GRADIENTS.length]}`}
                />
                <span className="whitespace-nowrap">{link.label}</span>
              </Link>
            ))}
          </aside>
          <main className="flex-1 max-w-5xl p-5">{children}</main>
        </div>
      </div>
    </div>
  );
}
