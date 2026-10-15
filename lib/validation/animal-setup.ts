import { z } from "zod";

import { getPacificDateString } from "@/lib/pacific-date-time";
import {
  capitalizeLabel,
  formatTankName,
  parseTankName,
  TANK_POSITIONS,
  type TankPosition,
} from "@/lib/systems/feeding-schedule";

// Shelf position dropdown order; "other" reveals an optional custom label such as Middle.
export const POSITION_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "upper", label: "Upper" },
  { value: "lower", label: "Lower" },
] as const satisfies readonly { value: TankPosition; label: string }[];

export const RETIRED_STATUSES = ["deceased", "transferred"] as const;
export type RetiredStatus = (typeof RETIRED_STATUSES)[number];

const SIZE_MESSAGE = "Enter the size in liters, e.g. 9.6";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const pastDate = z
  .string()
  .regex(DATE_PATTERN, "Select a date")
  .refine((value) => value <= getPacificDateString(), "Date can't be in the future");

// A custom label becomes the tank-name prefix, so it must not read as a standard position or a size.
export function customLabelError(label: string) {
  const trimmed = label.trim();
  if (trimmed === "") return null;
  if (trimmed.length > 30) return "Keep the position under 30 characters";
  if (trimmed.includes("-")) return "Leave out hyphens; the size is added for you";
  const parsed = parseTankName(trimmed);
  if (parsed.position) return `Choose ${capitalizeLabel(parsed.position)} from the list instead`;
  if (parsed.sizeLiters !== null) return "Leave out the size; enter it in Tank size";
  return null;
}

export const placementFields = {
  systemId: z.string().regex(/^\d+$/, "Select a system"),
  position: z.union([z.literal(""), z.enum(TANK_POSITIONS), z.literal("other")]),
  customLabel: z.string(),
  // At most 3 decimals keeps the number out of exponent notation in the tank name.
  sizeLiters: z
    .string()
    .trim()
    .regex(/^\d{1,6}(\.\d{1,3})?$/, SIZE_MESSAGE)
    .refine((value) => Number(value) > 0, SIZE_MESSAGE),
};

export type PlacementInput = {
  systemId: string;
  position: "" | TankPosition | "other";
  customLabel: string;
  sizeLiters: string;
};

export const animalSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter the animal's name")
      .max(60, "Keep the name under 60 characters"),
    speciesId: z.string().regex(/^\d+$/, "Select a species"),
    trackingType: z.enum(["individual", "cohort"]),
    quantity: z.string().trim().regex(/^[1-9]\d{0,5}$/, "Enter a whole number of 1 or more"),
    ...placementFields,
    lifeStage: z.string().trim().max(100, "Keep the life stage under 100 characters"),
    dateAdded: pastDate,
    notes: z.string().max(5000, "Keep notes under 5000 characters"),
  })
  .superRefine((values, context) => {
    if (values.trackingType === "individual" && values.quantity !== "1") {
      context.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "An individual has a quantity of 1",
      });
    }
    const labelError = values.position === "other" ? customLabelError(values.customLabel) : null;
    if (labelError) {
      context.addIssue({ code: "custom", path: ["customLabel"], message: labelError });
    }
  });

export type AnimalFormInput = z.input<typeof animalSchema>;
export type AnimalFormValues = z.output<typeof animalSchema>;

export function retireSchema(dateAdded: string) {
  return z.object({
    status: z.enum(RETIRED_STATUSES),
    retiredOn: pastDate.refine(
      (value) => value >= dateAdded,
      "Date can't be before the date added",
    ),
    notes: z.string().max(5000, "Keep notes under 5000 characters"),
  });
}

export type TankPlacement = {
  name: string;
  shelfPosition: TankPosition | null;
  sizeLiters: number;
};

// "Lower" + 9.6 → Lower-9.6L; Other "Middle" + 9.6 → Middle-9.6L; no position (or a blank Other) → 9.6L.
export function toTankPlacement({ position, customLabel, sizeLiters }: PlacementInput): TankPlacement {
  const size = Number(sizeLiters);
  if (position === "" || position === "other") {
    return {
      name: formatTankName(position === "other" ? capitalizeLabel(customLabel) : null, size),
      shelfPosition: null,
      sizeLiters: size,
    };
  }
  return { name: formatTankName(capitalizeLabel(position), size), shelfPosition: position, sizeLiters: size };
}

// Prefills the placement fields from an animal's current tank, including older free-form names.
export function placementFromTank(tank: {
  systemId: number;
  name: string;
  shelfPosition: TankPosition | null;
  sizeLiters: number | null;
}): PlacementInput {
  const parsed = parseTankName(tank.name);
  const size = parsed.sizeLiters ?? tank.sizeLiters;
  const base = { systemId: String(tank.systemId), sizeLiters: size === null ? "" : String(size) };
  const position = tank.shelfPosition ?? parsed.position;
  if (position) return { ...base, position, customLabel: "" };
  const label = tank.name.replace(/-?\s*\d+(?:\.\d+)?\s*L\s*$/i, "").trim();
  return { ...base, position: label ? "other" : "", customLabel: label };
}

// True when the form still describes the tank the animal is already in, so saving must not move it.
export function isSamePlacement(a: PlacementInput, b: PlacementInput) {
  return (
    a.systemId === b.systemId &&
    a.position === b.position &&
    capitalizeLabel(a.customLabel) === capitalizeLabel(b.customLabel) &&
    Number(a.sizeLiters) === Number(b.sizeLiters)
  );
}

export function animalSaveError(error: { code?: string; message: string }, name: string) {
  if (error.code === "23505") {
    return `An animal named ${name} already exists. Names are unique across the lab, including retired animals.`;
  }
  return error.message;
}

export type TankRecord = {
  id: number;
  systemId: number;
  name: string;
  shelfPosition: TankPosition | null;
  sizeLiters: number | null;
};

export type AnimalRecord = {
  id: number;
  name: string;
  tankId: number;
  speciesId: number;
  trackingType: "individual" | "cohort";
  quantity: number;
  status: "active" | RetiredStatus;
  lifeStage: string | null;
  dateAdded: string;
  retiredOn: string | null;
  notes: string | null;
};

export const TANK_COLUMNS = "id, system_id, name, shelf_position, size_liters";
export const ANIMAL_COLUMNS =
  "id, name, tank_id, species_id, tracking_type, quantity, status, life_stage, date_added, retired_on, notes";

export function toTankRecord(row: {
  id: number;
  system_id: number;
  name: string;
  shelf_position: string | null;
  size_liters: number | string | null;
}): TankRecord {
  return {
    id: row.id,
    systemId: row.system_id,
    name: row.name,
    shelfPosition: row.shelf_position as TankPosition | null,
    sizeLiters: row.size_liters === null ? null : Number(row.size_liters),
  };
}

export function toAnimalRecord(row: {
  id: number;
  name: string;
  tank_id: number;
  species_id: number;
  tracking_type: string;
  quantity: number;
  status: string;
  life_stage: string | null;
  date_added: string;
  retired_on: string | null;
  notes: string | null;
}): AnimalRecord {
  return {
    id: row.id,
    name: row.name,
    tankId: row.tank_id,
    speciesId: row.species_id,
    trackingType: row.tracking_type as AnimalRecord["trackingType"],
    quantity: row.quantity,
    status: row.status as AnimalRecord["status"],
    lifeStage: row.life_stage,
    dateAdded: row.date_added,
    retiredOn: row.retired_on,
    notes: row.notes,
  };
}
