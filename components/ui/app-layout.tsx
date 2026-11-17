import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring forced-colors:focus-visible:outline-[Highlight]";

export function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="max-w-3xl space-y-2">
      <h1 className="text-3xl font-semibold tracking-tight outline-none md:text-4xl">{title}</h1>
      <p className="text-base text-muted-foreground md:text-lg">{description}</p>
    </header>
  );
}

export function Tile({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-2xl bg-muted p-4 md:p-6", className)}>{children}</div>;
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p role="status" className="py-5 text-sm text-muted-foreground">{children}</p>;
}
