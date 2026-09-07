import { SPECIES, type SpeciesConfig } from "@/lib/config/species";

// Thin OOP wrapper around a species' config row — behavior only, no data access.
export class Species {
  private constructor(private readonly config: SpeciesConfig) {}

  static all(): Species[] {
    return SPECIES.map((config) => new Species(config));
  }

  static byCommonName(commonName: string): Species | undefined {
    const config = SPECIES.find((s) => s.commonName === commonName);
    return config ? new Species(config) : undefined;
  }

  get commonName() {
    return this.config.commonName;
  }

  get scientificName() {
    return this.config.scientificName;
  }

  get category() {
    return this.config.category;
  }

  label() {
    return `${this.config.commonName} (${this.config.scientificName})`;
  }
}
