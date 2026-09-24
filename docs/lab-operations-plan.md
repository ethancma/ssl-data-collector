# SSL Data Collection Tool — Lab Operations Plan

> Covers the lab itself: the 8 systems, testing/feeding cadence, Apex probes, the
> people who'll use the tool, and the historical data migration. For the technical
> platform (stack, schema, roles, roadmap), see
> [platform-architecture.md](platform-architecture.md).

## 1. Project Goal

Give lab techs, volunteers, and researchers one easy, fast web tool to log husbandry
and water-quality data across all systems, so SSL can monitor lab and star health over
time — correlating sightings, water chemistry, feeding, and maintenance events with
health outcomes and SSWD symptom onset — and produce trend charts plus clean exports
for conservation research/reporting. Data entry happens only through this platform
going forward; legacy Google Sheets and paper logs are migrated in once, not maintained
in parallel.

## 2. Systems Inventory

Each system has its own water sump and is tested for water quality once a week.
Chemical additions, feeding, and AM/PM checks are tracked per system as described in
the platform architecture's data model.

| System | Category | Layout notes | Houses animals? |
|---|---|---|---|
| Indoor Quarantine | Quarantine | New/at-risk animal holding | Yes |
| Outdoor Quarantine | Quarantine | New/at-risk animal holding | Yes |
| Graham | Grow-out | Upper + lower shelf plus a separate cone-bottom tank | Yes |
| Wholey | Grow-out | Upper + lower shelf plus a separate cone-bottom tank | Yes |
| Yum Yum | Grow-out | Single large urchin tank | Yes |
| Snack Shack | Grow-out | Single large abalone tank + 2 cone-bottoms | Yes |
| Larval | Larviculture | 8 paired cone-bottom tanks, tracked as cohorts | Yes |
| Micro-Algae | Feed production | Feeds the Larval system; no animals of its own | No |

Confirmed spelling: **Snack Shack**.

Individual animals (stars, urchins, abalone) are identified by a **nickname** (e.g.,
"Sitara", "Titan"), not a numbered tag — labels on the physical tubs identify the
tank, and each animal within a tub keeps its own name. Multiple named animals can
share one tub; every feeding, consumption-check, and health-observation entry is
logged per individual animal, never bulk-logged for the tub, so one star going off
its food or developing a symptom doesn't get lost among tankmates. Names must be
unique lab-wide (not just within a tank). Whether a name is ever reused after an
animal dies or is transferred out is still open (see §7).

The 8 paired larval cone-bottom tanks are logged **per pair**, not per individual
cone-bottom — a pair is the smallest unit for feeding/health/water-quality entries,
matching how they're actually managed as cohorts.

The Micro-Algae system gets its own production tracking, not just an implicit input
to Larval feeding logs: a density/turbidity reading, harvest volume (amount fed out
to Larval), and culture health/condition notes (contamination, color, smell), each
timestamped and attributable like the other logs.

## 3. Data Collection Cadence

- **AM/PM checks** — daily, every system: water running in all tubes, sump/system
  temperature, quick visual star/animal health scan. If a check turns up a problem,
  the tech can flag it and open a linked health observation — but that observation
  doesn't have to be completed on the spot; it's saved as a follow-up and stays
  flagged on the check record until filled in (no separate dashboard nagging beyond
  that flag).
- **Feeding** — cadence is roughly every other day but actually **varies by
  system/species/life stage**; the exact per-system schedule still needs to be
  confirmed with staff before it's encoded (see §7). Logged per individual named
  animal (food type/amount), plus a same-day follow-up on whether it was eaten,
  rolled into the PM check, also per individual animal.
- **Water quality testing** — **weekly per system**, testing the sump: pH, magnesium,
  ammonia, alkalinity, calcium, phosphate, nitrate, nitrite (nitrate in ppm, nitrite in
  ppb — a different unit). Target/safe ranges per parameter exist but
  still need to be gathered from staff and encoded for inline validation (see §7).
- **Chemical additions** — as-needed per system (C balance, buffers, etc.), logged
  whenever dosed.
- **Health observations** — logged whenever a sighting/issue occurs (arm drops, spine
  drops, lesions, arm curling, flattening, other), against the individual animal.
  Severity uses a 3-level scale (exact labels/thresholds TBD, see §7). A photo is
  always mandatory for arm drops, spine drops, and lesions; for other issue types,
  whether a photo is required depends on the severity level once that scale is
  defined.
- **Maintenance** — recurring filter changes and sump flushes, on an interval that's
  configurable **per system** (not one shared interval per task type across all 8
  systems), with due/overdue tracking. Overdue-maintenance email digests go to
  admins/lead techs only, not all techs/volunteers.

## 4. Water Quality Testing & Apex Probes

Every system's sump has a [Neptune Apex](https://www.neptunesystems.com/probes/)
pH probe, so pH can be continuously monitored electronically. Magnesium, ammonia,
alkalinity, calcium, phosphate, nitrate, and nitrite are always tested manually (no probes for those).

- **Confirmed so far**: Graham and Wholey have working Apex pH probes; coverage for
  the remaining systems (Indoor/Outdoor Quarantine, Yum Yum, Snack Shack, Larval)
  still needs confirming with staff.
- **MVP**: all six parameters are entered manually once a week, same as today — the
  weekly reading form just records whatever the Apex display shows for pH at test
  time, tagged `ph_source = apex_probe` vs. a hand-tested `manual` value for systems
  without a working probe.
- **Future option**: pull continuous pH directly from Apex Fusion's API so pH gets a
  real trend line between weekly tests, instead of one point a week. Stays deferred
  until after the manual-entry platform is validated — confirmed decision, even with
  only 2 of 8 systems currently probed.

## 5. Historical Data Migration

Two source types need to be brought in, once, without disrupting live use of the
platform:

1. **Google Sheets** (existing digital logs, likely water quality + feeding) —
   export to CSV, build a one-time column-mapping import tool (admin-only) that maps
   sheet columns to the matching table (`water_quality_readings`, `feeding_logs`,
   etc.) and tags every imported row `data_source = import`. Avoids
   re-typing years of digital data by hand.
2. **Paper logs** (feeding, water quality, and likely AM/PM checks/maintenance) —
   these must be manually re-keyed by staff. Rather than the same one-record-at-a-time
   form used for live daily entry, provide a grid/spreadsheet-style backfill mode that
   lets someone enter a whole paper sheet (multiple past dates x parameters) in one
   sitting, tagged `data_source = paper_backfill`. Optionally allow attaching a photo
   of the original paper sheet for provenance/audit.

Both paths keep event time (when the test/feeding actually happened) separate from
entry time (when it was typed into the platform), so trend charts reflect real
history rather than migration timing.

**Before migration starts**, inventory exactly which systems/date ranges exist in
Sheets vs. paper vs. not recorded at all, so effort isn't spent building import
tooling for data that doesn't actually exist.

## 6. People, Roles & Rollout

- **Lab techs** — day-to-day data entry (AM/PM checks, feeding, water quality, health
  observations), Technician role.
- **Volunteers** — same lab-wide access as Technicians (no per-system restriction
  needed), but get their own **Volunteer** role rather than sharing Technician,
  so paid-staff vs. volunteer entries can be distinguished. Exact permission
  differences (if any) between Volunteer and Technician are still TBD (see §7).
- **PI/researchers** — read-only Viewer access for trend charts and exports.
- **Admin(s)** — lab manager/lead tech; approves new sign-ins, manages
  systems/tanks/species reference data, runs historical imports, receives
  overdue-maintenance alerts.

**Rollout plan:**
1. Seed real systems/tanks/species data for all 8 systems.
2. Pilot with a small subset (e.g., one or two systems) for a week to catch workflow
   friction before full rollout.
3. Run the historical import (Sheets) and schedule/assign paper backfill entry.
4. Train techs/volunteers hands-on at the tank stations, not just in a meeting —
   forms should be usable after a two-minute walkthrough given the mixed experience
   levels.
5. Post a QR code/deep link at each system's station so a phone/tablet opens directly
   to that system's daily forms, cutting navigation time for high-frequency users —
   confirmed as part of rollout, not just optional.
6. Full rollout across all systems; retire paper/Sheets logging entirely.

## 7. Trends & Monitoring — Primary Use Case

The single most important trend view, the one meant to prove the tool's value first:
a **per-system overlay chart** with water-chemistry parameter lines (pH, magnesium,
ammonia, alkalinity, calcium, phosphate, nitrate, nitrite) plotted against time, with health-observation
events marked directly on the same timeline (e.g., markers at each observation's
`observed_at`, colored/shaped by issue type or severity). The goal is to visually spot
whether chemistry drift precedes SSWD symptom onset or other health issues, per
system. Imported/backfilled data is not visually distinguished from live data on these
charts by default — all `data_source` values are shown together on the same view.

Export needs are simple for now: plain CSV is sufficient for external stats
(R/Python/Excel); no standardized format (e.g., Darwin Core) is required by a partner
or grant at this time.

## 8. Open Questions / Further Considerations

1. **Feeding cadence matrix** — confirm the actual per-system/species/life-stage
   feeding schedule with staff so it can be encoded (currently known only as "roughly
   every other day, varies").
2. **Water quality target ranges** — gather the actual per-parameter safe/target
   ranges (and confirm whether they vary by system/species) needed for inline
   validation.
3. **Health observation severity scale** — define the exact 3-level scale (labels and
   criteria), and confirm which severity level(s) make a photo mandatory for issue
   types beyond arm drop/spine drop/lesion (which always require one).
4. **Animal name reuse** — decide whether a nickname is ever reused after an animal
   dies or is transferred out, or retired permanently.
5. **Volunteer role permissions** — decide what, if anything, differs between the new
   Volunteer role and Technician (e.g., edit/delete rights, export access) — both get
   lab-wide system access either way.
6. How far back does usable historical data go in Google Sheets vs. paper, and which
   systems/parameters are actually covered? Needed to scope the migration effort.
7. Confirm remaining Apex pH probe coverage (Indoor/Outdoor Quarantine, Yum Yum,
   Snack Shack, Larval) with staff — Graham and Wholey are confirmed.
8. Who owns/assigns the paper-backfill data entry work, and is there a target
   deadline (e.g., before a grant reporting cycle)?
