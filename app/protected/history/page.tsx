import Link from "next/link";
import { Suspense } from "react";

import DesignA from "@/components/history/preview/design-a";
import DesignB from "@/components/history/preview/design-b";
import DesignC from "@/components/history/preview/design-c";
import { HistorySampleNote } from "@/components/history/preview/ui";
import { PageHeader, focusClass } from "@/components/iseau/shared";
import { cn } from "@/lib/utils";

const DESIGNS = {
  a: { title: "A. Ledger", description: "One table of every dataset. All filters sit above it.", Component: DesignA },
  b: { title: "B. Dataset tabs", description: "A tab per dataset, each with its own typed columns. Out-of-range water readings are coloured.", Component: DesignB },
  c: { title: "C. Day timeline", description: "A stat strip and daily chart above entries grouped by day, with a toggle to the table.", Component: DesignC },
} as const;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ design?: string }> }) {
  const { design } = await searchParams;
  if (design === "a" || design === "b" || design === "c") {
    const { Component } = DESIGNS[design];
    return <Suspense><Component /></Suspense>;
  }
  return <div className="mx-auto w-full min-w-0 max-w-7xl space-y-8">
    <PageHeader title="Choose a History design." description="Three sample layouts for browsing and exporting every log. Each works with the same sample data." />
    <ul className="grid gap-3 sm:grid-cols-3">
      {(Object.keys(DESIGNS) as (keyof typeof DESIGNS)[]).map((key) => <li key={key}>
        <Link href={`/protected/history?design=${key}`} className={cn("flex h-full flex-col gap-2 rounded-3xl bg-muted p-6 transition-colors hover:bg-accent", focusClass)}>
          <span className="text-3xl font-semibold tracking-tight">{DESIGNS[key].title}</span>
          <span className="text-muted-foreground">{DESIGNS[key].description}</span>
        </Link>
      </li>)}
    </ul>
    <HistorySampleNote />
  </div>;
}
