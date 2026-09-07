// Seed list of species currently in the lab — mirrors docs/platform-architecture.md §1.
// Scientific names for urchin/sand dollar are the common regional species as a starting
// point; confirm with staff and adjust via the admin reference-data UI once it exists.

export type SpeciesCategory = "star" | "urchin" | "abalone" | "other";

export interface SpeciesConfig {
  commonName: string;
  scientificName: string;
  category: SpeciesCategory;
}

export const SPECIES: readonly SpeciesConfig[] = [
  {
    commonName: "Sunflower star",
    scientificName: "Pycnopodia helianthoides",
    category: "star",
  },
  {
    commonName: "Bat star",
    scientificName: "Patiria miniata",
    category: "star",
  },
  {
    commonName: "Giant spined star",
    scientificName: "Pisaster giganteus",
    category: "star",
  },
  {
    commonName: "Purple urchin",
    scientificName: "Strongylocentrotus purpuratus",
    category: "urchin",
  },
  {
    commonName: "Sand dollar",
    scientificName: "Dendraster excentricus",
    category: "other",
  },
  {
    commonName: "Abalone",
    scientificName: "Haliotis spp.",
    category: "abalone",
  },
] as const;
