import { addPacificCalendarDays, pacificDateKey } from "@/lib/pacific-date-time";

export const WEEKDAY_LABELS = ["M", "Tu", "W", "Th", "F", "Sa", "Su"] as const;
export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export const TANK_POSITIONS = ["lower", "upper", "left", "right"] as const;
export type TankPosition = (typeof TANK_POSITIONS)[number];

export type TankGroup = { position: TankPosition | null; sizeLiters: number | null };

// A schedule row with no position and no size is the system schedule.
export type FeedingScheduleRow = {
  tankPosition: TankPosition | null;
  sizeLiters: number | null;
  weekdays: number[];
  updatedAt: string;
};

export type FeedingEvent = { tankId: number; fedAt: string };

export function toFeedingScheduleRow(row: {
  tank_position: string | null;
  size_liters: number | string | null;
  weekdays: number[];
  updated_at: string;
}): FeedingScheduleRow {
  return {
    tankPosition: row.tank_position as TankPosition | null,
    sizeLiters: row.size_liters === null ? null : Number(row.size_liters),
    weekdays: row.weekdays,
    updatedAt: row.updated_at,
  };
}

export type FeedingScheduleStatus = {
  // Scheduled today and not yet fed today.
  dueToday: boolean;
  // Pacific date key of the next scheduled feeding; today while it is still due.
  nextDueDate: string | null;
  // Pacific date key of yesterday's missed feeding; rolls off at the end of today.
  overdueSince: string | null;
};

export type FeedingScopeStatus = FeedingScheduleStatus & {
  // Null for the system schedule; otherwise the tank group, e.g. "Lower" or "Lower 3L".
  scopeLabel: string | null;
};

// Tank names look like "Lower-14.6L", "right 90L" or "200L"; either part may be missing.
export function parseTankName(name: string): TankGroup {
  const position = /^\s*(lower|upper|left|right)(?![a-z])/i.exec(name)?.[1].toLowerCase() ?? null;
  const size = /(?:^|[^\d.])(\d+(?:\.\d+)?)\s*L(?![a-z])/i.exec(name)?.[1];
  return { position: position as TankPosition | null, sizeLiters: size === undefined ? null : Number(size) };
}

// Inverse of parseTankName: "Lower-9.6L", a custom label such as "Middle-9.6L", or "9.6L".
export function formatTankName(label: string | null, sizeLiters: number) {
  const trimmed = label?.trim();
  return trimmed ? `${trimmed}-${sizeLiters}L` : `${sizeLiters}L`;
}

export function formatTankGroup({ position, sizeLiters }: TankGroup) {
  const parts = [
    position ? position[0].toUpperCase() + position.slice(1) : null,
    sizeLiters === null ? null : `${sizeLiters}L`,
  ];
  return parts.filter(Boolean).join(" ");
}

// Groups Settings offers an override for: each position, a position's sizes when it has several,
// and sizes of tanks with no position. Existing rows are kept so renamed tanks can still be cleaned up.
export function listOverrideScopes(tankNames: readonly string[], existing: readonly TankGroup[]): TankGroup[] {
  const groups = tankNames.map(parseTankName);
  const scopes: TankGroup[] = [];
  const add = (scope: TankGroup) => {
    if (!scopes.some((s) => s.position === scope.position && s.sizeLiters === scope.sizeLiters)) scopes.push(scope);
  };
  for (const position of TANK_POSITIONS) {
    const sizes = [...new Set(groups.filter((g) => g.position === position).map((g) => g.sizeLiters))];
    if (sizes.length === 0) continue;
    add({ position, sizeLiters: null });
    const distinctSizes = sizes.filter((size): size is number => size !== null);
    if (distinctSizes.length > 1) distinctSizes.forEach((sizeLiters) => add({ position, sizeLiters }));
  }
  for (const g of groups) if (g.position === null && g.sizeLiters !== null) add(g);
  for (const g of existing) if (g.position !== null || g.sizeLiters !== null) add(g);

  const rank = (position: TankPosition | null) => (position ? TANK_POSITIONS.indexOf(position) : TANK_POSITIONS.length);
  return scopes.sort(
    (a, b) => rank(a.position) - rank(b.position) || (a.sizeLiters ?? -1) - (b.sizeLiters ?? -1),
  );
}

// ISO weekday of a Pacific date key: 1 = Monday ... 7 = Sunday.
export function isoWeekday(dateKey: string) {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay() || 7;
}

export function formatWeekdays(weekdays: readonly number[]) {
  return [...weekdays].sort((a, b) => a - b).map((day) => WEEKDAY_LABELS[day - 1]).join(" ");
}

// effectiveFrom is the schedule's updated_at: days up to and including it never count as missed.
export function deriveFeedingScheduleStatus(input: {
  weekdays: readonly number[];
  lastFedAt: string | null;
  effectiveFrom: string;
  now: Date;
}): FeedingScheduleStatus {
  const todayKey = pacificDateKey(input.now);
  const yesterdayKey = addPacificCalendarDays(todayKey, -1);
  const scheduled = (key: string) => input.weekdays.includes(isoWeekday(key));
  const fedKey = input.lastFedAt ? pacificDateKey(input.lastFedAt) : null;
  const fedToday = fedKey === todayKey;

  const dueToday = scheduled(todayKey) && !fedToday;

  let nextDueDate: string | null = null;
  if (dueToday) {
    nextDueDate = todayKey;
  } else {
    for (let offset = 1; offset <= 7; offset += 1) {
      const key = addPacificCalendarDays(todayKey, offset);
      if (scheduled(key)) {
        nextDueDate = key;
        break;
      }
    }
  }

  const missedYesterday =
    scheduled(yesterdayKey) &&
    yesterdayKey > pacificDateKey(input.effectiveFrom) &&
    !fedToday &&
    fedKey !== yesterdayKey;

  return { dueToday, nextDueDate, overdueSince: missedYesterday ? yesterdayKey : null };
}

// Most specific row wins: position + size, then position, then size, then the system row.
export function resolveTankSchedule(schedules: readonly FeedingScheduleRow[], group: TankGroup) {
  const find = (position: TankPosition | null, sizeLiters: number | null) =>
    schedules.find((row) => row.tankPosition === position && row.sizeLiters === sizeLiters);
  const { position, sizeLiters } = group;
  return (
    (position && sizeLiters !== null ? find(position, sizeLiters) : undefined) ??
    (position ? find(position, null) : undefined) ??
    (sizeLiters !== null ? find(null, sizeLiters) : undefined) ??
    find(null, null) ??
    null
  );
}

export function deriveSystemFeeding(input: {
  schedules: readonly FeedingScheduleRow[];
  tanks: readonly { id: number; name: string }[];
  feedings: readonly FeedingEvent[];
  now: Date;
}): FeedingScopeStatus[] {
  const tankIdsByRow = new Map<FeedingScheduleRow, Set<number>>();
  for (const tank of input.tanks) {
    const row = resolveTankSchedule(input.schedules, parseTankName(tank.name));
    if (row) tankIdsByRow.set(row, (tankIdsByRow.get(row) ?? new Set()).add(tank.id));
  }

  return [...tankIdsByRow].map(([row, tankIds]) => {
    const lastFedAt = input.feedings.reduce<string | null>(
      (max, event) => (tankIds.has(event.tankId) && (max === null || event.fedAt > max) ? event.fedAt : max),
      null,
    );
    const isSystemRow = row.tankPosition === null && row.sizeLiters === null;
    return {
      scopeLabel: isSystemRow ? null : formatTankGroup({ position: row.tankPosition, sizeLiters: row.sizeLiters }),
      ...deriveFeedingScheduleStatus({ weekdays: row.weekdays, lastFedAt, effectiveFrom: row.updatedAt, now: input.now }),
    };
  });
}

export type SystemFeedingSummary = {
  dueToday: boolean;
  nextDueDate: string | null;
  overdueSince: string | null;
  overdueScopeLabels: string[];
};

export function summarizeFeeding(statuses: readonly FeedingScopeStatus[]): SystemFeedingSummary | null {
  if (statuses.length === 0) return null;
  const earliest = (keys: (string | null)[]) =>
    keys.reduce<string | null>((min, key) => (key !== null && (min === null || key < min) ? key : min), null);
  return {
    dueToday: statuses.some((status) => status.dueToday),
    nextDueDate: earliest(statuses.map((status) => status.nextDueDate)),
    overdueSince: earliest(statuses.map((status) => status.overdueSince)),
    overdueScopeLabels: statuses.flatMap((status) =>
      status.overdueSince !== null && status.scopeLabel !== null ? [status.scopeLabel] : [],
    ),
  };
}
