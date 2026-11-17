"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { CompactSelect } from "@/components/ui/app-primitives";
import { CHECK_TYPES } from "@/lib/config/reference-data";

import { LOG_TYPES, renderLogForm, type LogTypeId, type SharedFormData } from "./log-types";

const BATCH_LOG_TYPES: ReadonlySet<LogTypeId> = new Set(["feeding", "star-treatment"]);

export function DailyOperationsHub(data: SharedFormData) {
  const router = useRouter();
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
    if (!BATCH_LOG_TYPES.has(type)) {
      nextParams.delete("tank");
      nextParams.delete("animal");
    } else if (type !== active) {
      // Feeding and Star treatment share system/tank scope, but an animal is type-specific.
      nextParams.delete("animal");
    }
    if (type !== "daily-check") {
      nextParams.delete("check");
    }
    return `/protected/daily-operations?${nextParams.toString()}`;
  };

  const ActiveIcon = availableLogTypes.find((type) => type.id === active)?.icon;

  return (
    <div className="flex flex-col gap-5">
      <div className="filter-toolbar">
        <div className="filter-grid">
          <CompactSelect
            label="Operation"
            value={active}
            icon={ActiveIcon && <ActiveIcon className="size-4" />}
            options={availableLogTypes.map((type) => ({ value: type.id, label: type.label }))}
            onChange={(value) => router.push(hrefForType(value), { scroll: false })}
            className="filter-grid__wide"
          />
        </div>
      </div>
      {renderLogForm(active, data, {
        systemId: searchParams.get("system") ?? undefined,
        checkType: CHECK_TYPES.find((type) => type === searchParams.get("check")),
      })}
    </div>
  );
}
