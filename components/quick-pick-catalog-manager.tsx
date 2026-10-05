"use client";

import { Archive, ArchiveRestore, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useState } from "react";

import {
  catalogNameKey,
  normalizeSnapshot,
  sortCatalogByName,
} from "@/lib/daily-operations/quick-pick-catalogs";
import {
  QUICK_PICK_CATALOGS,
  quickPickSelectColumns,
  toQuickPickCatalogRow,
  type QuickPickCatalogConfig,
  type QuickPickCatalogKey,
  type QuickPickCatalogRow,
} from "@/lib/daily-operations/quick-pick-catalog-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UnitSelect } from "@/components/unit-select";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type QuickPickCatalogInitialData = Partial<
  Record<QuickPickCatalogKey, { items: QuickPickCatalogRow[]; loadError: string | null }>
>;

type DatabaseError = { code?: string; message: string };
type UnitValues = Record<string, string>;
type FieldErrors = Partial<Record<string, string>>;

const UNIT_MAX_LENGTH = 50;

function isBuiltIn(config: QuickPickCatalogConfig, name: string) {
  return config.builtInNameKeys.includes(catalogNameKey(name));
}

function catalogError(config: QuickPickCatalogConfig, error: DatabaseError, name: string) {
  if (error.code === "23503") {
    return `${name} is used by saved ${config.usedBy}, so it cannot be deleted. Retire it instead.`;
  }
  if (error.code === "23505") return `A ${config.itemNoun} with this name already exists.`;
  // Trigger-raised 23514s carry readable messages; raw CHECK violations do not.
  if (error.code === "23514" && /violates check constraint/i.test(error.message)) {
    return `Names must be 1-${config.nameMaxLength} characters and units ${UNIT_MAX_LENGTH} or fewer.`;
  }
  return error.message;
}

function validateEntry(config: QuickPickCatalogConfig, name: string, units: UnitValues) {
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

function hasErrors(errors: FieldErrors) {
  return Object.keys(errors).length > 0;
}

function initialUnitValues(config: QuickPickCatalogConfig): UnitValues {
  return Object.fromEntries(
    config.unitFields.map((field) => [field.column, field.initialValue ?? ""]),
  );
}

function itemUnitValues(config: QuickPickCatalogConfig, item: QuickPickCatalogRow): UnitValues {
  return Object.fromEntries(
    config.unitFields.map((field) => [field.column, item.units[field.column] ?? ""]),
  );
}

function unitPayload(config: QuickPickCatalogConfig, units: UnitValues) {
  return Object.fromEntries(
    config.unitFields.map((field) => [
      field.column,
      normalizeSnapshot(units[field.column] ?? "") || null,
    ]),
  );
}

function unitSummary(config: QuickPickCatalogConfig, item: QuickPickCatalogRow) {
  return config.unitFields
    .map((field) => `${field.label}: ${item.units[field.column] ?? "No default"}`)
    .join("; ");
}

function describedBy(...ids: (string | false | undefined)[]) {
  return ids.filter(Boolean).join(" ") || undefined;
}

function fieldGridClassName(config: QuickPickCatalogConfig) {
  return config.unitFields.length > 1 ? "sm:grid-cols-3" : "sm:grid-cols-2";
}

export function QuickPickCatalogManager({
  initialCatalogs,
}: {
  initialCatalogs: QuickPickCatalogInitialData;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      {QUICK_PICK_CATALOGS.map((config) => (
        <QuickPickCatalogSection
          key={config.key}
          config={config}
          initialItems={initialCatalogs[config.key]?.items ?? []}
          loadError={initialCatalogs[config.key]?.loadError ?? null}
        />
      ))}
    </div>
  );
}

function QuickPickCatalogSection({
  config,
  initialItems,
  loadError,
}: {
  config: QuickPickCatalogConfig;
  initialItems: QuickPickCatalogRow[];
  loadError: string | null;
}) {
  const [catalog, setCatalog] = useState(() => sortCatalogByName(initialItems));
  const [newName, setNewName] = useState("");
  const [newUnits, setNewUnits] = useState(() => initialUnitValues(config));
  const [newErrors, setNewErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState(loadError ?? "");
  const [success, setSuccess] = useState("");
  const disabled = pending !== null || Boolean(loadError);
  const createKey = `${config.key}-create`;
  const newNameId = `new-${config.key}-name`;
  const newNameErrorId = `${newNameId}-error`;

  const showError = (message: string) => {
    setError(message);
    setSuccess("");
  };
  const showSuccess = (message: string) => {
    setError("");
    setSuccess(message);
  };

  const addItem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = validateEntry(config, newName, newUnits);
    setNewErrors(errors);
    if (hasErrors(errors)) {
      showError("Check the highlighted fields.");
      return;
    }

    const name = normalizeSnapshot(newName);
    setPending(createKey);
    setError("");
    setSuccess("");
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from(config.table)
      .insert({ name, ...unitPayload(config, newUnits) })
      .select<string, Record<string, unknown>>(quickPickSelectColumns(config))
      .single();
    setPending(null);

    if (insertError || !data) {
      showError(
        insertError
          ? catalogError(config, insertError, name)
          : `The ${config.itemNoun} could not be added.`,
      );
      return;
    }

    const created = toQuickPickCatalogRow(config, data);
    setCatalog((current) => sortCatalogByName([...current, created]));
    setNewName("");
    setNewUnits(initialUnitValues(config));
    showSuccess(`${created.name} added.`);
  };

  return (
    <Card className="w-full rounded-md shadow-none">
      <CardHeader>
        <CardTitle className="text-xl">{config.title}</CardTitle>
        <CardDescription>
          {config.description} Retired items stay on saved records but are hidden from
          the {config.formName}.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <CatalogMessages error={error} success={success} />
        {!loadError && catalog.length === 0 && (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No {config.title} quick picks are configured.
          </p>
        )}
        {catalog.length > 0 && (
          <div className="divide-y rounded-md border">
            {catalog.map((item) => (
              <QuickPickCatalogItem
                key={item.id}
                config={config}
                item={item}
                disabled={disabled}
                pendingAction={pending}
                onPending={setPending}
                onError={showError}
                onSuccess={showSuccess}
                onSaved={(saved) =>
                  setCatalog((current) =>
                    sortCatalogByName(
                      current.map((candidate) => (candidate.id === saved.id ? saved : candidate)),
                    ),
                  )
                }
                onDeleted={(id) =>
                  setCatalog((current) => current.filter((candidate) => candidate.id !== id))
                }
              />
            ))}
          </div>
        )}

        <form className="grid gap-3 border-t pt-5" onSubmit={addItem} noValidate>
          <h3 className="text-sm font-semibold">Add {config.title} quick pick</h3>
          <div className={cn("grid gap-3", fieldGridClassName(config))}>
            <div className="grid gap-2">
              <Label htmlFor={newNameId}>Name</Label>
              <Input
                id={newNameId}
                maxLength={config.nameMaxLength}
                value={newName}
                disabled={disabled}
                aria-invalid={Boolean(newErrors.name)}
                aria-describedby={newErrors.name ? newNameErrorId : undefined}
                onChange={(event) => setNewName(event.target.value)}
              />
              {newErrors.name && (
                <p id={newNameErrorId} className="text-sm text-red-500">
                  {newErrors.name}
                </p>
              )}
            </div>
            {config.unitFields.map((field) => (
              <UnitSelect
                key={field.column}
                id={`new-${config.key}-${field.column}`}
                label={field.label}
                options={field.options}
                value={newUnits[field.column] ?? ""}
                placeholder={field.required ? "Select a unit…" : "No default"}
                error={newErrors[field.column]}
                disabled={disabled}
                onChange={(value) =>
                  setNewUnits((current) => ({ ...current, [field.column]: value }))
                }
              />
            ))}
          </div>
          <Button type="submit" className="w-fit" disabled={disabled}>
            <Plus aria-hidden="true" />
            {pending === createKey ? "Adding…" : `Add ${config.itemNoun}`}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function QuickPickCatalogItem({
  config,
  item,
  disabled,
  pendingAction,
  onPending,
  onError,
  onSuccess,
  onSaved,
  onDeleted,
}: {
  config: QuickPickCatalogConfig;
  item: QuickPickCatalogRow;
  disabled: boolean;
  pendingAction: string | null;
  onPending: (value: string | null) => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  onSaved: (item: QuickPickCatalogRow) => void;
  onDeleted: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [units, setUnits] = useState(() => itemUnitValues(config, item));
  const [isActive, setIsActive] = useState(item.isActive);
  const [errors, setErrors] = useState<FieldErrors>({});
  const builtIn = isBuiltIn(config, item.name);
  const idPrefix = `${config.key}-${item.id}`;
  const nameErrorId = `${idPrefix}-name-error`;
  const builtInNoteId = `${idPrefix}-built-in-note`;
  const saveKey = `${idPrefix}-save`;
  const toggleKey = `${idPrefix}-toggle`;
  const deleteKey = `${idPrefix}-delete`;

  const builtInNote = builtIn && (
    <p id={builtInNoteId} className="basis-full text-xs text-muted-foreground">
      Built-in quick pick: it can&apos;t be renamed or deleted. Retire it to hide it from
      the {config.formName}.
    </p>
  );

  const startEditing = () => {
    setName(item.name);
    setUnits(itemUnitValues(config, item));
    setIsActive(item.isActive);
    setErrors({});
    setEditing(true);
  };

  const update = async (values: Record<string, unknown>, pendingKey: string) => {
    onPending(pendingKey);
    const supabase = createClient();
    const { data, error } = await supabase
      .from(config.table)
      .update(values)
      .eq("id", item.id)
      .eq("updated_at", item.updatedAt)
      .select<string, Record<string, unknown>>(quickPickSelectColumns(config))
      .maybeSingle();
    onPending(null);

    if (error || !data) {
      onError(
        error
          ? catalogError(config, error, item.name)
          : `${item.name} changed elsewhere. Refresh before trying again.`,
      );
      return null;
    }

    const saved = toQuickPickCatalogRow(config, data);
    onSaved(saved);
    return saved;
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateEntry(config, name, units);
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) {
      onError("Check the highlighted fields.");
      return;
    }

    const saved = await update(
      {
        ...(builtIn ? {} : { name: normalizeSnapshot(name) }),
        ...unitPayload(config, units),
        is_active: isActive,
      },
      saveKey,
    );
    if (!saved) return;
    setEditing(false);
    onSuccess(`${saved.name} saved.`);
  };

  const toggleActive = async () => {
    const saved = await update({ is_active: !item.isActive }, toggleKey);
    if (saved) onSuccess(saved.isActive ? `${saved.name} reactivated.` : `${saved.name} retired.`);
  };

  const remove = async () => {
    if (
      !window.confirm(
        `Delete ${item.name}? Items used by saved ${config.usedBy} can only be retired.`,
      )
    ) {
      return;
    }

    onPending(deleteKey);
    const supabase = createClient();
    const { data, error } = await supabase
      .from(config.table)
      .delete()
      .eq("id", item.id)
      .eq("updated_at", item.updatedAt)
      .select("id")
      .maybeSingle();
    onPending(null);

    if (error || !data) {
      onError(
        error
          ? catalogError(config, error, item.name)
          : `${item.name} changed elsewhere. Refresh before deleting it.`,
      );
      return;
    }

    onDeleted(item.id);
    onSuccess(`${item.name} deleted.`);
  };

  if (!editing) {
    const isToggling = pendingAction === toggleKey;
    return (
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 p-4",
          !item.isActive && "bg-muted/50",
        )}
      >
        <div className="grid gap-1">
          <p className={cn("text-sm font-medium", !item.isActive && "text-muted-foreground")}>
            {item.name}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {!item.isActive && (
              <Badge variant="outline" className="text-muted-foreground">
                Retired
              </Badge>
            )}
            {builtIn && <Badge variant="secondary">Built-in</Badge>}
            <span>{unitSummary(config, item)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={startEditing}
          >
            <Pencil aria-hidden="true" /> Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={toggleActive}
          >
            {item.isActive ? (
              <>
                <Archive aria-hidden="true" /> {isToggling ? "Retiring…" : "Retire"}
              </>
            ) : (
              <>
                <ArchiveRestore aria-hidden="true" />{" "}
                {isToggling ? "Reactivating…" : "Reactivate"}
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || builtIn}
            aria-describedby={builtIn ? builtInNoteId : undefined}
            onClick={remove}
          >
            <Trash2 aria-hidden="true" />{" "}
            {pendingAction === deleteKey ? "Deleting…" : "Delete"}
          </Button>
        </div>
        {builtInNote}
      </div>
    );
  }

  const isSaving = pendingAction === saveKey;
  return (
    <form className="grid gap-3 p-4" onSubmit={save} noValidate aria-busy={isSaving}>
      <div className={cn("grid gap-3", fieldGridClassName(config))}>
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-name`}>Name</Label>
          <Input
            id={`${idPrefix}-name`}
            maxLength={config.nameMaxLength}
            value={name}
            disabled={disabled || builtIn}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describedBy(errors.name && nameErrorId, builtIn && builtInNoteId)}
            onChange={(event) => setName(event.target.value)}
          />
          {errors.name && (
            <p id={nameErrorId} className="text-sm text-red-500">
              {errors.name}
            </p>
          )}
        </div>
        {config.unitFields.map((field) => (
          <UnitSelect
            key={field.column}
            id={`${idPrefix}-${field.column}`}
            label={field.label}
            options={field.options}
            value={units[field.column] ?? ""}
            placeholder={field.required ? "Select a unit…" : "No default"}
            error={errors[field.column]}
            disabled={disabled}
            onChange={(value) => setUnits((current) => ({ ...current, [field.column]: value }))}
          />
        ))}
      </div>
      {builtInNote}
      <div className="flex min-h-9 items-center gap-2">
        <Checkbox
          id={`${idPrefix}-active`}
          checked={isActive}
          disabled={disabled}
          onCheckedChange={(checked) => setIsActive(checked === true)}
        />
        <Label htmlFor={`${idPrefix}-active`}>Active in {config.formName}</Label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={disabled}>
          <Save aria-hidden="true" /> {isSaving ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          onClick={() => setEditing(false)}
        >
          <X aria-hidden="true" /> Cancel
        </Button>
      </div>
    </form>
  );
}

function CatalogMessages({ error, success }: { error: string; success: string }) {
  return (
    <div className="min-h-5">
      {error ? (
        <p className="text-sm text-red-500" role="alert">{error}</p>
      ) : (
        <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status" aria-live="polite">{success}</p>
      )}
    </div>
  );
}