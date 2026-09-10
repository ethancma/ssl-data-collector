import { Badge } from "@/components/ui/badge";
import type { HighlightItem } from "@/components/systems/types";
import {
  AlertTriangle,
  FlaskConical,
  HeartPulse,
  type LucideIcon,
  Wrench,
} from "lucide-react";

const KIND_ICON: Record<HighlightItem["kind"], LucideIcon> = {
  chemical_addition: FlaskConical,
  health_observation: HeartPulse,
  maintenance_log: Wrench,
  missed_check: AlertTriangle,
};

function severityBadgeVariant(severity?: "low" | "medium" | "high") {
  if (severity === "high") return "destructive" as const;
  if (severity === "medium") return "default" as const;
  return "secondary" as const;
}

function formatWhen(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMins = Math.round(diffMs / 60_000);
  if (diffMins < 60) return diffMins <= 0 ? "Just now" : `${diffMins}m ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}

// Merged, reverse-chronological feed of chemical additions, health
// observations, maintenance logs, and missed AM/PM checks. Fixed to a
// 14-day window regardless of the trend chart range toggle.
export function HighlightsFeed({
  items,
  limit,
  emptyMessage = "No activity in the last 14 days.",
}: {
  items: HighlightItem[];
  limit?: number;
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  const shown = limit ? items.slice(0, limit) : items;

  return (
    <ul className="flex flex-col divide-y">
      {shown.map((item) => {
        const Icon = KIND_ICON[item.kind];
        return (
          <li key={item.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="flex flex-1 flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{item.title}</span>
                {item.severity && (
                  <Badge variant={severityBadgeVariant(item.severity)}>{item.severity}</Badge>
                )}
                {item.kind === "missed_check" && <Badge variant="outline">Missed</Badge>}
              </div>
              {item.detail && (
                <span className="text-sm text-muted-foreground">{item.detail}</span>
              )}
              <span className="text-xs text-muted-foreground">{formatWhen(item.at)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
