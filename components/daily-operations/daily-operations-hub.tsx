"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

import { LOG_TYPES, renderLogForm, type LogTypeId, type SharedFormData } from "./log-types";

export function DailyOperationsHub(data: SharedFormData) {
  const [active, setActive] = useState<LogTypeId>(LOG_TYPES[0].id);

  return (
    <div className="flex flex-col gap-5">
      <div className="inline-flex w-fit flex-wrap gap-1 rounded-lg border bg-muted p-1">
        {LOG_TYPES.map((t) => (
          <Button
            key={t.id}
            type="button"
            size="sm"
            variant={active === t.id ? "default" : "ghost"}
            className="gap-1.5 rounded-md"
            onClick={() => setActive(t.id)}
          >
            <t.icon className="size-4" />
            {t.label}
          </Button>
        ))}
      </div>
      {renderLogForm(active, data)}
    </div>
  );
}
