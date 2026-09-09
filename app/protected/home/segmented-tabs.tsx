"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

const TABS = ["Agenda", "Activity", "Trends"] as const;
type Tab = (typeof TABS)[number];

export function SegmentedTabs({
  agenda,
  activity,
  trends,
}: {
  agenda: React.ReactNode;
  activity: React.ReactNode;
  trends: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("Agenda");
  const panels: Record<Tab, React.ReactNode> = {
    Agenda: agenda,
    Activity: activity,
    Trends: trends,
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="inline-flex w-fit gap-1 rounded-lg border bg-muted p-1">
        {TABS.map((t) => (
          <Button
            key={t}
            type="button"
            size="sm"
            variant={tab === t ? "default" : "ghost"}
            className="rounded-md"
            onClick={() => setTab(t)}
          >
            {t}
          </Button>
        ))}
      </div>
      {panels[tab]}
    </div>
  );
}
