import { DEFAULT_FOOD_UNIT } from "@/components/daily-operations/quick-pick-catalogs";
import { FOOD_UNITS, MEASUREMENT_UNITS } from "@/lib/config/reference-data";

export type QuickPickCatalogKey = "food" | "chemical" | "star";

export type QuickPickUnitField = {
  column: string;
  label: string;
  required: boolean;
  options: readonly string[];
  // Prefilled value in the add form.
  initialValue?: string;
};

export type QuickPickCatalogConfig = {
  key: QuickPickCatalogKey;
  table: string;
  title: string;
  description: string;
  // Used in "Add …" buttons and messages, e.g. "food" or "quick pick".
  itemNoun: string;
  nameMaxLength: number;
  unitFields: readonly QuickPickUnitField[];
  usedBy: string;
  formName: string;
  // Normalized name keys (lowercase, no spaces/_/-) the database treats specially.
  reservedNameKeys: readonly string[];
  builtInNameKeys: readonly string[];
};

export type QuickPickCatalogRow = {
  id: number;
  name: string;
  isActive: boolean;
  updatedAt: string;
  units: Record<string, string | null>;
};

export const QUICK_PICK_CATALOGS: readonly QuickPickCatalogConfig[] = [
  {
    key: "food",
    table: "food_catalog",
    title: "Feeding",
    description: "Food choices and suggested amount unit shown in the daily feeding form.",
    itemNoun: "food",
    nameMaxLength: 200,
    unitFields: [
      {
        column: "default_unit",
        label: "Default unit",
        required: true,
        options: FOOD_UNITS,
        initialValue: DEFAULT_FOOD_UNIT,
      },
    ],
    usedBy: "feeding logs",
    formName: "feeding form",
    reservedNameKeys: ["other"],
    builtInNameKeys: [],
  },
  {
    key: "chemical",
    table: "chemical_addition_catalog",
    title: "Chemical Addition",
    description: "Name and suggested unit shown in the daily chemical addition form.",
    itemNoun: "quick pick",
    nameMaxLength: 200,
    unitFields: [
      {
        column: "default_unit",
        label: "Default unit",
        required: true,
        options: MEASUREMENT_UNITS,
      },
    ],
    usedBy: "chemical additions",
    formName: "chemical addition form",
    reservedNameKeys: [],
    builtInNameKeys: [],
  },
  {
    key: "star",
    table: "star_treatment_catalog",
    title: "Star Treatment",
    description: "Name and optional amount and concentration unit suggestions.",
    itemNoun: "quick pick",
    nameMaxLength: 100,
    unitFields: [
      {
        column: "default_amount_unit",
        label: "Amount unit",
        required: false,
        options: MEASUREMENT_UNITS,
      },
      {
        column: "default_concentration_unit",
        label: "Concentration unit",
        required: false,
        options: MEASUREMENT_UNITS,
      },
    ],
    usedBy: "star treatments",
    formName: "star treatment form",
    reservedNameKeys: [],
    builtInNameKeys: ["probiotics", "reefdip"],
  },
];

export function quickPickSelectColumns(config: QuickPickCatalogConfig) {
  return ["id", "name", "is_active", "updated_at", ...config.unitFields.map((f) => f.column)].join(
    ", ",
  );
}

export function toQuickPickCatalogRow(
  config: QuickPickCatalogConfig,
  row: Record<string, unknown>,
): QuickPickCatalogRow {
  return {
    id: row.id as number,
    name: row.name as string,
    isActive: row.is_active as boolean,
    updatedAt: row.updated_at as string,
    units: Object.fromEntries(
      config.unitFields.map((field) => [field.column, (row[field.column] as string | null) ?? null]),
    ),
  };
}
