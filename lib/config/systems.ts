// Single source of truth for the 8 systems — mirrors docs/lab-operations-plan.md §2.
// Used to seed the `systems`/`tanks` tables and to drive system pickers in forms.

export type SystemCategory =
  | "quarantine"
  | "grow_out"
  | "larviculture"
  | "feed_production";

export interface SystemConfig {
  slug: string;
  name: string;
  category: SystemCategory;
  layoutNotes: string;
  hasAnimals: boolean;
  // True only for systems with a confirmed working Apex pH probe today (Graham,
  // Wholey). False means "not yet confirmed", not "definitely no probe" — see
  // docs/lab-operations-plan.md §4 open questions.
  apexPhProbeConfirmed: boolean;
}

export const SYSTEMS: readonly SystemConfig[] = [
  {
    slug: "indoor-quarantine",
    name: "Indoor Quarantine",
    category: "quarantine",
    layoutNotes: "New/at-risk animal holding",
    hasAnimals: true,
    apexPhProbeConfirmed: false,
  },
  {
    slug: "outdoor-quarantine",
    name: "Outdoor Quarantine",
    category: "quarantine",
    layoutNotes: "New/at-risk animal holding",
    hasAnimals: true,
    apexPhProbeConfirmed: false,
  },
  {
    slug: "graham",
    name: "Graham",
    category: "grow_out",
    layoutNotes: "Upper + lower shelf plus a separate cone-bottom tank",
    hasAnimals: true,
    apexPhProbeConfirmed: true,
  },
  {
    slug: "wholey",
    name: "Wholey",
    category: "grow_out",
    layoutNotes: "Upper + lower shelf plus a separate cone-bottom tank",
    hasAnimals: true,
    apexPhProbeConfirmed: true,
  },
  {
    slug: "yum-yum",
    name: "Yum Yum",
    category: "grow_out",
    layoutNotes: "Single large urchin tank",
    hasAnimals: true,
    apexPhProbeConfirmed: false,
  },
  {
    slug: "snack-shack",
    name: "Snack Shack",
    category: "grow_out",
    layoutNotes: "Single large abalone tank + 2 cone-bottoms",
    hasAnimals: true,
    apexPhProbeConfirmed: false,
  },
  {
    slug: "larval",
    name: "Larval",
    category: "larviculture",
    layoutNotes: "8 paired cone-bottom tanks, tracked/logged as cohorts per pair",
    hasAnimals: true,
    apexPhProbeConfirmed: false,
  },
  {
    slug: "micro-algae",
    name: "Micro-Algae",
    category: "feed_production",
    layoutNotes: "Feeds the Larval system; no animals of its own",
    hasAnimals: false,
    apexPhProbeConfirmed: false,
  },
] as const;
