import { catalogNameKey, normalizeSnapshot } from "@/lib/daily-operations/quick-pick-catalogs";
import type {
  QuickPickCatalogConfig,
} from "@/lib/daily-operations/quick-pick-catalog-config";

export type DatabaseError = { code?: string; message: string };
export type UnitValues = Record<string, string>;
export type FieldErrors = Partial<Record<string, string>>;

const UNIT_MAX_LENGTH = 50;

export function catalogError(config: QuickPickCatalogConfig, error: DatabaseError, name: string) {
  if (error.code === "23503") {
    return `${name} is used by saved ${config.usedBy}, so it cannot be deleted. Retire it instead.`;
  }
  if (error.code === "23505") return `A ${config.itemNoun} with this name already exists.`;
  if (error.code === "23514" && /violates check constraint/i.test(error.message)) {
    return `Names must be 1-${config.nameMaxLength} characters and units ${UNIT_MAX_LENGTH} or fewer.`;
  }
  return error.message;
}

export function validateEntry(config: QuickPickCatalogConfig, name: string, units: UnitValues) {
  const errors: FieldErrors = {};
  const normalizedName = normalizeSnapshot(name);
  if (!normalizedName) {
    errors.name = "Name is required.";
  } else if (normalizedName.length > config.nameMaxLength) {
    errors.name = `Name must be ${config.nameMaxLength} characters or fewer.`;
  } else if (config.reservedNameKeys.includes(catalogNameKey(normalizedName))) {
    errors.name = `${normalizedName} is reserved. Enter a different name.`;
  }
  for (const field of config.unitFields) {
    const unit = normalizeSnapshot(units[field.column] ?? "");
    if (field.required && !unit) {
      errors[field.column] = `${field.label} is required.`;
    } else if (unit.length > UNIT_MAX_LENGTH) {
      errors[field.column] = `${field.label} must be ${UNIT_MAX_LENGTH} characters or fewer.`;
    }
  }
  return errors;
}

export function hasErrors(errors: FieldErrors) {
  return Object.keys(errors).length > 0;
}

export function initialUnitValues(config: QuickPickCatalogConfig): UnitValues {
  return Object.fromEntries(
    config.unitFields.map((field) => [field.column, field.initialValue ?? ""]),
  );
}

export function unitPayload(config: QuickPickCatalogConfig, units: UnitValues) {
  return Object.fromEntries(
    config.unitFields.map((field) => [
      field.column,
      normalizeSnapshot(units[field.column] ?? "") || null,
    ]),
  );
}

export function fieldGridClassName(config: QuickPickCatalogConfig) {
  return config.unitFields.length > 1 ? "sm:grid-cols-3" : "sm:grid-cols-2";
}