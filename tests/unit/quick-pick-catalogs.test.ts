import assert from "node:assert/strict";
import test from "node:test";

import {
  attachedCatalogId,
  getStarTreatmentMeasurementErrors,
  resolveStarTreatmentCatalogItem,
  selectChemicalCatalogItem,
  selectStarTreatmentCatalogItem,
  type ChemicalAdditionCatalogItem,
  type StarTreatmentCatalogItem,
} from "@/components/daily-operations/quick-pick-catalogs";

const chemical: ChemicalAdditionCatalogItem = {
  id: 1,
  name: "C-Balance",
  defaultUnit: "mL",
};
const probiotics: StarTreatmentCatalogItem = {
  id: 2,
  name: "Probiotics",
  defaultAmountUnit: "mL",
  defaultConcentrationUnit: "ppm",
};
const reefDip: StarTreatmentCatalogItem = {
  id: 3,
  name: "Reef Dip",
  defaultAmountUnit: null,
  defaultConcentrationUnit: null,
};

test("catalog selection suggests the current snapshot values", () => {
  assert.deepEqual(selectChemicalCatalogItem(chemical), {
    catalogId: 1,
    name: "C-Balance",
    unit: "mL",
  });
  assert.deepEqual(selectStarTreatmentCatalogItem(probiotics), {
    catalogId: 2,
    name: "Probiotics",
    amountUnit: "mL",
    concentrationUnit: "ppm",
  });
});

test("editing a selected name detaches its catalog id", () => {
  assert.equal(
    attachedCatalogId({ catalogId: chemical.id, name: "C-Balance Plus" }, [chemical]),
    null,
  );
  assert.equal(
    attachedCatalogId({ catalogId: chemical.id, name: "  C-Balance  " }, [chemical]),
    chemical.id,
  );
});

test("free text has no catalog id", () => {
  assert.equal(attachedCatalogId({ catalogId: null, name: "Custom buffer" }, [chemical]), null);
});

test("nullable star defaults and switching clear stale catalog suggestions", () => {
  const initial = selectStarTreatmentCatalogItem(probiotics);
  assert.equal(initial.amountUnit, "mL");
  assert.equal(initial.concentrationUnit, "ppm");

  assert.deepEqual(selectStarTreatmentCatalogItem(reefDip), {
    catalogId: reefDip.id,
    name: reefDip.name,
    amountUnit: "",
    concentrationUnit: "",
  });
  assert.deepEqual(selectStarTreatmentCatalogItem(null, "Other treatment"), {
    catalogId: null,
    name: "Other treatment",
    amountUnit: "",
    concentrationUnit: "",
  });
  assert.deepEqual(selectStarTreatmentCatalogItem(probiotics), initial);
});

test("existing star snapshots use a catalog only while its name still matches", () => {
  assert.equal(resolveStarTreatmentCatalogItem(probiotics.id, "probiotics", [probiotics]), probiotics);
  assert.equal(
    resolveStarTreatmentCatalogItem(probiotics.id, "Former probiotic name", [probiotics]),
    null,
  );
  assert.equal(resolveStarTreatmentCatalogItem(99, "Legacy treatment", [probiotics]), null);
});

test("empty measurements are valid only for Reef Dip", () => {
  assert.deepEqual(
    getStarTreatmentMeasurementErrors({
      treatmentName: "Reef Dip",
      amount: "",
      amountUnit: "",
      concentration: "",
      concentrationUnit: "",
    }),
    {},
  );
  assert.deepEqual(
    getStarTreatmentMeasurementErrors({
      treatmentName: "Probiotics",
      amount: "",
      amountUnit: "",
      concentration: "",
      concentrationUnit: "",
    }),
    { amount: "Enter an amount or concentration" },
  );
});

test("supplied Reef Dip values still require their units", () => {
  assert.deepEqual(
    getStarTreatmentMeasurementErrors({
      treatmentName: "reef_dip",
      amount: "1",
      amountUnit: "",
      concentration: "2",
      concentrationUnit: "",
    }),
    {
      amountUnit: "Enter an amount unit",
      concentrationUnit: "Enter a concentration unit",
    },
  );
});