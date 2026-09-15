# ADR 0003 — The sprocket strip carries row state

- Status: accepted
- Date: 2026-09-15

## Context

Spec §6.4 draws the sprocket strip as a 16px SVG column down the left edge,
full height, and calls it "the design's load-bearing element". The first
implementation took that literally: one `<svg>` in its own grid column, holes
generated at load on a fixed 26px pitch.

Two problems followed.

1. **The pitch was unrelated to the content.** Rows are ~45px and vary — a row
   carrying an L0 or partial note is taller than one without. A 26px hole pitch
   beside a 45px row pitch drifts immediately, so the strip read as wallpaper
   running behind the list rather than as the film the list is printed on.
2. **It carried no information.** The one decorative element in a design whose
   whole argument is that nothing is decorative.

## Options

1. **Keep the standalone column, position holes from measured row geometry.**
   Faithful to the §6.4 drawing. Needs `getBoundingClientRect` per row after
   every render, plus scroll synchronisation with `.rows`, plus a re-measure on
   any reflow. Three moving parts that can silently fall out of step.
2. **Keep the standalone column, leave it decorative.** No work; keeps the
   defect.
3. **Give every frame its own perforation in a gutter it reserves.** The hole
   is a child of the frame it belongs to, so alignment is structural: it cannot
   drift, at any row height, under any scroll position, with no measurement.

## Decision

**Option 3.** Each band (`.head`, `.row`, `.add`, `.transfer`, `.foot`,
`.message`, `.ghost`) reserves `--gutter` on its left edge and draws its hole
with a `::before`. Below the last row a `.tail` of plain cells on the nominal
row pitch keeps the film running past the end of the sheet.

Because each hole now belongs to a frame, the strip can carry that frame's
state: a hidden row's hole takes `--grease`, a visible one's stays `--emulsion`
at 0.22. The margin becomes a column of marks that says which frames are struck
without the list being read.

The amber sync pulse (§6.5) is unchanged in behaviour. It moves from `fill` to
`background-color`, and because a running animation outranks every normal
declaration it overrides a struck row's grease for the duration of the sync and
hands the hole back afterwards — amber means process, red means decision, and
the roles still never mix.

## Consequences

- **§6.4's "(SVG)" no longer holds.** The strip is CSS pseudo-elements on the
  frames. The 16px width, the full height and the load-bearing role all hold;
  only the mechanism changed. The spec drawing is otherwise unaffected — content
  still starts at x=32, because the gutter replaces the old grid column exactly.
- `body` is no longer a two-column grid, so nothing can render *beside* the
  frames any more. Anything wanting the left edge has to be a frame.
- Colour still never carries meaning alone (§6.7): the hole repeats what the
  cross and `aria-checked` already say.
- The tail is `flex: 1 1 0`. An `auto` basis would let its cells compete with
  the frames for the 520px.
- `PERF_PITCH` in `src/popup/sprocket.ts` and `--perf-pitch` in `popup.css` are
  the same number in two places; `tests/unit/popup-sprocket.test.ts` asserts
  they agree.
