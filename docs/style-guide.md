# UI Style Guide — Typography

Reference for keeping new UI consistent with what's already shipped. Update this file
whenever a new typographic pattern is introduced deliberately — don't let one-off
components invent their own conventions.

## Font family
One typeface for the whole app: **Geist Sans**, loaded once via `next/font/google` in
[app/layout.tsx](../app/layout.tsx) and applied to `<body>`. Never import another font or
set a competing `font-family`/`font-serif`/`font-mono` class — everything inherits Geist
by default.

## Type scale (Tailwind classes, in order of prominence)
| Role | Classes | Example |
| --- | --- | --- |
| Page title (`<h1>`) | `text-3xl font-semibold tracking-tight` | "Graham" system page, "Home", "Daily Operations" |
| Section eyebrow | `text-sm font-semibold text-muted-foreground uppercase tracking-wide` | "The 8 lab systems" on the landing page |
| Card title (`CardTitle`) | inherits `font-semibold leading-none tracking-tight`; caller sets size | `text-base` for compact dashboard cards |
| Stat/metric value | `text-2xl font-semibold tabular-nums tracking-tight` | Home dashboard stat tiles |
| List-item entity label (system/tank name in a list) | `text-sm font-medium` | Systems sidebar, highlights feed, Home "attention" list |
| Body/secondary text | `text-sm text-muted-foreground` | Card descriptions, list sub-text |
| Chart/axis/legend text | `text-xs text-muted-foreground` (or `text-xs` + a semantic `fill` color override) | Chart axis ticks, hover tooltips, date-range footers |
| Micro/meta text | `text-xs text-muted-foreground` | Timestamps, badges, fine print |

`tabular-nums` is used wherever a number changes in place (stat tiles, counters) so digits
don't jiggle the layout.

## Entity-name labels specifically
Any time a system/tank name (or similarly-scoped entity) appears as a compact label in a
list or feed — not as a page `<h1>` and not inside a `Badge` pill — use exactly
`text-sm font-medium`. This is the pattern in
[components/systems/grid-overview.tsx](../components/systems/grid-overview.tsx),
[components/systems/highlights-feed.tsx](../components/systems/highlights-feed.tsx), and
[app/protected/home/page.tsx](../app/protected/home/page.tsx). Page-level `<h1>` titles and
`Badge`-wrapped names are different typographic roles and intentionally don't match this.

## Charts (`components/systems/charts.tsx`)
All text inside `MultiLineChart` and `DualAxisLineChart` — axis ticks, the shared
`HoverIndicator` tooltip, and the legend/date-range footer — renders at the same size via
the Tailwind `text-xs` class (never a raw SVG `fontSize` attribute; those drift out of sync
with the rest of the app over time). Color is the only thing allowed to vary per element,
and only when it's semantically meaningful:
- Neutral (`text-muted-foreground` / `text-popover-foreground`) for anything that isn't
  tied to one data series — shared axis ticks, tooltip text, footer text.
- Series-matched (`fill={series.color}`) only for `DualAxisLineChart`'s left/right tick
  labels, where the color is how the user tells which axis belongs to which line.

When adding a new chart, start from the existing `MultiLineChart` pattern (`text-xs`
wrapping `<g>`, no raw `fontSize`) rather than reintroducing hardcoded pixel sizes.

## Color tokens
Don't hardcode hex/black/white for anything themeable. Use the CSS-variable-backed Tailwind
color utilities (`text-muted-foreground`, `text-popover`, `text-popover-foreground`,
`text-border`, etc.) defined in [app/globals.css](../app/globals.css) and mapped in
[tailwind.config.ts](../tailwind.config.ts) — they already resolve correctly for both light
and dark mode. In SVG, prefer `fill="currentColor"`/`stroke="currentColor"` combined with a
`text-*` className on the same or an ancestor element, since Tailwind's `fill-*`/`stroke-*`
utilities don't reliably apply to raw SVG presentation attributes in this setup.
