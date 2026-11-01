import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIseauData,
  compareIds,
  isCurrent,
  starsFor,
  starData,
  targetFor,
  type HealthRecord,
  type IseauSources,
  type Place,
  type TemperatureRecord,
  type WaterRecord,
} from "@/lib/iseau/data";

const NOW = Date.parse("2026-10-31T12:00:00.000Z");
const FIRST_PLACE: Place = { tankId: 1, tank: "Tank 1", systemId: 10, system: "System 1" };
const SECOND_PLACE: Place = { tankId: 2, tank: "Tank 2", systemId: 20, system: "System 2" };
const daysAgo = (days: number) => NOW - days * 24 * 60 * 60 * 1000;

const health = (
  id: number,
  animalId: number,
  days: number,
  severity: number,
  place: Place,
): HealthRecord => ({
  id,
  animalId,
  at: daysAgo(days),
  severity,
  issues: ["lesion"],
  notes: "",
  photo: false,
  by: "Tech",
  place,
});

function sources(overrides: Partial<IseauSources> = {}): IseauSources {
  const water = (id: number, days: number, place: Place): WaterRecord => ({
    id,
    at: daysAgo(days),
    systemId: place.systemId,
    system: place.system,
    by: "Tech",
    values: {
      ph: 8,
      salinity: null,
      magnesium: null,
      ammonia: null,
      alkalinity: null,
      calcium: null,
      phosphate: null,
      nitrate: null,
      nitrite: null,
    },
  });
  const temperature = (id: number, days: number, place: Place): TemperatureRecord => ({
    id,
    at: daysAgo(days),
    systemId: place.systemId,
    system: place.system,
    by: "Tech",
    celsius: 12,
  });
  return {
    now: NOW,
    systems: [{ id: 10, name: "System 1" }, { id: 20, name: "System 2" }],
    animals: [
      { id: 101, name: "Past patient", location: FIRST_PLACE, updatedAt: new Date(daysAgo(90)).toISOString() },
      { id: 202, name: "Current patient", location: SECOND_PLACE, updatedAt: new Date(daysAgo(10)).toISOString() },
      { id: 303, name: "Healthy star", location: FIRST_PLACE, updatedAt: new Date(daysAgo(1)).toISOString() },
    ],
    locationSnapshots: [
      { animalId: 202, at: daysAgo(20), place: FIRST_PLACE },
      { animalId: 202, at: daysAgo(10), place: SECOND_PLACE },
    ],
    health: [
      health(1, 101, 90, 2, FIRST_PLACE),
      health(2, 202, 20, 3, FIRST_PLACE),
      health(5, 202, 10, 2, SECOND_PLACE),
      health(3, 202, 5, 1, SECOND_PLACE),
      health(4, 303, 1, 1, FIRST_PLACE),
    ],
    treatments: [],
    feedings: [],
    water: [
      water(1, 50, FIRST_PLACE),
      water(2, 5, FIRST_PLACE),
      water(3, 4, SECOND_PLACE),
    ],
    temperatures: [
      temperature(1, 5, FIRST_PLACE),
      temperature(2, 4, SECOND_PLACE),
    ],
    targets: [
      { systemId: null, parameter: "ph", min: 7.5, max: 8.5 },
      { systemId: 20, parameter: "ph", min: 7.8, max: 8.2 },
    ],
    treatmentsAvailable: true,
    ...overrides,
  };
}

test("patient eligibility includes an old severity 2+ observation and excludes healthy-only stars", () => {
  const data = buildIseauData(sources());

  assert.deepEqual(data.stars.map((star) => star.id), [202, 101]);
  assert.equal(isCurrent(data.stars.find((star) => star.id === 101)!, NOW), false);
  assert.equal(isCurrent(data.stars.find((star) => star.id === 202)!, NOW), true);
});

test("a recent severity 2 observation keeps a patient current after a severity 1 follow-up", () => {
  const data = buildIseauData(sources());
  const currentPatient = data.stars.find((star) => star.id === 202)!;

  assert.equal(currentPatient.health[0].severity, 1);
  assert.equal(isCurrent(currentPatient, NOW), true);
});

test("a healthy follow-up does not make an old patient current", () => {
  const data = buildIseauData(sources({
    health: [health(1, 101, 90, 2, FIRST_PLACE), health(2, 101, 1, 1, FIRST_PLACE)],
  }));

  assert.equal(isCurrent(data.stars[0], NOW), false);
  assert.deepEqual(starsFor(data, "current", "all"), []);
  assert.deepEqual(starsFor(data, "past", "all").map((star) => star.id), [101]);
});

test("current status includes exactly 14 days ago but excludes older and future sightings", () => {
  const observation = health(1, 101, 14, 2, FIRST_PLACE);
  const patient = (at: number) => buildIseauData(sources({
    health: [{ ...observation, at }],
  })).stars[0];

  assert.equal(isCurrent(patient(observation.at), NOW), true);
  assert.equal(isCurrent(patient(observation.at - 1), NOW), false);
  assert.equal(isCurrent(patient(NOW), NOW), true);
  assert.equal(isCurrent(patient(NOW + 1), NOW), false);
});

test("water and temperature readings follow the tank snapshot for each reading time", () => {
  const data = buildIseauData(sources());
  const currentPatient = data.stars.find((star) => star.id === 202)!;
  const readings = starData(currentPatient, 30, data);

  assert.deepEqual(readings.water.map((reading) => reading.id), [3]);
  assert.deepEqual(readings.temperatures.map((reading) => reading.id), [2]);
});

test("system-specific targets override the lab-wide target while other systems inherit it", () => {
  const data = buildIseauData(sources());

  assert.deepEqual(targetFor(10, "ph", data), { min: 7.5, max: 8.5 });
  assert.deepEqual(targetFor(20, "ph", data), { min: 7.8, max: 8.2 });
  assert.equal(targetFor(10, "ammonia", data), null);
});

test("patient lists split by recency and compare ids discard unknowns and duplicates", () => {
  const data = buildIseauData(sources());

  assert.deepEqual(starsFor(data, "current", "all").map((star) => star.id), [202]);
  assert.deepEqual(starsFor(data, "past", "all").map((star) => star.id), [101]);
  assert.deepEqual(compareIds("101,101,nope,202", data), ["101", "202"]);
  assert.deepEqual(compareIds(null, data), ["202", "101"]);
});
