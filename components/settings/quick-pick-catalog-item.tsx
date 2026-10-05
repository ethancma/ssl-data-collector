"use client";

import { Archive, ArchiveRestore, Pencil, Save, Trash2, X } from "lucide-react";
import { useState } from "react";

import { catalogNameKey, normalizeSnapshot } from "@/lib/daily-operations/quick-pick-catalogs";
import {
  catalogError,
  fieldGridClassName,
  hasErrors,
  unitPayload,
  validateEntry,
  type FieldErrors,
} from "@/lib/daily-operations/quick-pick-catalog-manager";
import {
  quickPickSelectColumns,
  toQuickPickCatalogRow,
  type QuickPickCatalogConfig,
  type QuickPickCatalogRow,
} from "@/lib/daily-operations/quick-pick-catalog-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UnitSelect } from "@/components/forms/unit-select";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

function itemUnitValues(config: QuickPickCatalogConfig, item: QuickPickCatalogRow) {
  return Object.fromEntries(
    config.unitFields.map((field) => [field.column, item.units[field.column] ?? ""]),
  );
}

function unitSummary(config: QuickPickCatalogConfig, item: QuickPickCatalogRow) {
  return config.unitFields
    .map((field) => `${field.label}: ${item.units[field.column] ?? "No default"}`)
    .join("; ");
}

function isBuiltIn(config: QuickPickCatalogConfig, name: string) {
  return config.builtInNameKeys.includes(catalogNameKey(name));
}

function describedBy(...ids: (string | false | undefined)[]) {
  return ids.filter(Boolean).join(" ") || undefined;
}

export function QuickPickCatalogItem({
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