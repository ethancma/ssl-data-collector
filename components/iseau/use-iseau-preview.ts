"use client";

import { useEffect, useState } from "react";
import { LAYERS, PATIENTS, eventDetails, isCurrentPatient, visibleEvents, type Layer, type WindowDays } from "./mock-data";

type Preferences = { days: WindowDays; layers: Layer[] };
const DEFAULTS: Preferences = { days: 14, layers: LAYERS.map((layer) => layer.id) };
// Production would persist these preferences per user instead of per browser.
const STORAGE_KEY = "ssl-iseau-sample-preferences-v1";

export function useISeaUPreview() {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);
  const [tab, setTab] = useState<"current" | "past">("current");
  const [selectedId, setSelectedId] = useState("sol");
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
        if (!saved || typeof saved !== "object" || !("days" in saved) || !("layers" in saved)) return;
        const days = saved.days;
        const layers = saved.layers;
        if ((days === 7 || days === 14 || days === 30) && Array.isArray(layers)) {
          setPreferences({ days, layers: LAYERS.filter((layer) => layers.includes(layer.id)).map((layer) => layer.id) });
        }
      } catch { return; }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  function updatePreferences(next: Preferences) {
    setPreferences(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { return; }
  }
  const patients = PATIENTS.filter((patient) => isCurrentPatient(patient, preferences.days) === (tab === "current"));
  const patient = patients.find((candidate) => candidate.id === selectedId) ?? patients[0];
  const events = patient ? visibleEvents(patient, preferences.days, preferences.layers) : [];
  function exportCsv() {
    if (!patient) return;
    const rows = [["sample", "star", "time", "layer", "system", "tank", "recorded_by", "title", "details", "photo_placeholder"],
      ...events.map((event) => ["true", patient.name, event.at, event.layer, event.system, event.tank ?? "", event.recordedBy, event.title, eventDetails(event), event.photo ? "yes" : "no"])];
    const quote = (value: string) => `"${(/^[=+@-]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
    const csv = rows.map((row) => row.map(quote).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `iseau-sample-${patient.id}-${preferences.days}days.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return {
    ...preferences, tab, setTab, patients, patient, events, selectPatient: setSelectedId, exportCsv,
    setDays: (days: WindowDays) => updatePreferences({ ...preferences, days }),
    toggleLayer: (layer: Layer) => updatePreferences({ ...preferences, layers: preferences.layers.includes(layer)
      ? preferences.layers.filter((candidate) => candidate !== layer) : [...preferences.layers, layer] }),
  };
}
export type PreviewState = ReturnType<typeof useISeaUPreview>;