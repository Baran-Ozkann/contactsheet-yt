// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCross } from '../../src/popup/cross.js';

const css = readFileSync('src/popup/popup.css', 'utf8');

/**
 * The cross is measured where it lands, not where it is written.
 *
 * Reading the `d` strings out of the source and checking that they describe an
 * X proves only that the author meant well. Everything between the attribute
 * and the paint — the viewBox, preserveAspectRatio, the inset the stylesheet
 * gives the svg — can turn a perfect X into fragments, and did. So these tests
 * build a real cross, take the viewBox and the paths off the DOM, resolve the
 * box the stylesheet puts it in, and work in rendered pixels from there.
 *
 * jsdom does no SVG layout, so the mapping is done here rather than read back
 * from the engine. It is the same arithmetic the engine does: the box comes
 * from the stylesheet, the user space from the viewBox, and the scale is one
 * divided by the other.
 */

/** The popup is a fixed 380px wide (spec §6.4), so the cross box is exact. */
const ROW_WIDTH = 380;

/** 12px padding, one 15px/1.25 title line, 12px padding (popup.css `.row`). */
const ROW_HEIGHT = 43;

/** `--gutter`: the 16px sprocket strip plus the frame's own 16px padding. */
const GUTTER = 32;

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  from: Point;
  to: Point;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Splits a CSS value on top-level spaces, so `calc(a - b)` survives intact. */
function splitTop(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of value.trim()) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** Resolves the handful of length forms `.cross` actually uses. */
function px(value: string): number {
  if (value === 'auto') return Number.NaN;
  const fromGutter = /^calc\(var\(--gutter\)\s*-\s*(\d+(?:\.\d+)?)px\)$/.exec(value);
  if (fromGutter) return GUTTER - Number(fromGutter[1]);
  const plain = /^(-?\d+(?:\.\d+)?)px$/.exec(value);
  expect(plain, `unhandled length in .cross: ${value}`).not.toBeNull();
  return Number(plain![1]);
}

/**
 * The declarations on `.cross path`, comments stripped — a property named in a
 * comment explaining why it is absent must not read as the property being set.
 */
function pathRule(): string {
  const rule = /\.cross path\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  expect(rule, '.cross path has no rule in popup.css').not.toBe('');
  return rule.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The box the stylesheet gives the cross, in pixels, on a plain row. */
function crossBox(): Box {
  const rule = /\.cross\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  expect(rule, '.cross has no rule in popup.css').not.toBe('');
  const parts = splitTop(/inset:\s*([^;]+);/.exec(rule)?.[1] ?? '');
  expect(parts.length, 'inset should be the 4-value form').toBe(4);
  const [top, right, bottom, left] = parts.map(px) as [number, number, number, number];
  const declared = /height:\s*(\d+(?:\.\d+)?)px/.exec(rule)?.[1];
  return {
    left,
    top,
    width: ROW_WIDTH - left - right,
    // A declared height wins; otherwise the box stretches between the insets.
    height: declared === undefined ? ROW_HEIGHT - top - bottom : Number(declared),
  };
}

/** First and last point of a `M x y C …, …, x y` subpath. */
function endpoints(d: string): Stroke {
  const n = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  expect(n.length, `unexpected path data: ${d}`).toBe(8);
  return {
    from: { x: n[0]!, y: n[1]! },
    to: { x: n[6]!, y: n[7]! },
  };
}

interface Rendered {
  box: Box;
  scaleX: number;
  scaleY: number;
  /** Endpoints in rendered pixels. */
  strokes: Stroke[];
  /** The same endpoints in the svg's own user units, before any scaling. */
  authored: Stroke[];
}

/** Builds a cross and maps its paths into the pixels they will occupy. */
function render(): Rendered {
  const svg = buildCross();
  const viewBox = (svg.getAttribute('viewBox') ?? '').trim().split(/\s+/).map(Number);
  expect(viewBox.length, 'the cross has no usable viewBox').toBe(4);
  const [minX, minY, vbWidth, vbHeight] = viewBox as [number, number, number, number];

  const box = crossBox();
  const scaleX = box.width / vbWidth;
  const scaleY = box.height / vbHeight;
  const place = (p: Point): Point => ({
    x: box.left + (p.x - minX) * scaleX,
    y: box.top + (p.y - minY) * scaleY,
  });

  const authored = [...svg.querySelectorAll('path')].map((path) =>
    endpoints(path.getAttribute('d') ?? ''),
  );
  const strokes = authored.map(({ from, to }) => ({ from: place(from), to: place(to) }));
  return { box, scaleX, scaleY, strokes, authored };
}

/** Where two chords meet, or null when they do not meet at all. */
function intersection(a: Stroke, b: Stroke): Point | null {
  const ax = a.to.x - a.from.x;
  const ay = a.to.y - a.from.y;
  const bx = b.to.x - b.from.x;
  const by = b.to.y - b.from.y;
  const denom = ax * by - ay * bx;
  if (denom === 0) return null;
  const t = ((b.from.x - a.from.x) * by - (b.from.y - a.from.y) * bx) / denom;
  const u = ((b.from.x - a.from.x) * ay - (b.from.y - a.from.y) * ax) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.from.x + t * ax, y: a.from.y + t * ay };
}

describe('the cross as it renders', () => {
  it('is two strokes, not one', () => {
    expect(render().strokes).toHaveLength(2);
  });

  it('runs from one side of the row to the other', () => {
    const { box, strokes } = render();
    for (const [i, s] of strokes.entries()) {
      const span = Math.abs(s.to.x - s.from.x);
      expect(span / box.width, `stroke ${i} spans too little of the row`).toBeGreaterThanOrEqual(
        0.9,
      );
    }
  });

  it('draws one stroke each way, so the mark reads as an X', () => {
    const [a, b] = render().strokes as [Stroke, Stroke];
    // One descends left to right, the other right to left.
    expect(Math.sign(a.to.x - a.from.x)).toBe(-Math.sign(b.to.x - b.from.x));
    expect(a.to.y).toBeGreaterThan(a.from.y);
    expect(b.to.y).toBeGreaterThan(b.from.y);
  });

  it('crosses near the middle of the row, in rendered pixels', () => {
    const { box, strokes } = render();
    const [a, b] = strokes as [Stroke, Stroke];
    const at = intersection(a, b);
    expect(at, 'the two strokes never meet — this is four fragments, not a cross').not.toBeNull();

    const centreX = box.left + box.width / 2;
    const centreY = box.top + box.height / 2;
    expect(Math.abs(at!.x - centreX) / box.width).toBeLessThanOrEqual(0.12);
    expect(Math.abs(at!.y - centreY) / box.height).toBeLessThanOrEqual(0.2);
  });

  it('stays inside the box the stylesheet gives it', () => {
    const { box, strokes } = render();
    for (const point of strokes.flatMap((s) => [s.from, s.to])) {
      expect(point.x).toBeGreaterThanOrEqual(box.left);
      expect(point.x).toBeLessThanOrEqual(box.left + box.width);
      expect(point.y).toBeGreaterThanOrEqual(box.top);
      expect(point.y).toBeLessThanOrEqual(box.top + box.height);
    }
  });

  it('clears the sprocket gutter, so it strikes the frame and not the hole', () => {
    expect(crossBox().left).toBeGreaterThanOrEqual(GUTTER - 2);
  });
});

/**
 * The stroke is revealed by animating stroke-dashoffset, and pathLength="1"
 * normalises the dash against the path measured in the svg's *user* units. So
 * anything that makes the rendered path a different length than the authored
 * one puts the dash and the path in different coordinate systems, and the dash
 * then covers the wrong fraction of what is drawn.
 *
 * That is not a style preference, it is the defect: a 96-unit path rendering
 * 310px long is a dash covering about a third of the stroke, which reaches the
 * screen as a stub with the rest of the mark sitting in the gap.
 */
describe('the coordinate system the strokes are drawn in', () => {
  it('maps user units onto pixels 1:1, in both axes', () => {
    const { scaleX, scaleY } = render();
    expect(scaleX).toBeCloseTo(1, 5);
    expect(scaleY).toBeCloseTo(1, 5);
  });

  it('renders each stroke at the length pathLength normalises it to', () => {
    const { strokes, authored } = render();
    const length = (s: Stroke): number => Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y);
    for (const [i, s] of strokes.entries()) {
      const ratio = length(s) / length(authored[i]!);
      expect(ratio, `stroke ${i} renders ${ratio.toFixed(2)}x its authored length`).toBeCloseTo(
        1,
        2,
      );
    }
  });

  it('does not stretch the user space to fit the row', () => {
    // preserveAspectRatio="none" is what allowed the 5.1x anisotropy. The
    // default uniform fit is a no-op here and a safe failure if the box drifts.
    expect(buildCross().getAttribute('preserveAspectRatio')).toBeNull();
  });

  it('needs no vector-effect, and must not carry one', () => {
    // non-scaling-stroke resolves the dash against the rendered path while
    // pathLength normalises against the authored one. With a 1:1 box there is
    // nothing to compensate for, and re-adding it would split the two again.
    expect(pathRule()).not.toMatch(/vector-effect/);
  });

  it('still reveals the mark with dasharray and dashoffset (§6.5)', () => {
    for (const path of Array.from(buildCross().querySelectorAll('path'))) {
      expect(path.getAttribute('pathLength')).toBe('1');
    }
    expect(pathRule()).toMatch(/stroke-dasharray:\s*1;/);
    expect(pathRule()).toMatch(/stroke-dashoffset:\s*1;/);
  });
});
