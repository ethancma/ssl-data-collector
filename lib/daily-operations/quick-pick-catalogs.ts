export type ChemicalAdditionCatalogItem = {
  id: number;
  name: string;
  defaultUnit: string;
};

export type StarTreatmentCatalogItem = {
  id: number;
  name: string;
  defaultAmountUnit: string | null;
  defaultConcentrationUnit: string | null;
  // Omitted means active; retired items only reach forms editing a record that uses them.
  isActive?: boolean;
};

export type FoodCatalogItem = {
  id: number;
  name: string;
  defaultUnit: string;
};

export const DEFAULT_FOOD_UNIT = "pieces";

export function sortCatalogByName<T extends { name: string }>(items: readonly T[]) {
  return [...items].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
  );
}

export type CatalogSelection = {
  catalogId: number | null;
  name: string;
};

export type StarTreatmentSelection = CatalogSelection & {
  amountUnit: string;
  concentrationUnit: string;
};

export type StarTreatmentMeasurementValues = {
  treatmentName: string;
  amount: string;
  amountUnit: string;
  concentration: string;
  concentrationUnit: string;
};

export type StarTreatmentMeasurementErrors = Partial<
  Record<"amount" | "amountUnit" | "concentrationUnit", string>
>;

export function normalizeSnapshot(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function catalogNameKey(value: string) {
  return normalizeSnapshot(value).toLowerCase().replace(/[\s_-]+/g, "");
}

export function selectChemicalCatalogItem(
  item: ChemicalAdditionCatalogItem,
): CatalogSelection & { unit: string } {
  return {
    catalogId: item.id,
    name: item.name,
    unit: item.defaultUnit,
  };
}

export function attachedCatalogId(
  selection: CatalogSelection,
  catalogs: readonly { id: number; name: string }[],
) {
  if (selection.catalogId === null) return null;
  const catalog = catalogs.find((candidate) => candidate.id === selection.catalogId);
  return catalog && normalizeSnapshot(selection.name) === catalog.name
    ? catalog.id
    : null;
}

export function selectStarTreatmentCatalogItem(
  item: StarTreatmentCatalogItem | null,
  freeTextName = "",
): StarTreatmentSelection {
  if (!item) {
    return {
      catalogId: null,
      name: freeTextName,
      amountUnit: "",
      concentrationUnit: "",
    };
  }

  return {
    catalogId: item.id,
    name: item.name,
    amountUnit: item.defaultAmountUnit ?? "",
    concentrationUnit: item.defaultConcentrationUnit ?? "",
  };
}

export function resolveStarTreatmentCatalogItem(
  catalogId: number | null,
  snapshotName: string,
  catalogs: readonly StarTreatmentCatalogItem[],
) {
  if (catalogId === null) return null;
  const catalog = catalogs.find((candidate) => candidate.id === catalogId);
  return catalog && catalogNameKey(catalog.name) === catalogNameKey(snapshotName)
    ? catalog
    : null;
}

function isReefDipName(value: string) {
  return catalogNameKey(value) === "reefdip";
}

export function getStarTreatmentMeasurementErrors(
  values: StarTreatmentMeasurementValues,
): StarTreatmentMeasurementErrors {
  const hasAmount = values.amount.trim() !== "";
  const hasConcentration = values.concentration.trim() !== "";
  const errors: StarTreatmentMeasurementErrors = {};

  if (!hasAmount && !hasConcentration && !isReefDipName(values.treatmentName)) {
    errors.amount = "Enter an amount or concentration";
  }
  if (hasAmount && values.amountUnit.trim() === "") {
    errors.amountUnit = "Enter an amount unit";
  }
  if (hasConcentration && values.concentrationUnit.trim() === "") {
    errors.concentrationUnit = "Enter a concentration unit";
  }

  return errors;
}