import Link from "next/link";
import { ArrowRight, CalendarDays, ChartLine, HeartPulse, LayoutGrid, Rows3 } from "lucide-react";
import { DESIGNS } from "@/components/iseau/mock-data";

const ICONS = [Rows3, ChartLine, CalendarDays, HeartPulse, LayoutGrid];

export default function ISeaUIndex() {
  return <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
    <header className="space-y-2"><h1 className="text-3xl font-semibold">ISeaU</h1><p className="text-sm text-muted-foreground">Sample design previews / Sunflower sea star monitoring</p></header>
    <nav aria-label="ISeaU design previews" className="divide-y divide-border border-y border-border">
      {DESIGNS.map((design, index) => { const Icon = ICONS[index]; return <Link key={design.id} href={`/protected/iseau/preview/${design.id}`} className="flex items-center gap-4 rounded px-2 py-5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Icon aria-hidden="true" className="h-6 w-6 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><h2 className="text-base font-semibold">Design {design.id}: {design.title}</h2><p className="mt-1 text-sm text-muted-foreground">{design.description}</p></div><ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
      </Link>; })}
    </nav>
  </div>;
}