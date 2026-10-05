"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { normalizeSnapshot, sortCatalogByName } from "@/lib/daily-operations/quick-pick-catalogs";
import { QuickPickCatalogItem } from "@/components/settings/quick-pick-catalog-item";
import {
  catalogError,
  fieldGridClassName,
  hasErrors,
  initialUnitValues,
  unitPayload,
  validateEntry,
  type FieldErrors,
} from "@/lib/daily-operations/quick-pick-catalog-manager";
import {
  QUICK_PICK_CATALOGS,
  quickPickSelectColumns,
  toQuickPickCatalogRow,
  type QuickPickCatalogConfig,
  type QuickPickCatalogKey,
  type QuickPickCatalogRow,
} from "@/lib/daily-operations/quick-pick-catalog-config";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UnitSelect } from "@/components/forms/unit-select";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type QuickPickCatalogInitialData = Partial<
  Record<QuickPickCatalogKey, { items: QuickPickCatalogRow[]; loadError: string | null }>
>;

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