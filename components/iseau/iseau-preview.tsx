"use client";

import Design1Swimlane from "./design-1-swimlane";
import Design2Overlay from "./design-2-overlay";
import Design3DayGrid from "./design-3-day-grid";
import Design4PatientChart from "./design-4-patient-chart";
import Design5WardBoard from "./design-5-ward-board";
import { PreviewFrame } from "./shared";
import { useISeaUPreview } from "./use-iseau-preview";

const DESIGNS = [Design1Swimlane, Design2Overlay, Design3DayGrid, Design4PatientChart, Design5WardBoard];

export default function ISeaUPreview({ design }: { design: number }) {
  const state = useISeaUPreview();
  const Design = DESIGNS[design - 1];
  if (!Design) return null;
  return <PreviewFrame design={design} state={state}><Design key={state.patient?.id} state={state} /></PreviewFrame>;
}