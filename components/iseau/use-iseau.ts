"use client";

import { useEffect, useState } from "react";
import {
  ISSUE_LABELS, PARAMETERS, RANGES, SEVERITY_RANK, STARS, currentLocation, isCurrent, lastHealth, starData,
  type Parameter, type Range, type Star, type SystemName,
} from "./mock-data";

export type Status = "current" | "past";
export type SystemFilter = "all" | SystemName;
// Production would persist this per user instead of per browser.
const STORAGE_KEY = "ssl-iseau-sample-range-v2";
const COMPARE_COLUMNS = 3;

export function starsFor(status: Status, system: SystemFilter) {
  return STARS.filter((star) => isCurrent(star) === (status === "current") && (system === "all" || currentLocation(star).system === system))
    .sort((first, second) => SEVERITY_RANK[lastHealth(second).severity] - SEVERITY_RANK[lastHealth(first).severity] || lastHealth(second).at - lastHealth(first).at);
}

// Unknown or duplicate ids are dropped, then the list is padded from the current patients, sickest first.
export function compareIds(param: string | null) {
  const ids = (param?.split(",") ?? []).filter((id, index, all) => STARS.some((star) => star.id === id) && all.indexOf(id) === index);
  const filler = [...starsFor("current", "all"), ...starsFor("past", "all")].map((star) => star.id).filter((id) => !ids.includes(id));
  return [...ids, ...filler].slice(0, COMPARE_COLUMNS);
}
export function compareHref(stars: Star[]) {
  return `/protected/iseau/compare?stars=${compareIds(stars.map((star) => star.id).join(",")).join(",")}`;
}

function csvRows(star: Star, range: Range) {
  const data = starData(star, range);
  const place = (system: string, tank?: string) => [system, tank ?? ""];
  const iso = (time: number) => new Date(time).toISOString();
  return [
    ...data.health.map((entry) => [iso(entry.at), "health", ...place(entry.system, entry.tank), entry.by, entry.issues.map((issue) => ISSUE_LABELS[issue]).join("; "), `${entry.severity}. ${entry.notes}`]),
    ...data.treatments.map((entry) => [iso(entry.at), "treatment", ...place(""), entry.by, entry.type, `${entry.amount} ${entry.amountUnit} at ${entry.concentration} ${entry.concentrationUnit}`]),
    ...data.feedings.map((entry) => [iso(entry.at), "feeding", ...place(""), entry.followUpBy, entry.food, `${entry.grams} g, ${entry.eaten ? "eaten" : "not eaten"}`]),
    ...data.water.map((entry) => [iso(entry.at), "water", ...place(entry.system), entry.by, "Manual water reading",
      (Object.keys(PARAMETERS) as Parameter[]).map((key) => `${PARAMETERS[key].label} ${Number(entry.values[key].toFixed(2))} ${PARAMETERS[key].unit}`.trim()).join("; ")]),
    ...data.temperatures.map((entry) => [iso(entry.at), "temperature", ...place(entry.system), "", "AM check", `${entry.celsius} C`]),
  ].sort((first, second) => second[0].localeCompare(first[0]));
}

export function useIseau(starId: string | null) {
  const linked = STARS.find((candidate) => candidate.id === starId);
  // A deep link to a past patient should open with the Past patients slicer selected.
  const [status, setStatus] = useState<Status>(linked && !isCurrent(linked) ? "past" : "current");
  const [system, setSystem] = useState<SystemFilter>("all");
  const [range, setRangeState] = useState<Range>(14);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = Number(localStorage.getItem(STORAGE_KEY));
        const match = RANGES.find((candidate) => candidate === saved);
        if (match) setRangeState(match);
      } catch { return; }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const stars = starsFor(status, system);
  const star = STARS.find((candidate) => candidate.id === starId);
  function exportCsv() {
    if (!star) return;
    const rows = [["sample", "star", "time_utc", "kind", "system", "tank", "recorded_by", "title", "details"],
      ...csvRows(star, range).map(([time, kind, ...rest]) => ["true", star.name, time, kind, ...rest])];
    const quote = (value: string) => `"${(/^[=+@-]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
    const url = URL.createObjectURL(new Blob(["\uFEFF", rows.map((row) => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `iseau-sample-${star.id}-${range}days.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return {
    status, setStatus, system, setSystem,
    range, stars, star, exportCsv,
    setRange: (next: Range) => {
      setRangeState(next);
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { return; }
    },
  };
}
export type IseauState = ReturnType<typeof useIseau>;
