"use client";

import { useEffect, useState } from "react";
import {
  ISSUE_LABELS,
  RANGES,
  compareIds,
  isCurrent,
  starsFor,
  starData,
  type IseauData,
  type Parameter,
  type Range,
  type Star,
  type SystemFilter,
  type Status,
} from "@/lib/iseau/data";

const STORAGE_KEY = "ssl-iseau-range-v3";

export function compareHref(stars: Star[], data: IseauData) {
  return `/protected/iseau/compare?stars=${compareIds(stars.map((star) => String(star.id)).join(","), data).join(",")}`;
}

function csvRows(star: Star, range: Range, data: IseauData) {
  const entries = starData(star, range, data);
  const place = (system: string, tank: string) => [system, tank];
  const iso = (time: number) => new Date(time).toISOString();
  const waterDetails = (values: Record<Parameter, number | null>) => Object.entries(values)
    .flatMap(([key, value]) => value === null ? [] : [`${key} ${value}`])
    .join("; ");
  return [
    ...entries.health.map((entry) => [
      iso(entry.at), "health", ...place(entry.place.system, entry.place.tank), entry.by,
      entry.issues.map((issue) => ISSUE_LABELS[issue]).join("; "),
      [`Severity ${entry.severity}`, entry.notes].filter(Boolean).join(". "),
    ]),
    ...entries.treatments.map((entry) => [
      iso(entry.at), "treatment", ...place(entry.place.system, entry.place.tank), entry.by,
      entry.type,
      [
        entry.amount === null ? "" : `${entry.amount} ${entry.amountUnit}`,
        entry.concentration === null ? "" : `${entry.concentration} ${entry.concentrationUnit}`,
        entry.notes,
      ].filter(Boolean).join("; "),
    ]),
    ...entries.feedings.map((entry) => [
      iso(entry.at), "feeding", ...place(entry.place.system, entry.place.tank), entry.by,
      entry.food,
      [
        entry.amount === null ? "" : `${entry.amount}${entry.unit ? ` ${entry.unit}` : ""}`,
        `Consumption ${entry.status}`,
        entry.notes,
      ].filter(Boolean).join("; "),
    ]),
    ...entries.water.map((entry) => [
      iso(entry.at), "water", entry.system, "", entry.by, "Water quality", waterDetails(entry.values),
    ]),
    ...entries.temperatures.map((entry) => [
      iso(entry.at), "temperature", entry.system, "", entry.by, "AM check", `${entry.celsius} C`,
    ]),
  ].sort((first, second) => second[0].localeCompare(first[0]));
}

export function useIseau(starId: string | null, data: IseauData) {
  const linked = data.stars.find((candidate) => String(candidate.id) === starId);
  const [status, setStatus] = useState<Status>(linked && !isCurrent(linked, data.now) ? "past" : "current");
  const [system, setSystem] = useState<SystemFilter>("all");
  const [range, setRangeState] = useState<Range>(14);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = Number(localStorage.getItem(STORAGE_KEY));
        const match = RANGES.find((candidate) => candidate === saved);
        if (match) setRangeState(match);
      } catch {
        return;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const stars = starsFor(data, status, system);
  const star = data.stars.find((candidate) => String(candidate.id) === starId);
  function exportCsv() {
    if (!star) return;
    const rows = [["star", "time_utc", "kind", "system", "tank", "recorded_by", "title", "details"],
      ...csvRows(star, range, data).map(([time, kind, ...rest]) => [star.name, time, kind, ...rest])];
    const quote = (value: string) => `"${(/^[=+@-]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
    const url = URL.createObjectURL(new Blob(["\uFEFF", rows.map((row) => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `iseau-${star.id}-${range}days.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return {
    status,
    setStatus,
    system,
    setSystem,
    range,
    stars,
    star,
    data,
    exportCsv,
    setRange: (next: Range) => {
      setRangeState(next);
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        return;
      }
    },
  };
}
export type IseauState = ReturnType<typeof useIseau>;
