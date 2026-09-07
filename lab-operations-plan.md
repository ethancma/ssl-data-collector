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

*Confirm exact spelling — "Snack Shack" vs. "Snack Snack" — with lab staff before data
entry (see open questions).*

## 3. Data Collection Cadence

- **AM/PM checks** — daily, every system: water running in all tubes, sump/system
  temperature, quick visual star/animal health scan.
- **Feeding** — every other day: krill, brine shrimp, abalone, urchin (purple, sometimes
  white painted), microalgae — varies by species/life stage — plus a same-day
  follow-up on whether food was eaten.
- **Water quality testing** — **weekly per system**, testing the sump: pH, magnesium,
  ammonia, alkalinity, calcium, phosphate.
- **Chemical additions** — as-needed per system (C balance, buffers, etc.), logged
  whenever dosed.
- **Health observations** — logged whenever a sighting/issue occurs (arm drops, spine
  drops, lesions, arm curling, flattening, other), with a required photo.
- **Maintenance** — recurring filter changes and sump flushes per system, on a
  configurable interval with due/overdue tracking.

## 4. Water Quality Testing & Apex Probes

Every system's sump has a [Neptune Apex](https://www.neptunesystems.com/probes/)
pH probe, so pH can be continuously monitored electronically. Magnesium, ammonia,
alkalinity, calcium, and phosphate are always tested manually (no probes for those).

- **MVP**: all six parameters are entered manually once a week, same as today — the
  weekly reading form just records whatever the Apex display shows for pH at test
  time, tagged `ph_source = apex_probe` vs. a hand-tested `manual` value for systems
  without a working probe.
- **Future option**: pull continuous pH directly from Apex Fusion's API so pH gets a
  real trend line between weekly tests, instead of one point a week. Deferred until
  after the manual-entry platform is validated (see open questions for prioritization).

## 5. Historical Data Migration

Two source types need to be brought in, once, without disrupting live use of the
platform:

1. **Google Sheets** (existing digital logs, likely water quality + feeding) —
   export to CSV, build a one-time column-mapping import tool (admin-only) that maps
   sheet columns to the matching table (`water_quality_readings`, `feeding_logs`,
   etc.) and tags every imported row `data_source = historical_import`. Avoids
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

- **Lab techs** and **volunteers** — day-to-day data entry (AM/PM checks, feeding,
  water quality, health observations); both map to the platform's Technician role.
- **PI/researchers** — read-only Viewer access for trend charts and exports.
- **Admin(s)** — lab manager/lead tech; approves new sign-ins, manages
  systems/tanks/species reference data, runs historical imports.

**Rollout plan:**
1. Seed real systems/tanks/species data for all 8 systems.
2. Pilot with a small subset (e.g., one or two systems) for a week to catch workflow
   friction before full rollout.
3. Run the historical import (Sheets) and schedule/assign paper backfill entry.
4. Train techs/volunteers hands-on at the tank stations, not just in a meeting —
   forms should be usable after a two-minute walkthrough given the mixed experience
   levels.
5. Optional: post a QR code/deep link at each system's station so a phone/tablet opens
   directly to that system's daily forms, cutting navigation time for high-frequency
   users.
6. Full rollout across all systems; retire paper/Sheets logging entirely.

## 7. Open Questions / Further Considerations

1. Confirm exact system names/spelling with staff (e.g., "Snack Shack" vs.
   "Snack Snack") before seeding reference data.
2. How far back does usable historical data go in Google Sheets vs. paper, and which
   systems/parameters are actually covered? Needed to scope the migration effort.
3. Do all 8 systems have a working Apex pH probe today, or are some pH-tested
   manually only?
4. Who owns/assigns the paper-backfill data entry work, and is there a target
   deadline (e.g., before a grant reporting cycle)?
5. Should the Micro-Algae system get its own water-quality/health tracking beyond
   feeding the Larval system (e.g., algae density/health as its own metric)?
6. Is per-system volunteer restriction ever needed (e.g., a volunteer only
   trained/trusted on one system), or is lab-wide access always fine?
