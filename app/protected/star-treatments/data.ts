import type { StarTreatmentCatalogItem } from "@/lib/daily-operations/quick-pick-catalogs";
import type { StarTreatmentRecordData } from "@/components/star-treatment-record";
import { createClient } from "@/lib/supabase/server";

import {
  deriveStarTreatmentCatalog,
  deriveStarTreatmentRecords,
  type StarTreatmentFilters,
} from "./derivations";

export type StarTreatmentLoadResult = {
  data: {
    catalog: StarTreatmentCatalogItem[];
    stars: { id: number; name: string }[] | null;
    records: StarTreatmentRecordData[];
  };
  starChoicesError: string | undefined;
  catalogError: string | undefined;
  error: string | undefined;
};

export async function loadStarTreatmentsData(
  filters: StarTreatmentFilters,
): Promise<StarTreatmentLoadResult> {
  const supabase = await createClient();

  const [starSpeciesResult, catalogResult] = await Promise.all([
    supabase
      .from("species")
      .select("id")
      .eq("category", "star")
      .order("common_name")
      .order("id"),
    // Retired rows remain available to records that already reference them.
    supabase
      .from("star_treatment_catalog")
      .select("id, name, default_amount_unit, default_concentration_unit, is_active")
      .order("name"),
  ]);
  const { data: starSpecies, error: starSpeciesError } = starSpeciesResult;
  const catalog = deriveStarTreatmentCatalog(catalogResult.data ?? []);
  const starSpeciesIds = (starSpecies ?? []).map((species) => species.id);
  const starsResult = starSpeciesIds.length
    ? await supabase
        .from("animals")
        .select("id, name")
        .eq("tracking_type", "individual")
        .in("species_id", starSpeciesIds)
        .order("name")
    : { data: [], error: null };
  const stars = starsResult.data;
  const starChoicesError =
    starSpeciesError?.message ??
    starsResult.error?.message ??
    (starSpeciesIds.length === 0 ? "No star species are configured." : undefined);

  let treatmentQuery = supabase
    .from("star_treatments")
    .select(
      "id, animal_id, tank_id, catalog_id, treatment_type, amount, unit, concentration, concentration_unit, notes, administered_at, recorded_by, data_source, entered_at, animal:animals!star_treatments_animal_id_fkey(id, name), tank:tanks!star_treatments_tank_id_fkey(id, name, system:systems!tanks_system_id_fkey(id, name))",
    )
    .gte("administered_at", filters.fromIso)
    .lt("administered_at", filters.toExclusiveIso)
    .order("administered_at", { ascending: false });

  if (filters.animalId !== undefined) {
    treatmentQuery = treatmentQuery.eq("animal_id", filters.animalId);
  }
  if (filters.treatmentType === "probiotics" || filters.treatmentType === "reef_dip") {
    treatmentQuery = treatmentQuery.eq("treatment_type", filters.treatmentType);
  } else if (filters.treatmentType === "other") {
    treatmentQuery = treatmentQuery.not("treatment_type", "in", '("probiotics","reef_dip")');
  }

  const { data: treatments, error } = await treatmentQuery;

  return {
    data: {
      catalog,
      stars,
      records: deriveStarTreatmentRecords(treatments ?? []),
    },
    starChoicesError,
    catalogError: catalogResult.error?.message,
    error: error?.message,
  };
}