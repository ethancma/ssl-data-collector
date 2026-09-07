import { SYSTEMS, type SystemConfig } from "@/lib/config/systems";

// Thin OOP wrapper around a system's config row — behavior only, no data access.
export class System {
  private constructor(private readonly config: SystemConfig) {}

  static all(): System[] {
    return SYSTEMS.map((config) => new System(config));
  }

  static bySlug(slug: string): System | undefined {
    const config = SYSTEMS.find((s) => s.slug === slug);
    return config ? new System(config) : undefined;
  }

  get slug() {
    return this.config.slug;
  }

  get name() {
    return this.config.name;
  }

  get category() {
    return this.config.category;
  }

  get layoutNotes() {
    return this.config.layoutNotes;
  }

  hasAnimals() {
    return this.config.hasAnimals;
  }

  isFeedProduction() {
    return this.config.category === "feed_production";
  }

  isLarviculture() {
    return this.config.category === "larviculture";
  }

  hasConfirmedApexProbe() {
    return this.config.apexPhProbeConfirmed;
  }
}
