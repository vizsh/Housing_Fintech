# Design system: Sanction Blueprint

Naksha's interface is a drawing sheet. Every valuation is drawn up like a municipal sanction plan: measured, dimensioned, stamped. Tokens live in `web/src/index.css` (`:root`) and are mirrored in `.impeccable/design.json`.

## World

- **Ground:** cyanotype blue (`--ground #0b2a4a`, deeper `--ground-0 #071f38`, raised `--ground-2/3`). It carries a drafting grid: 24 px minor and 120 px major lines in `--grid-*`. The grid is the material of the sheet, not decoration.
- **Linework:** everything structural is 1 px pale-blue rule (`--line`, `--line-2`, `--line-3`). Panels are regions of one sheet divided by hairline seams. Use no shadows, no glass, no rounded corners.
- **Ink:**
  - `--ink #e8f1fb` is primary.
  - `--ink-2` and `--ink-3` are secondary and tertiary, tinted from the ground, never grey.
  - `--cyan #7fb2e5` is for technical marks: dimension lines, comparables, grids.
- **Reserved ink:** amber `--amber #f2b233` marks only three things: the subject property, its value, and the lending decision. Nothing else may use it.
- **Decision colours:** `--green` (waive), `--amber` (desk review) and `--red` (physical visit) appear only on the decision band and on flags.

## Type

- One family: **Archivo Variable**, self-hosted via `@fontsource-variable/archivo`, using its width axis.
- Labels use the `.label` class: condensed caps (`font-stretch 72%`, weight 600, tracking 0.12em, 10–11 px), like drafting lettering.
- Figures are tabular and lining everywhere (`.num`).
- The display value is set condensed (`82%`) at 76 px in amber.

## Components

- **Panel:** a sheet region with a hairline-ruled caps header and optional right-aligned meta. It is not a card.
- **Title block** (left column): input form and drawing metadata, ending in the primary action. The primary action is a full-width ink-filled bar ("Value property").
- **Value dimension:** the value drawn as a measurement. A dimension line with arrowheads and extension lines spans the 90% range, with 80% and 68% (amber) bands nested inside it and a datum tick at the estimate.
- **Decision band:** the lending action at sign scale. It is a solid band in the decision colour, revealed with a left-to-right wipe.
- **Elevation:** a three.js white-line wireframe of the building on the drafting grid. It draws itself storey by storey, puts the subject floor in amber, and carries dimension lines with projected DOM labels.
- **Site plan and market surface:** deck.gl over MapLibre, using OpenFreeMap tiles re-inked as blueprint (water deep ground, roads pale line, English labels). Comparables are wireframe columns; the subject is an amber column.
- **Drawing set** (below the first viewport on the Valuation sheet). This is the valuer's site-check layer, drawn to architectural convention.
  - **Unit plan** (SVG): a procedural layout from carpet area, BHK and bathrooms.
    - External walls as 230 mm hatched poché, partitions at 115 mm.
    - Door swings with dashed arcs, window and sliding-door symbols, and wet rooms tiled.
    - Dimension chains with oblique ticks, a north point rotated by entrance facing, and a scale bar.
    - The entrance door and its callout are amber, because they belong to the subject.
  - **RERA area statement:** carpet, then walls, balcony and built-up, then loading, then super built-up, shown as bars.
    - Totals are solid ink; the components between them are cyan hatch.
    - A field for the agreement's super area recomputes loading live and flags anything over 40%.
  - **Orientation rose:** eight petals.
    - Petal length is the model value for that entrance direction against the mean of all eight.
    - Tint is the hours of direct sun on that facade for the selected date (21 Jun, 21 Mar or 21 Dec).
    - The subject petal is amber. Clicking a petal re-values the property facing that way.
  - **Construction-linked disbursement** (under-construction only):
    - A range slider steps through a typical construction-linked payment plan: booking, agreement, plinth, slab groups, finishes, then the occupancy certificate (OC).
    - Five stat cells and a drawn-on exposure chart compare stalled-project realisable value against what the lender has disbursed.
- **Elevation additions:**
  - A ground north point.
  - Sun study: the day's sun path in dotted linework, the sun as a white sphere, and the cast shadow as a dark polygon with a cyan edge. A Sun study bar over the panel sets the date and time.
  - Under construction: uncast storeys draw as faint cyan ghosts, and a lattice tower crane's hook hangs at the working slab.
- **Range inputs:** a 1 px dimension-line track with a square ink handle. Amber stays reserved, so the handle is not amber.
- **Compass picker** (title block): an eight-point star. Cardinal points are lighter, and the selected point is amber.
- **Cash-flow skyline** (commercial sheet): a three.js drawing of ten years of NOI.
  - Each year is a wireframe column. White solid columns are the contracted lease; dashed cyan columns are the re-let years.
  - A filled core in each column shows its present value.
  - A hatched vertical plane marks lease expiry.
  - Columns draw on year by year, using the elevation's projected-label technique.
- **Sensitivity grid:** a 5 × 5 table of cap rate against rent. Cell tint is cyan, scaled by value. The estimate cell is amber, the only amber on the grid.
- **Segmented controls and chips:** outlined; the active state fills with ink.
- **Hatching** (`repeating-linear-gradient 135deg`) marks negatives, baselines and the structure share. It is never decorative fill.

## Website

The product is a website of eight pages on one sheet language.

**Navigation**
- A sticky navigation bar carries the sheet codes (VAL, DUE, PRT, CRE, MKT, EVD, API).
- Content pages end in a ruled footer.
- The workspace pages (Valuation, Portfolio, Commercial, Market) fill the viewport like the original console.

**Landing page**
- **Hero:** a three.js scene (`HeroCity`). A procedural wireframe city rises outward from an amber subject tower while a cyan survey ring sweeps the plots. An amber value tag tracks the tower's roof, and the camera follows the pointer.
- **Below the hero, in order:**
  1. A marquee of measured numbers.
  2. Counters that run when scrolled into view.
  3. The "five witnesses" diagram, its paths drawn on with amber particles travelling to the verdict.
  4. A grid of platform tiles over screenshots.
  5. A dark-side teaser.
  6. The benchmark.
  7. A closing call to action.

**Reality components**
- The integrity dial: a semicircular gauge whose needle sweeps in, with red, amber and green zones that match the routing.
- The two-prices chart: circle rate and deed hatched in cyan, market solid amber, and the cash gap as a dashed red rule.

Red is used for fraud, title and breach signals only.

**Portfolio.** deck.gl columns per loan, height by outstanding amount:
- Colour runs from cyan (within cap) to amber (near cap) to red (breach), and deep red marks a double pledge.
- Colours transition as the stress slider moves.

## Motion

- One authored moment per valuation: the elevation draws on, the value digits roll into place, the range bands extend, and the decision band wipes in.
- Easing is exponential ease-out, `cubic-bezier(0.16, 1, 0.3, 1)`.
- The market surface orbits slowly until the user touches it.
- `prefers-reduced-motion` collapses all of it.

## Layout

- Desktop first viewport: title block 25%, centre column (elevation 56% over site plan) fluid, value and decision column 30%.
- The evidence sheet follows below on the same seams.
- Below 1100 px everything stacks into one column in reading order.
- Print keeps the blueprint (`print-color-adjust: exact`), hides the 3D centre and the inputs, and lays value plus evidence on A4.
