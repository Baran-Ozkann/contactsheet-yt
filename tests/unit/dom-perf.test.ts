// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BATCH_BUDGET_MS, MAX_NODES_PER_BATCH, Scanner } from '../../src/content/scanner.js';
import { HIDDEN_ATTR } from '../../src/content/selectors.js';

/**
 * NFR-01: the scan has to stay cheap per card however large the grid gets.
 *
 * What this asserts is the shape of the cost, not its size: per-card cost at
 * the largest grid against the smallest. A linear scan keeps that ratio near 1;
 * anything that re-walks the grid per card drives it towards the size ratio.
 * Both sides come from the same machine in the same run, so a slow CI runner
 * scales them together and the ratio survives it.
 *
 * The milliseconds are printed for the record and deliberately not asserted.
 * The 8 ms figure NFR-01 sets is a Chrome measurement, tracked in docs/QA.md:
 * jsdom's DOM operations run roughly 25x slower than Blink's and its timings
 * swing with the host, so an absolute threshold here only measured the runner.
 * That a batch stops once the budget is spent is proven against a fake clock in
 * scanner-budget.test.ts.
 */

const INDEX_SIZE = 20_000;
const GRID_SIZES = [100, 200, 400] as const;
const REPEATS = 3;
/** Linear sits near 1; quadratic over a 4x spread would be near 4. */
const MAX_COST_RATIO = 2;

// The NFR-03 ceiling, so every lookup runs against the worst documented index.
const VIDEOS = new Set(Array.from({ length: INDEX_SIZE }, (_, i) => `v${String(i).padStart(10, '0')}`));

function buildGrid(cards: number, hiddenRatio: number): Element {
  document.body.textContent = '';
  const grid = document.createElement('ytd-rich-grid-renderer');
  for (let i = 0; i < cards; i += 1) {
    const card = document.createElement('ytd-rich-item-renderer');
    // Realistic nesting depth and a tracking tail on the href.
    const outer = document.createElement('div');
    const inner = document.createElement('div');
    const a = document.createElement('a');
    const id = i / cards < hiddenRatio ? `v${String(i).padStart(10, '0')}` : `z${String(i).padStart(10, '0')}`;
    a.setAttribute('href', `/watch?v=${id}&pp=ygUKdGVzdCBxdWVyeQ%3D%3D&t=${i}s`);
    a.textContent = `Video number ${i}`;
    inner.append(a);
    outer.append(inner);
    card.append(outer);
    grid.append(card);
  }
  document.body.append(grid);
  return grid;
}

interface Sweep {
  cards: number;
  batches: { nodes: number; durationMs: number }[];
  totalMs: number;
  hidden: number;
}

/** Runs one full sweep, stepping the scheduler by hand instead of waiting on frames. */
function sweep(cards: number, hiddenRatio: number): Sweep {
  const grid = buildGrid(cards, hiddenRatio);
  const frames: (() => void)[] = [];
  const batches: Sweep['batches'] = [];

  const scanner = new Scanner({
    schedule: (run) => frames.push(run),
    onBatch: (stats) => batches.push({ ...stats }),
  });
  scanner.setHidden({ videos: VIDEOS, playlists: new Set(['WL']) });
  scanner.start(grid);
  while (frames.length > 0) frames.shift()?.();
  scanner.stop();

  return {
    cards,
    batches,
    totalMs: batches.reduce((sum, b) => sum + b.durationMs, 0),
    hidden: grid.querySelectorAll(`[${HIDDEN_ATTR}="1"]`).length,
  };
}

/** Fastest of a few sweeps per size: noise only ever adds time, so the minimum is the cleanest. */
function measure(hiddenRatio: number): Sweep[] {
  // Warm up on the largest grid: otherwise JIT compilation is billed to the
  // smallest size, which pulls the ratio below 1 and can mask real growth.
  for (let i = 0; i < 2; i += 1) sweep(GRID_SIZES.at(-1) ?? 0, hiddenRatio);
  return GRID_SIZES.map((cards) => {
    const runs = Array.from({ length: REPEATS }, () => sweep(cards, hiddenRatio));
    return runs.reduce((best, run) => (run.totalMs < best.totalMs ? run : best));
  });
}

const perCard = (s: Sweep): number => s.totalMs / s.cards;

function report(name: string, sweeps: Sweep[]): void {
  const lines = sweeps.map((s) => {
    const durations = s.batches.map((b) => b.durationMs);
    return (
      `  ${String(s.cards).padStart(4)} cards  ${String(s.batches.length).padStart(2)} batches` +
      `  max batch ${Math.max(...durations).toFixed(3)} ms  total ${s.totalMs.toFixed(3)} ms` +
      `  per card ${(perCard(s) * 1000).toFixed(1)} µs`
    );
  });
  console.log(
    [
      ``,
      `NFR-01 (jsdom, for the record only) — ${name}`,
      `  index: ${INDEX_SIZE} ids   budget: ${BATCH_BUDGET_MS} ms   repeats: ${REPEATS}, fastest kept`,
      ...lines,
      `  per-card cost ratio, largest/smallest: ${costRatio(sweeps).toFixed(2)} (limit ${MAX_COST_RATIO})`,
    ].join('\n'),
  );
}

function costRatio(sweeps: Sweep[]): number {
  const first = sweeps[0];
  const last = sweeps.at(-1);
  if (!first || !last) throw new Error('no sweeps');
  return perCard(last) / perCard(first);
}

describe('NFR-01 — scan cost grows linearly with the grid', () => {
  it('keeps per-card cost flat as the grid grows (half the grid hidden)', () => {
    const sweeps = measure(0.5);
    report('50% hidden', sweeps);

    for (const s of sweeps) expect(s.hidden).toBe(s.cards / 2);
    expect(costRatio(sweeps)).toBeLessThan(MAX_COST_RATIO);
  });

  it('keeps per-card cost flat when nothing matches, which is the common case', () => {
    const sweeps = measure(0);
    report('nothing hidden', sweeps);

    for (const s of sweeps) expect(s.hidden).toBe(0);
    expect(costRatio(sweeps)).toBeLessThan(MAX_COST_RATIO);
  });

  it('splits the grid into batches rather than one long task', () => {
    const { batches } = sweep(300, 0.5);
    // The node cap alone guarantees this, independent of how fast the host is.
    expect(batches.length).toBeGreaterThanOrEqual(Math.ceil(300 / MAX_NODES_PER_BATCH));
    expect(Math.max(...batches.map((b) => b.nodes))).toBeLessThanOrEqual(MAX_NODES_PER_BATCH);
  });
});
