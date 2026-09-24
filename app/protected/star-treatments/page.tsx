import Link from "next/link";
import { notFound } from "next/navigation";

import {
  StarTreatmentRecord,
  type StarTreatmentRecordData,
} from "@/components/star-treatment-record";
import { Button } from "@/components/ui/button";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { createClient } from "@/lib/supabase/server";

const LAB_TIME_ZONE = "America/Los_Angeles";

type SearchParams = Promise<{
  from?: string | string[];
  to?: string | string[];
  animal?: string | string[];
  treatment?: string | string[];
}>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function labDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LAB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function getTimeZoneOffset(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LAB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return (
    Date.UTC(
      value("year"),
      value("month") - 1,
      value("day"),
      value("hour"),
      value("minute"),
      value("second"),
    ) - date.getTime()
  );
}

function labDayBoundary(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const wallTime = Date.UTC(year, month - 1, day);
  let instant = new Date(wallTime);
  instant = new Date(wallTime - getTimeZoneOffset(instant));
  instant = new Date(wallTime - getTimeZoneOffset(instant));
  return instant.toISOString();
}

function oneRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function StarTreatmentsPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await getCurrentProfile();
  const canView =
    profile?.status === "active" &&
    ["admin", "technician", "volunteer"].includes(profile.role);

  if (!canView) notFound();

  const params = await searchParams;
  const today = labDateString();
  const requestedFrom = firstValue(params.from);
  const requestedTo = firstValue(params.to);
  const from = isDate(requestedFrom) ? requestedFrom : addDays(today, -29);
  const to = isDate(requestedTo) ? requestedTo : today;
  const animalFilter = firstValue(params.animal) ?? "";
  const treatmentFilter = firstValue(params.treatment) ?? "";
  const supabase = await createClient();

  const { data: starSpecies } = await supabase
    .from("species")
    .select("id")
    .eq("category", "star");
  const starSpeciesIds = (starSpecies ?? []).map((species) => species.id);
  const { data: stars } = starSpeciesIds.length
    ? await supabase
        .from("animals")
        .select("id, name")
        .eq("tracking_type", "individual")
        .in("species_id", starSpeciesIds)
        .order("name")
    : { data: [] };

  let treatmentQuery = supabase
    .from("star_treatments")
    .select(
      "id, animal_id, tank_id, treatment_type, amount, unit, concentration, concentration_unit, notes, administered_at, recorded_by, data_source, entered_at, animal:animals!star_treatments_animal_id_fkey(id, name), tank:tanks!star_treatments_tank_id_fkey(id, name, system:systems!tanks_system_id_fkey(id, name))",
    )
    .gte("administered_at", labDayBoundary(from))
    .lt("administered_at", labDayBoundary(addDays(to, 1)))
    .order("administered_at", { ascending: false });

  if (/^\d+$/.test(animalFilter)) {
    treatmentQuery = treatmentQuery.eq("animal_id", Number(animalFilter));
  }
  if (treatmentFilter === "probiotics" || treatmentFilter === "reef_dip") {
    treatmentQuery = treatmentQuery.eq("treatment_type", treatmentFilter);
  } else if (treatmentFilter === "other") {
    treatmentQuery = treatmentQuery.not("treatment_type", "in", '("probiotics","reef_dip")');
  }

  const { data: treatments, error } = await treatmentQuery;
  const records: StarTreatmentRecordData[] = (treatments ?? []).map((treatment) => {
    const animal = oneRelation(treatment.animal);
    const tank = oneRelation(treatment.tank);
    const system = oneRelation(tank?.system ?? null);
    return {
      id: treatment.id,
      animalId: treatment.animal_id,
      animalName: animal?.name ?? `Star ${treatment.animal_id}`,
      tankId: treatment.tank_id,
      tankName: tank?.name ?? `Tank ${treatment.tank_id}`,
      systemName: system?.name ?? "Unknown system",
      treatmentType: treatment.treatment_type,
      amount: treatment.amount === null ? null : String(treatment.amount),
      unit: treatment.unit,
      concentration:
        treatment.concentration === null ? null : String(treatment.concentration),
      concentrationUnit: treatment.concentration_unit,
      notes: treatment.notes,
      administeredAt: treatment.administered_at,
      recordedBy: treatment.recorded_by,
      dataSource: treatment.data_source,
      enteredAt: treatment.entered_at,
    };
  });

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Daily Operations</p>
          <h1 className="text-3xl font-semibold tracking-tight">Star treatments</h1>
        </div>
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/protected/daily-operations?type=star-treatment">
            Log star treatment
          </Link>
        </Button>
      </header>

      <form method="get" className="grid gap-4 rounded-md border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-2">
          <label htmlFor="treatments-from" className="text-sm font-medium">
            From
          </label>
          <input
            id="treatments-from"
            name="from"
            type="date"
            defaultValue={from}
            className="min-h-11 rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="treatments-to" className="text-sm font-medium">
            To
          </label>
          <input
            id="treatments-to"
            name="to"
            type="date"
            defaultValue={to}
            className="min-h-11 rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="treatments-animal" className="text-sm font-medium">
            Star
          </label>
          <select
            id="treatments-animal"
            name="animal"
            defaultValue={animalFilter}
            className="min-h-11 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">All stars</option>
            {(stars ?? []).map((star) => (
              <option key={star.id} value={star.id}>
                {star.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <label htmlFor="treatments-type" className="text-sm font-medium">
            Treatment type
          </label>
          <select
            id="treatments-type"
            name="treatment"
            defaultValue={treatmentFilter}
            className="min-h-11 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">All treatments</option>
            <option value="probiotics">Probiotics</option>
            <option value="reef_dip">Reef dip</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-3 sm:col-span-2 lg:col-span-4">
          <Button type="submit" className="min-h-11">
            Apply filters
          </Button>
          <Button asChild variant="ghost" className="min-h-11">
            <Link href="/protected/star-treatments">Reset</Link>
          </Button>
        </div>
      </form>

      {error ? (
        <p className="text-sm text-red-500" role="alert">
          Treatments could not be loaded: {error.message}
        </p>
      ) : records.length === 0 ? (
        <p className="rounded-md border p-6 text-sm text-muted-foreground">
          No star treatments match these filters.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {records.map((record) => (
            <StarTreatmentRecord
              key={record.id}
              treatment={record}
              canDelete={profile.role === "admin" || profile.role === "technician"}
            />
          ))}
        </div>
      )}
    </div>
  );
}