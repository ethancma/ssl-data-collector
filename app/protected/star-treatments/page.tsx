import Link from "next/link";
import { notFound } from "next/navigation";

import { StarTreatmentRecord } from "@/components/star-treatments/star-treatment-record";
import { getPacificDateString } from "@/lib/pacific-date-time";
import { SELECT_CLASS } from "@/components/forms/form-classes";
import { Button } from "@/components/ui/button";
import { getCurrentProfile } from "@/lib/supabase/current-profile";

import { loadStarTreatmentsData } from "./data";
import { parseStarTreatmentFilters, type StarTreatmentSearchParams } from "./derivations";

type SearchParams = Promise<StarTreatmentSearchParams>;

export default async function StarTreatmentsPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await getCurrentProfile();
  const canView =
    profile?.status === "active" &&
    ["admin", "technician", "volunteer"].includes(profile.role);

  if (!canView) notFound();

  const params = await searchParams;
  const today = getPacificDateString();
  const filters = parseStarTreatmentFilters(params, today);
  const { from, to, animalFilter, treatmentFilter } = filters;
  const { data, starChoicesError, catalogError, error } = await loadStarTreatmentsData(filters);
  const { catalog, stars, records } = data;

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Daily Operations</p>
          <h1 className="text-3xl font-semibold tracking-tight">Star treatments</h1>
        </div>
        <Button asChild variant="outline">
          <Link href="/protected/daily-operations?type=star-treatment">
            Log star treatment
          </Link>
        </Button>
      </header>

      {starChoicesError && (
        <p className="text-sm text-red-500" role="alert">
          Star choices could not be loaded: {starChoicesError}
        </p>
      )}

      {catalogError !== undefined && (
        <p className="text-sm text-red-500" role="alert">
          Treatment quick picks could not be loaded. Existing snapshots remain editable
          as Other.
        </p>
      )}

      <form method="get" className="grid gap-4 rounded-md border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-2">
          <label htmlFor="treatments-from" className="text-sm font-medium">
            From
          </label>
          <input
            id="treatments-from"
            name="from"
            type="date"
            defaultValue={from}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="treatments-to" className="text-sm font-medium">
            To
          </label>
          <input
            id="treatments-to"
            name="to"
            type="date"
            defaultValue={to}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="treatments-animal" className="text-sm font-medium">
            Star
          </label>
          <select
            id="treatments-animal"
            name="animal"
            defaultValue={animalFilter}
            className={SELECT_CLASS}
          >
            <option value="">All stars</option>
            {(stars ?? []).map((star) => (
              <option key={star.id} value={star.id}>
                {star.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <label htmlFor="treatments-type" className="text-sm font-medium">
            Treatment type
          </label>
          <select
            id="treatments-type"
            name="treatment"
            defaultValue={treatmentFilter}
            className={SELECT_CLASS}
          >
            <option value="">All treatments</option>
            <option value="probiotics">Probiotics</option>
            <option value="reef_dip">Reef dip</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-3 sm:col-span-2 lg:col-span-4">
          <Button type="submit">
            Apply filters
          </Button>
          <Button asChild variant="ghost">
            <Link href="/protected/star-treatments">Reset</Link>
          </Button>
        </div>
      </form>

      {error !== undefined ? (
        <p className="text-sm text-red-500" role="alert">
          Treatments could not be loaded: {error}
        </p>
      ) : records.length === 0 ? (
        <p className="rounded-md border p-6 text-sm text-muted-foreground">
          No star treatments match these filters.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {records.map((record) => (
            <StarTreatmentRecord
              key={record.id}
              treatment={record}
              canEdit={
                profile.role === "admin" ||
                profile.role === "technician" ||
                record.recordedBy === profile.id
              }
              canDelete={profile.role === "admin" || profile.role === "technician"}
              catalogs={catalog}
            />
          ))}
        </div>
      )}
    </div>
  );
}