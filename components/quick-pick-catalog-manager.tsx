"use client";

import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useState } from "react";

import { normalizeSnapshot } from "@/components/daily-operations/quick-pick-catalogs";
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
import { createClient } from "@/lib/supabase/client";

type ChemicalCatalogRow = {
  id: number;
  name: string;
  defaultUnit: string;
  updatedAt: string;
};

type StarCatalogRow = {
  id: number;
  name: string;
  defaultAmountUnit: string | null;
  defaultConcentrationUnit: string | null;
  updatedAt: string;
};

type DatabaseError = { code?: string; message: string };

function catalogError(error: DatabaseError, action: "save" | "delete") {
  if (error.code === "23503" && action === "delete") {
    return "This quick pick is used by saved records and cannot be deleted.";
  }
  if (error.code === "23505") {
    return "A quick pick with this name already exists.";
  }
  return error.message;
}

function sortByName<T extends { name: string }>(items: T[]) {
  return [...items].sort((left, right) => left.name.localeCompare(right.name));
}

function requiredValue(value: string, label: string, maximum: number) {
  const normalized = normalizeSnapshot(value);
  if (!normalized) return `${label} is required.`;
  if (normalized.length > maximum) return `${label} must be ${maximum} characters or fewer.`;
  return null;
}

function optionalValue(value: string, label: string) {
  const normalized = normalizeSnapshot(value);
  if (normalized.length > 50) return `${label} must be 50 characters or fewer.`;
  return null;
}

export function QuickPickCatalogManager({
  initialChemicalCatalog,
  initialStarCatalog,
  loadError,
}: {
  initialChemicalCatalog: ChemicalCatalogRow[];
  initialStarCatalog: StarCatalogRow[];
  loadError?: string | null;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <ChemicalCatalogManager
        initialCatalog={initialChemicalCatalog}
        loadError={loadError}
      />
      <StarCatalogManager initialCatalog={initialStarCatalog} loadError={loadError} />
    </div>
  );
}

function ChemicalCatalogManager({
  initialCatalog,
  loadError,
}: {
  initialCatalog: ChemicalCatalogRow[];
  loadError?: string | null;
}) {
  const [catalog, setCatalog] = useState(initialCatalog);
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState(loadError ?? "");
  const [success, setSuccess] = useState("");

  const addItem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError =
      requiredValue(newName, "Name", 200) ?? requiredValue(newUnit, "Default unit", 50);
    if (validationError) {
      setError(validationError);
      setSuccess("");
      return;
    }

    setPending("create");
    setError("");
    setSuccess("");
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("chemical_addition_catalog")
      .insert({ name: normalizeSnapshot(newName), default_unit: normalizeSnapshot(newUnit) })
      .select("id, name, default_unit, updated_at")
      .single();
    setPending(null);

    if (insertError || !data) {
      setError(
        insertError ? catalogError(insertError, "save") : "Quick pick could not be added.",
      );
      return;
    }

    setCatalog((current) =>
      sortByName([
        ...current,
        {
          id: data.id,
          name: data.name,
          defaultUnit: data.default_unit,
          updatedAt: data.updated_at,
        },
      ]),
    );
    setNewName("");
    setNewUnit("");
    setSuccess(`${data.name} added.`);
  };

  return (
    <Card className="w-full rounded-md shadow-none">
      <CardHeader>
        <CardTitle className="text-xl">Chemical Addition</CardTitle>
        <CardDescription>Name and suggested unit shown in the daily form.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <CatalogMessages error={error} success={success} />
        {!loadError && catalog.length === 0 && (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No Chemical Addition quick picks are configured.
          </p>
        )}
        <div className="divide-y rounded-md border">
          {catalog.map((item) => (
            <ChemicalCatalogEditor
              key={item.id}
              item={item}
              disabled={pending !== null || Boolean(loadError)}
              pendingAction={pending}
              onPending={setPending}
              onError={(message) => {
                setError(message);
                setSuccess("");
              }}
              onSuccess={(message) => {
                setError("");
                setSuccess(message);
              }}
              onSaved={(saved) =>
                setCatalog((current) =>
                  sortByName(current.map((candidate) => candidate.id === saved.id ? saved : candidate)),
                )
              }
              onDeleted={(id) =>
                setCatalog((current) => current.filter((candidate) => candidate.id !== id))
              }
            />
          ))}
        </div>

        <form className="grid gap-3 border-t pt-5" onSubmit={addItem} noValidate>
          <h3 className="text-sm font-semibold">Add Chemical Addition quick pick</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="new-chemical-name">Name</Label>
              <Input
                id="new-chemical-name"
                className="min-h-11"
                maxLength={200}
                value={newName}
                disabled={pending !== null || Boolean(loadError)}
                onChange={(event) => setNewName(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-chemical-unit">Default unit</Label>
              <Input
                id="new-chemical-unit"
                className="min-h-11"
                maxLength={50}
                value={newUnit}
                disabled={pending !== null || Boolean(loadError)}
                onChange={(event) => setNewUnit(event.target.value)}
              />
            </div>
          </div>
          <Button type="submit" className="min-h-11 w-fit" disabled={pending !== null || Boolean(loadError)}>
            <Plus aria-hidden="true" />
            {pending === "create" ? "Adding…" : "Add quick pick"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ChemicalCatalogEditor({
  item,
  disabled,
  pendingAction,
  onPending,
  onError,
  onSuccess,
  onSaved,
  onDeleted,
}: {
  item: ChemicalCatalogRow;
  disabled: boolean;
  pendingAction: string | null;
  onPending: (value: string | null) => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  onSaved: (item: ChemicalCatalogRow) => void;
  onDeleted: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [unit, setUnit] = useState(item.defaultUnit);
  const isSaving = pendingAction === `chemical-save-${item.id}`;
  const isDeleting = pendingAction === `chemical-delete-${item.id}`;

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError =
      requiredValue(name, "Name", 200) ?? requiredValue(unit, "Default unit", 50);
    if (validationError) {
      onError(validationError);
      return;
    }

    onPending(`chemical-save-${item.id}`);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("chemical_addition_catalog")
      .update({ name: normalizeSnapshot(name), default_unit: normalizeSnapshot(unit) })
      .eq("id", item.id)
      .eq("updated_at", item.updatedAt)
      .select("id, name, default_unit, updated_at")
      .maybeSingle();
    onPending(null);

    if (error || !data) {
      onError(
        error
          ? catalogError(error, "save")
          : "This quick pick changed elsewhere. Refresh before saving again.",
      );
      return;
    }

    const saved = {
      id: data.id,
      name: data.name,
      defaultUnit: data.default_unit,
      updatedAt: data.updated_at,
    };
    setName(saved.name);
    setUnit(saved.defaultUnit);
    setEditing(false);
    onSaved(saved);
    onSuccess(`${saved.name} saved.`);
  };

  const remove = async () => {
    if (!window.confirm(`Delete the ${item.name} quick pick?`)) return;

    onPending(`chemical-delete-${item.id}`);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("chemical_addition_catalog")
      .delete()
      .eq("id", item.id)
      .eq("updated_at", item.updatedAt)
      .select("id")
      .maybeSingle();
    onPending(null);

    if (error || !data) {
      onError(
        error
          ? catalogError(error, "delete")
          : "This quick pick changed elsewhere. Refresh before deleting it.",
      );
      return;
    }

    onDeleted(item.id);
    onSuccess(`${item.name} deleted.`);
  };

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-medium">{item.name}</p>
          <p className="text-xs text-muted-foreground">Default unit: {item.defaultUnit}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="min-h-11" disabled={disabled} onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" /> Edit
          </Button>
          <Button type="button" variant="outline" className="min-h-11" disabled={disabled} onClick={remove}>
            <Trash2 aria-hidden="true" /> {isDeleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form className="grid gap-3 p-4" onSubmit={save} noValidate aria-busy={isSaving}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`chemical-${item.id}-name`}>Name</Label>
          <Input id={`chemical-${item.id}-name`} className="min-h-11" maxLength={200} value={name} disabled={disabled} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`chemical-${item.id}-unit`}>Default unit</Label>
          <Input id={`chemical-${item.id}-unit`} className="min-h-11" maxLength={50} value={unit} disabled={disabled} onChange={(event) => setUnit(event.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="min-h-11" disabled={disabled}><Save aria-hidden="true" /> {isSaving ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="ghost" className="min-h-11" disabled={disabled} onClick={() => { setName(item.name); setUnit(item.defaultUnit); setEditing(false); }}><X aria-hidden="true" /> Cancel</Button>
      </div>
    </form>
  );
}

function StarCatalogManager({
  initialCatalog,
  loadError,
}: {
  initialCatalog: StarCatalogRow[];
  loadError?: string | null;
}) {
  const [catalog, setCatalog] = useState(initialCatalog);
  const [newName, setNewName] = useState("");
  const [newAmountUnit, setNewAmountUnit] = useState("");
  const [newConcentrationUnit, setNewConcentrationUnit] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState(loadError ?? "");
  const [success, setSuccess] = useState("");

  const addItem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError =
      requiredValue(newName, "Name", 100) ??
      optionalValue(newAmountUnit, "Default amount unit") ??
      optionalValue(newConcentrationUnit, "Default concentration unit");
    if (validationError) {
      setError(validationError);
      setSuccess("");
      return;
    }

    setPending("create");
    setError("");
    setSuccess("");
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("star_treatment_catalog")
      .insert({
        name: normalizeSnapshot(newName),
        default_amount_unit: normalizeSnapshot(newAmountUnit) || null,
        default_concentration_unit: normalizeSnapshot(newConcentrationUnit) || null,
      })
      .select("id, name, default_amount_unit, default_concentration_unit, updated_at")
      .single();
    setPending(null);

    if (insertError || !data) {
      setError(
        insertError ? catalogError(insertError, "save") : "Quick pick could not be added.",
      );
      return;
    }

    setCatalog((current) =>
      sortByName([
        ...current,
        {
          id: data.id,
          name: data.name,
          defaultAmountUnit: data.default_amount_unit,
          defaultConcentrationUnit: data.default_concentration_unit,
          updatedAt: data.updated_at,
        },
      ]),
    );
    setNewName("");
    setNewAmountUnit("");
    setNewConcentrationUnit("");
    setSuccess(`${data.name} added.`);
  };

  return (
    <Card className="w-full rounded-md shadow-none">
      <CardHeader>
        <CardTitle className="text-xl">Star Treatment</CardTitle>
        <CardDescription>
          Name and optional amount and concentration unit suggestions.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <CatalogMessages error={error} success={success} />
        {!loadError && catalog.length === 0 && (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No Star Treatment quick picks are configured.
          </p>
        )}
        <div className="divide-y rounded-md border">
          {catalog.map((item) => (
            <StarCatalogEditor
              key={item.id}
              item={item}
              disabled={pending !== null || Boolean(loadError)}
              pendingAction={pending}
              onPending={setPending}
              onError={(message) => { setError(message); setSuccess(""); }}
              onSuccess={(message) => { setError(""); setSuccess(message); }}
              onSaved={(saved) =>
                setCatalog((current) =>
                  sortByName(current.map((candidate) => candidate.id === saved.id ? saved : candidate)),
                )
              }
              onDeleted={(id) => setCatalog((current) => current.filter((candidate) => candidate.id !== id))}
            />
          ))}
        </div>

        <form className="grid gap-3 border-t pt-5" onSubmit={addItem} noValidate>
          <h3 className="text-sm font-semibold">Add Star Treatment quick pick</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="new-star-name">Name</Label>
              <Input id="new-star-name" className="min-h-11" maxLength={100} value={newName} disabled={pending !== null || Boolean(loadError)} onChange={(event) => setNewName(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-star-amount-unit">Amount unit</Label>
              <Input id="new-star-amount-unit" className="min-h-11" maxLength={50} placeholder="Optional" value={newAmountUnit} disabled={pending !== null || Boolean(loadError)} onChange={(event) => setNewAmountUnit(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-star-concentration-unit">Concentration unit</Label>
              <Input id="new-star-concentration-unit" className="min-h-11" maxLength={50} placeholder="Optional" value={newConcentrationUnit} disabled={pending !== null || Boolean(loadError)} onChange={(event) => setNewConcentrationUnit(event.target.value)} />
            </div>
          </div>
          <Button type="submit" className="min-h-11 w-fit" disabled={pending !== null || Boolean(loadError)}>
            <Plus aria-hidden="true" />
            {pending === "create" ? "Adding…" : "Add quick pick"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function StarCatalogEditor({
  item,
  disabled,
  pendingAction,
  onPending,
  onError,
  onSuccess,
  onSaved,
  onDeleted,
}: {
  item: StarCatalogRow;
  disabled: boolean;
  pendingAction: string | null;
  onPending: (value: string | null) => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  onSaved: (item: StarCatalogRow) => void;
  onDeleted: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [amountUnit, setAmountUnit] = useState(item.defaultAmountUnit ?? "");
  const [concentrationUnit, setConcentrationUnit] = useState(item.defaultConcentrationUnit ?? "");
  const isSaving = pendingAction === `star-save-${item.id}`;
  const isDeleting = pendingAction === `star-delete-${item.id}`;

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError =
      requiredValue(name, "Name", 100) ??
      optionalValue(amountUnit, "Default amount unit") ??
      optionalValue(concentrationUnit, "Default concentration unit");
    if (validationError) {
      onError(validationError);
      return;
    }

    onPending(`star-save-${item.id}`);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("star_treatment_catalog")
      .update({
        name: normalizeSnapshot(name),
        default_amount_unit: normalizeSnapshot(amountUnit) || null,
        default_concentration_unit: normalizeSnapshot(concentrationUnit) || null,
      })
      .eq("id", item.id)
      .eq("updated_at", item.updatedAt)
      .select("id, name, default_amount_unit, default_concentration_unit, updated_at")
      .maybeSingle();
    onPending(null);

    if (error || !data) {
      onError(
        error
          ? catalogError(error, "save")
          : "This quick pick changed elsewhere. Refresh before saving again.",
      );
      return;
    }

    const saved = {
      id: data.id,
      name: data.name,
      defaultAmountUnit: data.default_amount_unit,
      defaultConcentrationUnit: data.default_concentration_unit,
      updatedAt: data.updated_at,
    };
    setName(saved.name);
    setAmountUnit(saved.defaultAmountUnit ?? "");
    setConcentrationUnit(saved.defaultConcentrationUnit ?? "");
    setEditing(false);
    onSaved(saved);
    onSuccess(`${saved.name} saved.`);
  };

  const remove = async () => {
    if (!window.confirm(`Delete the ${item.name} quick pick?`)) return;

    onPending(`star-delete-${item.id}`);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("star_treatment_catalog")
      .delete()
      .eq("id", item.id)
      .eq("updated_at", item.updatedAt)
      .select("id")
      .maybeSingle();
    onPending(null);

    if (error || !data) {
      onError(
        error
          ? catalogError(error, "delete")
          : "This quick pick changed elsewhere. Refresh before deleting it.",
      );
      return;
    }

    onDeleted(item.id);
    onSuccess(`${item.name} deleted.`);
  };

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-medium">{item.name}</p>
          <p className="text-xs text-muted-foreground">
            Amount: {item.defaultAmountUnit ?? "No default"}; concentration: {item.defaultConcentrationUnit ?? "No default"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="min-h-11" disabled={disabled} onClick={() => setEditing(true)}><Pencil aria-hidden="true" /> Edit</Button>
          <Button type="button" variant="outline" className="min-h-11" disabled={disabled} onClick={remove}><Trash2 aria-hidden="true" /> {isDeleting ? "Deleting…" : "Delete"}</Button>
        </div>
      </div>
    );
  }

  return (
    <form className="grid gap-3 p-4" onSubmit={save} noValidate aria-busy={isSaving}>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor={`star-${item.id}-name`}>Name</Label>
          <Input id={`star-${item.id}-name`} className="min-h-11" maxLength={100} value={name} disabled={disabled} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`star-${item.id}-amount-unit`}>Amount unit</Label>
          <Input id={`star-${item.id}-amount-unit`} className="min-h-11" maxLength={50} placeholder="No default" value={amountUnit} disabled={disabled} onChange={(event) => setAmountUnit(event.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`star-${item.id}-concentration-unit`}>Concentration unit</Label>
          <Input id={`star-${item.id}-concentration-unit`} className="min-h-11" maxLength={50} placeholder="No default" value={concentrationUnit} disabled={disabled} onChange={(event) => setConcentrationUnit(event.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="min-h-11" disabled={disabled}><Save aria-hidden="true" /> {isSaving ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="ghost" className="min-h-11" disabled={disabled} onClick={() => { setName(item.name); setAmountUnit(item.defaultAmountUnit ?? ""); setConcentrationUnit(item.defaultConcentrationUnit ?? ""); setEditing(false); }}><X aria-hidden="true" /> Cancel</Button>
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