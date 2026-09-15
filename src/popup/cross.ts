/**
 * The grease-pencil cross (spec §6.5).
 *
 * Lives in its own module so a test can build one and measure what it renders.
 * Asserting the coordinates in the `d` strings proves nothing: the strokes can
 * be a perfect X in the source and still reach the screen as fragments, which
 * is exactly what happened.
 *
 * The cause was two coordinate systems disagreeing. The svg used to be a
 * 100x44 viewBox stretched with `preserveAspectRatio="none"` to fill the row —
 * 3.36x across against 0.66x down, a 5.1x anisotropy — which made the stroke
 * render several times its nominal width, which is why `non-scaling-stroke`
 * was added to pin it back. But `non-scaling-stroke` resolves the whole stroke,
 * dash pattern included, against the *rendered* path, while `pathLength="1"`
 * normalises `stroke-dasharray` against the path in *user* units. A 96-unit
 * path rendering 310px long means the dash covers about a third of what is
 * drawn, so the mark arrived as a stub with the rest of the stroke in the gap.
 *
 * The fix is to stop stretching. The popup is a fixed 380px wide and the box
 * below is a fixed height, so the viewBox can be stated in CSS pixels and the
 * scale is exactly 1:1 in both axes. Then a user unit *is* a device pixel:
 * the stroke needs no compensation, `non-scaling-stroke` is gone, and there is
 * only one coordinate system left for `pathLength` to normalise against.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The size of the box `.cross` occupies, in CSS pixels — 380px popup less the
 * left and right insets in popup.css, by a fixed height. The viewBox is stated
 * in the same units, which is what makes the mapping 1:1.
 * popup-cross.test.ts asserts the stylesheet and these numbers agree.
 */
export const VIEWBOX = { width: 336, height: 30 };

/**
 * Two slightly wobbly strokes — a grease pencil does not draw straight. They
 * run corner to corner and meet near the middle of the row: a mark that dodges
 * the type is fragments, not a cross. The title stays readable because the
 * stroke is thin and translucent, not because it is routed around the letters.
 */
const STROKES = ['M 3 5 C 110 10, 222 20, 333 25', 'M 333 5 C 226 10, 114 21, 3 26'];

export function buildCross(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'cross');
  svg.setAttribute('viewBox', `0 0 ${VIEWBOX.width} ${VIEWBOX.height}`);
  // No preserveAspectRatio override: the viewBox already matches the box's
  // aspect, so the default uniform fit is a no-op. Should the box ever drift,
  // it scales evenly instead of stretching — the safe failure.
  svg.setAttribute('aria-hidden', 'true');
  for (const d of STROKES) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    // Normalises the path length to 1, so stroke-dasharray:1 covers it exactly.
    path.setAttribute('pathLength', '1');
    svg.append(path);
  }
  return svg;
}
