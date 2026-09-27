# P2 Dashboard Performance

Measured 2026-09-26 for `/protected/home` and `/protected/systems` before the P2
dashboard changes. This note separates reproducible source measurements from live
browser measurements so unavailable metrics are not presented as estimates.

## Method

- Counted Supabase calls and inspected their projections, filters, ordering, and limits in
  the server loaders.
- Treated a `head: true` count as zero returned data rows even though PostgREST returns the
  exact count in response metadata.
- Inspected the Next 16 server/client boundaries and the serializable props crossing them.
- Live authenticated measurement was unavailable in this agent session: a local env file
  exists, but no command-execution or authenticated browser/network instrumentation was
  exposed. Reproducing the missing baseline requires an authenticated browser trace against
  the always-on server at `http://localhost:3000`, recording document/RSC response timing
  and transfer bytes, route JavaScript transfer bytes, Navigation/Resource Timing, and long
  tasks.

## Before

### Home

Source-level query count: **9** concurrent Supabase queries.

| Query | Projection/window | Returned rows |
| --- | --- | --- |
| `systems` | `id, name`; all systems | Data-dependent, uncapped |
| `daily_checks` | `system_id, check_type, checked_at`; last 36 hours | Data-dependent, uncapped |
| `feeding_logs` | `fed_at` plus tank `system_id`; last 36 hours | Data-dependent, uncapped |
| `water_quality_readings` | `system_id, tested_at, ph`; last 14 days | Data-dependent, uncapped |
| `chemical_additions` | `added_at`; last 36 hours | Data-dependent, uncapped |
| `health_observations` recent list | display fields; newest first | At most 5 |
| `health_observations` daily count source | `observed_at`; last 36 hours, then filtered to the Pacific day in application code | Data-dependent, uncapped |
| `animals` | `quantity`; active animals | Data-dependent, uncapped |
| `tanks` | exact count with `head: true` | 0 data rows |

The two health-observation requests overlap in table access but have different result
domains. The capped all-time newest-five response cannot derive the daily total when more
than five observations exist, while the 36-hour timestamp response cannot derive an
all-time newest-five display when fewer than five observations fall in that window.

### Systems

Source-level query count: **7** Supabase queries: one ordered systems lookup followed by six
concurrent data queries.

| Query | Projection/window | Returned rows |
| --- | --- | --- |
| `systems` | system metadata; all systems | Data-dependent, uncapped |
| `daily_checks` overview | overview fields; last 36 hours | Data-dependent, uncapped |
| `daily_checks` detail | detail and overview fields; configured systems, last 60 days | Data-dependent, uncapped |
| `water_quality_readings` | chart fields; configured systems, last 60 days | Data-dependent, uncapped |
| `chemical_additions` | highlight fields; configured systems, last 14 days | Data-dependent, uncapped |
| `health_observations` | highlight fields and tank; configured systems, last 14 days | Data-dependent, uncapped |
| `maintenance_logs` | highlight fields; configured systems, last 14 days | Data-dependent, uncapped |

The 60-day daily-check result is an ordered superset of the 36-hour overview result and
contains every field needed by the overview. Filtering that existing result to the same
36-hour boundary can safely derive latest temperature and today's AM/PM state.

### Live metrics

| Route | Request latency | Actual returned rows | RSC payload | Client hydration proxy |
| --- | --- | --- | --- | --- |
| Home | **BLOCKED** | **BLOCKED** | **BLOCKED** | **BLOCKED** |
| Systems | **BLOCKED** | **BLOCKED** | **BLOCKED** | **BLOCKED** |

The hydration measurement is intentionally a proxy: route JavaScript transferred plus
browser Performance navigation/resource timings and long-task duration. It is not labeled
as React hydration CPU unless a React profiler trace is captured.

## After

### Home

Source-level query count remains **9**. The all-time newest-five health list and today's
health count have different result domains, so removing either request would change the
display when the newest observation is older than today or when today has more than five
observations.

The daily health-count request now uses exact Pacific-day boundaries and
`count: "exact", head: true`. It therefore returns **0 data rows** instead of every
observation timestamp from a 36-hour superset; the displayed count is unchanged. All other
query row cardinalities remain as listed in the before table.

Data loading now lives in `app/protected/home/data.ts`, pure dashboard derivation in
`app/protected/home/derivations.ts`, and rendering in `app/protected/home/page.tsx`.

### Systems

Source-level query count is **6**, down from 7: one ordered systems lookup followed by five
concurrent table queries. The separate 36-hour `daily_checks` request was removed. Its
overview is derived from the existing ordered 60-day result while applying the original
36-hour cutoff, so older temperatures do not become current. Returned rows for the remaining
queries are unchanged from the before table.

The Systems page already separated server loading (`data.ts`), client interaction
(`systems-page-client.tsx`), and rendering components. Only the pure overview derivation was
extracted; no broader component churn was justified.

### Payload, hydration, and latency

No server/client boundary or serialized prop shape changed, so no source-backed RSC or
hydration reduction is claimed. Live before/after latency, byte, timing, and actual row-count
values remain **BLOCKED** on the authenticated browser prerequisite in Method. Source query
counts and response cardinality constraints are reproducible from the loaders.

No indexes, schema, migrations, or RLS policies were changed; no query-plan-based index work
was warranted.

## Validation

- VS Code TypeScript diagnostics: pass for `app/protected/home`,
  `app/protected/systems`, and `components/systems`.
- Focused derivation tests were added for Home Pacific-day behavior and Systems 36-hour
  overview behavior.
- Command execution was not exposed in this agent session, so these required commands remain
  to be run by the lead before PR review:
  - `npm run test:unit`
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npm run build`
  - `npm run test:e2e:plan -- --files app/protected/home/data.ts app/protected/home/derivations.ts app/protected/home/page.tsx app/protected/systems/data.ts app/protected/systems/derivations.ts tests/unit/systems-derivations.test.ts tests/unit/home-derivations.test.ts`
- The selector's path rules request `daily-operations` and `systems-trends`. Per task
  direction, browser e2e is left for the lead's delegated verification.