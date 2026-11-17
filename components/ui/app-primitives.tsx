"use client";

import { ChevronDown, X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { focusClass } from "@/components/ui/app-layout";

export type SelectOption<T extends string> = { value: T; label: string };

export const FILTER_BOX_CLASS =
  "touch-target h-9 w-full min-w-0 rounded-full border border-input bg-muted text-base text-foreground shadow-sm md:text-sm forced-colors:bg-[Canvas] forced-colors:text-[CanvasText]";

// Native select styled as a filter pill: each OS shows its own picker, and the box shows the current choice.
export function CompactSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  icon,
  className,
}: {
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("relative flex w-full min-w-0 items-center", className)}>
      {icon && <span aria-hidden="true" className="pointer-events-none absolute left-3 flex items-center text-muted-foreground">{icon}</span>}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => {
          const option = options.find((item) => item.value === event.target.value);
          if (option) onChange(option.value);
        }}
        className={cn(FILTER_BOX_CLASS, "appearance-none truncate py-1 pr-9", icon ? "pl-9" : "pl-3", focusClass)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 h-4 w-4 text-muted-foreground" />
    </span>
  );
}

// A checkbox drawn as a filter box, so on/off filters line up with the dropdowns.
export function FilterToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className={cn(FILTER_BOX_CLASS, "flex cursor-pointer items-center gap-2 px-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring")}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 shrink-0 accent-foreground" />
      <span className="truncate">{label}</span>
    </label>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const opener = document.activeElement;
    if (ref.current && !ref.current.open) ref.current.showModal();
    return () => { if (opener instanceof HTMLElement) opener.focus(); };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="m-auto max-h-[92dvh] w-[min(60rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/50"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-background/90 px-4 py-3 backdrop-blur md:px-6">
        <h2 id={titleId} className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h2>
        <button type="button" aria-label="Close" onClick={onClose} className={cn("touch-target rounded-full bg-muted p-2 hover:bg-accent", focusClass)}>
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      <div className="px-4 pb-6 md:px-6">{children}</div>
    </dialog>
  );
}
