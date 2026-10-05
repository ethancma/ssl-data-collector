const PACIFIC_TIME_ZONE = "America/Los_Angeles";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const HOUR_MS = 60 * 60 * 1000;

const pacificPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PACIFIC_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function dateTimeParts(value: Date): DateTimeParts {
  const parts = pacificPartsFormatter.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value);

  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  };
}

function timeZoneOffsetMs(value: Date) {
  const parts = dateTimeParts(value);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return representedAsUtc - value.getTime();
}

function parseWallDateTime(date: string, time: string): DateTimeParts {
  const dateMatch = DATE_PATTERN.exec(date);
  const timeMatch = TIME_PATTERN.exec(time);
  if (!dateMatch || !timeMatch) {
    throw new RangeError("Enter a valid Pacific date and time");
  }

  const parts = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: 0,
  };
  const calendarCheck = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day),
  );
  if (
    calendarCheck.getUTCFullYear() !== parts.year ||
    calendarCheck.getUTCMonth() !== parts.month - 1 ||
    calendarCheck.getUTCDate() !== parts.day
  ) {
    throw new RangeError("Enter a valid Pacific date and time");
  }

  return parts;
}

function hasSameParts(left: DateTimeParts, right: DateTimeParts) {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second
  );
}

export function getPacificDateTimeParts(value = new Date()) {
  const parts = dateTimeParts(value);
  return {
    date: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
    time: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
  };
}

export function getPacificDateString(value = new Date()) {
  return getPacificDateTimeParts(value).date;
}

export function getPacificTimeString(value = new Date()) {
  return getPacificDateTimeParts(value).time;
}

export function pacificWallTimeToIso(date: string, time: string) {
  const requested = parseWallDateTime(date, time);
  const wallTime = Date.UTC(
    requested.year,
    requested.month - 1,
    requested.day,
    requested.hour,
    requested.minute,
  );
  const offsets = new Set<number>();

  for (let hours = -48; hours <= 48; hours += 6) {
    offsets.add(timeZoneOffsetMs(new Date(wallTime + hours * HOUR_MS)));
  }

  const matches = [...offsets]
    .map((offset) => new Date(wallTime - offset))
    .filter((candidate) => hasSameParts(dateTimeParts(candidate), requested))
    .sort((left, right) => left.getTime() - right.getTime());

  if (matches.length === 0) {
    throw new RangeError(
      "This time does not exist in Pacific time because clocks move forward. Choose another time.",
    );
  }

  return matches[0].toISOString();
}

// Form-friendly wrapper: returns the error message instead of throwing.
export function parsePacificInstant(
  date: string,
  time: string,
): { iso: string; error?: undefined } | { iso?: undefined; error: string } {
  try {
    return { iso: pacificWallTimeToIso(date, time) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Enter a valid Pacific time" };
  }
}

export function pacificDayBoundaryToIso(date: string) {
  return pacificWallTimeToIso(date, "00:00");
}

export function addPacificCalendarDays(date: string, days: number) {
  const requested = parseWallDateTime(date, "00:00");
  const result = new Date(
    Date.UTC(requested.year, requested.month - 1, requested.day + days),
  );
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, "0")}-${String(result.getUTCDate()).padStart(2, "0")}`;
}

export function pacificDateKey(value: string | Date) {
  return getPacificDateString(typeof value === "string" ? new Date(value) : value);
}

export function formatPacificDateTime(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
) {
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: PACIFIC_TIME_ZONE,
  }).format(typeof value === "string" ? new Date(value) : value);
}