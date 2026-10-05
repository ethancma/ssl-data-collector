export type BatchScopeSystem = { id: number; name: string };
export type BatchScopeTank = { id: number; name: string; systemId: number };
export type BatchScopeAnimal = { id: number; name: string; tankId: number; detail?: string };

// Shape returned by core.create_feeding_batch and core.create_star_treatment_batch.
export type BatchLogResult = {
  request_id: string;
  replayed: boolean;
  created_count: number;
  excluded_animal_ids: number[];
  records: { id: number; animal_id: number; tank_id: number }[];
};

export type BatchScopeIds = {
  systemId: number | null;
  tankId: number | null;
  animalId: number | null;
};

export type BatchSelection = {
  scopeKey: string;
  checked: ReadonlyMap<number, boolean>;
  // Default for animals with no explicit entry: true on a fresh scope, false after a stale refresh.
  newAnimalsChecked: boolean;
};

export function eligibleAnimalsForScope(
  scope: BatchScopeIds,
  tanks: BatchScopeTank[],
  animals: BatchScopeAnimal[],
): BatchScopeAnimal[] {
  if (scope.systemId === null) return [];
  if (scope.animalId !== null) {
    return animals.filter(
      (animal) => animal.id === scope.animalId && animal.tankId === scope.tankId,
    );
  }
  if (scope.tankId !== null) {
    return animals.filter((animal) => animal.tankId === scope.tankId);
  }
  const tankIds = new Set(
    tanks.filter((tank) => tank.systemId === scope.systemId).map((tank) => tank.id),
  );
  return animals.filter((animal) => tankIds.has(animal.tankId));
}

export function isAnimalChecked(selection: BatchSelection, animalId: number) {
  return selection.checked.get(animalId) ?? selection.newAnimalsChecked;
}

export function splitSelection(eligible: BatchScopeAnimal[], selection: BatchSelection) {
  const includedIds: number[] = [];
  const excludedIds: number[] = [];
  for (const animal of eligible) {
    (isAnimalChecked(selection, animal.id) ? includedIds : excludedIds).push(animal.id);
  }
  const byId = (a: number, b: number) => a - b;
  return { includedIds: includedIds.sort(byId), excludedIds: excludedIds.sort(byId) };
}

export function setAnimalsChecked(
  selection: BatchSelection,
  animalIds: number[],
  checked: boolean,
): BatchSelection {
  const next = new Map(selection.checked);
  for (const id of animalIds) next.set(id, checked);
  return { ...selection, checked: next };
}

// Pins every animal the user has already seen, so animals that appear after a refresh start unchecked.
export function freezeSelectionForRefresh(
  selection: BatchSelection,
  eligible: BatchScopeAnimal[],
): BatchSelection {
  const next = new Map(selection.checked);
  for (const animal of eligible) next.set(animal.id, isAnimalChecked(selection, animal.id));
  return { ...selection, checked: next, newAnimalsChecked: false };
}

type BatchErrorKind =
  | "stale"
  | "conflict"
  | "no-eligible"
  | "permission"
  | "bad-request"
  | "missing-reference"
  | "validation"
  | "missing-time"
  | "unconfirmed"
  | "other";

export type BatchSaveError = { kind: BatchErrorKind; message: string };

type RpcError = { code?: string | null; message?: string | null };

const ERROR_PREFIX = /^(STALE_PREVIEW|REQUEST_ID_CONFLICT|NO_ELIGIBLE_ANIMALS):\s*/;

export function describeBatchError(error: RpcError, nounPlural: string): BatchSaveError {
  const detail = (error.message ?? "").replace(ERROR_PREFIX, "").trim();
  const withDetail = (fallback: string) => `${detail || fallback} Nothing was saved.`;

  switch (error.code) {
    case "SSL01":
      return {
        kind: "stale",
        message: `The ${nounPlural} in this scope changed since the list loaded. Nothing was saved. The list has been refreshed; your exclusions are kept and any newly listed ${nounPlural} are unchecked. Review the list and save again.`,
      };
    case "SSL02":
      return {
        kind: "conflict",
        message:
          "This save's request ID was already used for a different save. Nothing was saved. Review the form and save again.",
      };
    case "SSL03":
      return {
        kind: "no-eligible",
        message: `No eligible ${nounPlural} are in this scope anymore. Nothing was saved.`,
      };
    case "42501":
      return {
        kind: "permission",
        message: `You don't have permission to save this. Nothing was saved.${detail ? ` ${detail}` : ""}`,
      };
    case "22023":
      return { kind: "bad-request", message: withDetail("The save request was invalid.") };
    case "23503":
      return {
        kind: "missing-reference",
        message: withDetail("A selected choice no longer exists."),
      };
    case "23514":
      return { kind: "validation", message: withDetail("A value is not allowed.") };
    case "23502":
      return { kind: "missing-time", message: withDetail("Enter a time.") };
  }

  // No Postgres code means no server verdict: the request failed or its response was lost.
  if (!error.code) {
    return {
      kind: "unconfirmed",
      message:
        "The save could not be confirmed because the connection failed. Your entries are kept. Press save again to retry; a retry will not create duplicates.",
    };
  }
  return { kind: "other", message: withDetail("The save failed.") };
}

type BatchSaveOutcome =
  | { ok: true; result: BatchLogResult }
  | { ok: false; error: BatchSaveError };

export async function runBatchSave(
  save: () => PromiseLike<{ data: unknown; error: RpcError | null }>,
  nounPlural: string,
): Promise<BatchSaveOutcome> {
  try {
    const { data, error } = await save();
    if (error) return { ok: false, error: describeBatchError(error, nounPlural) };
    return { ok: true, result: data as BatchLogResult };
  } catch {
    return { ok: false, error: describeBatchError({}, nounPlural) };
  }
}
