import Link from "next/link";
import { notFound } from "next/navigation";

import {
  StarTreatmentRecord,
  type StarTreatmentRecordData,
} from "@/components/star-treatment-record";
import {
  addPacificCalendarDays,
  getPacificDateString,
  pacificDayBoundaryToIso,
} from "@/components/daily-operations/pacific-date-time";
import type { StarTreatmentCatalogItem } from "@/components/daily-operations/quick-pick-catalogs";
import { Button } from "@/components/ui/button";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { createClient } from "@/lib/supabase/server";

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
  const today = getPacificDateString();
  const requestedFrom = firstValue(params.from);
  const requestedTo = firstValue(params.to);
  const from = isDate(requestedFrom)
    ? requestedFrom
    : addPacificCalendarDays(today, -29);
  const to = isDate(requestedTo) ? requestedTo : today;
  const animalFilter = firstValue(params.animal) ?? "";
  const treatmentFilter = firstValue(params.treatment) ?? "";
  const supabase = await createClient();

  const [starSpeciesResult, catalogResult] = await Promise.all([
    supabase
      .from("species")
      .select("id")
      .eq("category", "star")
      .order("common_name")
      .order("id"),
    supabase
      .from("star_treatment_catalog")
      .select("id, name, default_amount_unit, default_concentration_unit")
      .order("id"),
  ]);
  const { data: starSpecies, error: starSpeciesError } = starSpeciesResult;
  const catalog: StarTreatmentCatalogItem[] = (catalogResult.data ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    defaultAmountUnit: item.default_amount_unit,
    defaultConcentrationUnit: item.default_concentration_unit,
  }));
  const starSpeciesIds = (starSpecies ?? []).map((species) => species.id);
  const starsResult = starSpeciesIds.length
    ? await supabase
        .from("animals")
        .select("id, name")
        .eq("tracking_type", "individual")
        .in("species_id", starSpeciesIds)
        .order("name")
    : { data: [], error: null };
  const stars = starsResult.data;
  const starChoicesError =
    starSpeciesError?.message ??
    starsResult.error?.message ??
    (starSpeciesIds.length === 0 ? "No star species are configured." : undefined);

  let treatmentQuery = supabase
    .from("star_treatments")
    .select(
      "id, animal_id, tank_id, catalog_id, treatment_type, amount, unit, concentration, concentration_unit, notes, administered_at, recorded_by, data_source, entered_at, animal:animals!star_treatments_animal_id_fkey(id, name), tank:tanks!star_treatments_tank_id_fkey(id, name, system:systems!tanks_system_id_fkey(id, name))",
    )
    .gte("administered_at", pacificDayBoundaryToIso(from))
    .lt(
      "administered_at",
      pacificDayBoundaryToIso(addPacificCalendarDays(to, 1)),
    )
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
      catalogId: treatment.catalog_id,
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

      {starChoicesError && (
        <p className="text-sm text-red-500" role="alert">
          Star choices could not be loaded: {starChoicesError}
        </p>
      )}

      {catalogResult.error && (
        <p className="text-sm text-red-500" role="alert">
          Treatment quick picks could not be loaded. Existing snapshots remain editable
          as Other.
        </p>
      )}

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
              canEdit={
                profile.role === "admin" ||
                profile.role === "technician" ||
                record.recordedBy === profile.id
              }
              canDelete={profile.role === "admin" || profile.role === "technician"}
              catalogs={catalog}
            />
          ))}
        </div>
      )}
    </div>
  );
}