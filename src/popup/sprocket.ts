/**
 * The sprocket strip (spec §6.4) — the design's load-bearing element.
 *
 * It is not one full-height SVG on its own pitch any more. Every frame carries
 * its own perforation in a gutter reserved on its left edge, so a row and its
 * hole cannot drift apart: the alignment is structural rather than measured,
 * and it survives rows of different heights, a note wrapping, and the strip
 * scrolling under a fixed head and foot.
 *
 * That alignment is what lets the strip carry state. A struck frame's hole is
 * grease and an unstruck one's is unexposed emulsion, so the margin reads as a
 * column of marks — which frames are hidden, without reading the list. The
 * colour is never the only signal (§6.7): the cross and `aria-checked` say the
 * same thing.
 *
 * Below the last row the film keeps running in plain perforations, which is
 * what `buildTail` fills in.
 */

/** Marks an element as carrying a perforation; the stylesheet draws it. */
export const PERF_CLASS = 'perf';

/** Tail pitch in px — the nominal height of a row plus its frame gap. Must
 *  match `--perf-pitch` in popup.css; the design test asserts that it does. */
export const PERF_PITCH = 44;

/** Popup height (spec §6.4). The tail never needs more holes than this. */
const STRIP_HEIGHT = 520;

/** How many holes the amber pulse runs across before repeating. */
const STAGGER = 8;

/**
 * Gives `el` a perforation, staggering its amber sync pulse by position so the
 * light runs down the strip rather than every hole flashing at once.
 */
export function perforate(el: HTMLElement, index: number): void {
  el.classList.add(PERF_CLASS);
  el.style.setProperty('--perf-delay', `${(index % STAGGER) * 0.25}s`);
}

/**
 * Fills the tail below the last row with plain, unexposed perforations. These
 * belong to no frame and never take grease — the sheet ends, the film does not.
 */
export function buildTail(tail: HTMLElement): void {
  if (tail.childElementCount > 0) return;
  const count = Math.ceil(STRIP_HEIGHT / PERF_PITCH);
  for (let i = 0; i < count; i += 1) {
    const cell = tail.ownerDocument.createElement('span');
    cell.className = 'tail-cell';
    perforate(cell, i);
    tail.append(cell);
  }
}
