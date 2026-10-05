import {
  addPacificCalendarDays,
  pacificDayBoundaryToIso,
} from "@/lib/pacific-date-time";
import {
  sortCatalogByName,
  type StarTreatmentCatalogItem,
} from "@/lib/daily-operations/quick-pick-catalogs";
import type { StarTreatmentRecordData } from "@/components/star-treatment-record";

export type StarTreatmentSearchParams = {
  from?: string | string[];
  to?: string | string[];
  animal?: string | string[];
  treatment?: string | string[];
};

export type StarTreatmentFilters = {
  from: string;
  to: string;
  animalFilter: string;
  treatmentFilter: string;
  animalId: number | undefined;
  treatmentType: "probiotics" | "reef_dip" | "other" | undefined;
  fromIso: string;
  toExclusiveIso: string;
};

export type StarTreatmentCatalogRow = {
  id: number;
  name: string;
  default_amount_unit: string | null;
  default_concentration_unit: string | null;
  is_active: boolean;
};

type NamedRelation = { id: number; name: string };
type TankRelation = NamedRelation & {
  system: NamedRelation | NamedRelation[] | null;
};

export type StarTreatmentRow = {
  id: number;
  animal_id: number;
  tank_id: number;
  catalog_id: number | null;
  treatment_type: string;
  amount: number | string | null;
  unit: string | null;
  concentration: number | string | null;
  concentration_unit: string | null;
  notes: string | null;
  administered_at: string;
  recorded_by: number;
  data_source: string;
  entered_at: string;
  animal: NamedRelation | NamedRelation[] | null;
  tank: TankRelation | TankRelation[] | null;
};

function firstValue(value: string | string[] | undefined): string | undefined {
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

export function parseStarTreatmentFilters(
  params: StarTreatmentSearchParams,
  today: string,
): StarTreatmentFilters {
  const requestedFrom = firstValue(params.from);
  const requestedTo = firstValue(params.to);
  const from = isDate(requestedFrom)
    ? requestedFrom
    : addPacificCalendarDays(today, -29);
  const to = isDate(requestedTo) ? requestedTo : today;
  const animalFilter = firstValue(params.animal) ?? "";
  const treatmentFilter = firstValue(params.treatment) ?? "";

  return {
    from,
    to,
    animalFilter,
    treatmentFilter,
    animalId: /^\d+$/.test(animalFilter) ? Number(animalFilter) : undefined,
    treatmentType:
      treatmentFilter === "probiotics" ||
      treatmentFilter === "reef_dip" ||
      treatmentFilter === "other"
        ? treatmentFilter
        : undefined,
    fromIso: pacificDayBoundaryToIso(from),
    toExclusiveIso: pacificDayBoundaryToIso(addPacificCalendarDays(to, 1)),
  };
}

export function deriveStarTreatmentCatalog(
  rows: StarTreatmentCatalogRow[],
): StarTreatmentCatalogItem[] {
  return sortCatalogByName(
    rows.map((item) => ({
      id: item.id,
      name: item.name,
      defaultAmountUnit: item.default_amount_unit,
      defaultConcentrationUnit: item.default_concentration_unit,
      isActive: item.is_active,
    })),
  );
}

export function deriveStarTreatmentRecords(
  treatments: StarTreatmentRow[],
): StarTreatmentRecordData[] {
  return treatments.map((treatment) => {
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
}