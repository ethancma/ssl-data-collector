"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { CHECK_TYPES } from "@/lib/config/reference-data";

import { LOG_TYPES, renderLogForm, type LogTypeId, type SharedFormData } from "./log-types";

export function DailyOperationsHub(data: SharedFormData) {
  const searchParams = useSearchParams();
  const requestedType = searchParams.get("type");
  const availableLogTypes = LOG_TYPES.filter(
    (type) => type.id !== "star-treatment" || data.canManageStarTreatments,
  );
  const active: LogTypeId = availableLogTypes.some((type) => type.id === requestedType)
    ? (requestedType as LogTypeId)
    : availableLogTypes[0].id;

  const hrefForType = (type: LogTypeId) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("type", type);
    if (type !== "star-treatment") {
      nextParams.delete("tank");
      nextParams.delete("animal");
    }
    if (type !== "daily-check") {
      nextParams.delete("check");
    }
    return `/protected/daily-operations?${nextParams.toString()}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <nav
        aria-label="Daily operation type"
        className="inline-flex w-fit flex-wrap gap-1 rounded-lg border bg-muted p-1"
      >
        {availableLogTypes.map((t) => (
          <Button
            key={t.id}
            asChild
            size="sm"
            variant={active === t.id ? "default" : "ghost"}
            className="min-h-11 gap-1.5 rounded-md"
          >
            <Link
              href={hrefForType(t.id)}
              aria-current={active === t.id ? "page" : undefined}
              scroll={false}
            >
              <t.icon className="size-4" aria-hidden="true" />
              {t.label}
            </Link>
          </Button>
        ))}
      </nav>
      {renderLogForm(active, data, {
        systemId: searchParams.get("system") ?? undefined,
        checkType: CHECK_TYPES.find((type) => type === searchParams.get("check")),
      })}
    </div>
  );
}
