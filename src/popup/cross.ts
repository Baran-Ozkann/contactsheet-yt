/**
 * The grease-pencil cross (spec §6.5).
 *
 * Lives in its own module so a test can build one and measure what it renders.
 * Asserting the coordinates in the `d` strings proves nothing: the strokes can
 * be a perfect X in the source and still reach the screen as fragments, which
 * is exactly what happened once.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Two slightly wobbly strokes — a grease pencil does not draw straight. */
const STROKES = ['M 4 8 C 32 15, 62 29, 96 36', 'M 96 9 C 65 16, 33 28, 4 37'];

/** The user space the strokes above are drawn in. */
export const VIEWBOX = { width: 100, height: 44 };

export function buildCross(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'cross');
  svg.setAttribute('viewBox', `0 0 ${VIEWBOX.width} ${VIEWBOX.height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
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
