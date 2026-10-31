import { severityStatus, type SeverityStatus } from "@/lib/config/reference-data";

// Plain module (not "use client") so server components like the Systems snapshot can read it.
// Severity hues follow the shared ok/watch/attention thresholds and stay fixed in both themes.
export const SEVERITY_TONE = {
  ok: { bg: "bg-teal-500", text: "text-teal-500" },
  watch: { bg: "bg-amber-400", text: "text-amber-400" },
  attention: { bg: "bg-red-500", text: "text-red-500" },
} satisfies Record<SeverityStatus, { bg: string; text: string }>;

export function severityTone(severity: number) {
  return { label: `Severity ${severity}`, ...SEVERITY_TONE[severityStatus(severity)] };
}
