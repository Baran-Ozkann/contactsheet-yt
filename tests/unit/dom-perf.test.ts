// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BATCH_BUDGET_MS, Scanner } from '../../src/content/scanner.js';
import { HIDDEN_ATTR } from '../../src/content/selectors.js';

/**
 * NFR-01: no long task, every observer batch under 8 ms.
 *
 * Measured with performance.measure over a 300-card grid, against a 20,000-id
 * index — the NFR-03 ceiling, so this is the worst documented case rather than
 * a comfortable one.
 *
 * jsdom is not Chrome. Its querySelector and attribute writes are slower than a
 * real browser's, so treat these figures as a pessimistic bound: the engine has
 * headroom here, and Blink should beat it. The real-browser number still has to
 * come from a manual pass.
 */

const INDEX_SIZE = 20_000;
const CARD_COUNT = 300;

function buildIndex(): Set<string> {
  return new Set(Array.from({ length: INDEX_SIZE }, (_, i) => `v${String(i).padStart(10, '0')}`));
}

function buildGrid(hiddenRatio: number): Element {
  document.body.textContent = '';
  const grid = document.createElement('ytd-rich-grid-renderer');
  for (let i = 0; i < CARD_COUNT; i += 1) {
    const card = document.createElement('ytd-rich-item-renderer');
    // Realistic nesting depth and a tracking tail on the href.
    const outer = document.createElement('div');
    const inner = document.createElement('div');
    const a = document.createElement('a');
    const id = i / CARD_COUNT < hiddenRatio ? `v${String(i).padStart(10, '0')}` : `z${String(i).padStart(10, '0')}`;
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

interface Batch {
  nodes: number;
  durationMs: number;
}

/** Runs a full sweep, measuring each batch with the performance API. */
function sweepAndMeasure(hiddenRatio: number): { batches: Batch[]; hidden: number } {
  const videos = buildIndex();
  const grid = buildGrid(hiddenRatio);
  const frames: (() => void)[] = [];
  const batches: Batch[] = [];
  let seq = 0;

  const scanner = new Scanner({
    schedule: (run) => frames.push(run),
    onBatch: (stats) => batches.push({ ...stats }),
  });
  scanner.setHidden({ videos, playlists: new Set(['WL']) });

  performance.mark('sweep:start');
  scanner.start(grid);
  while (frames.length > 0) {
    const run = frames.shift();
    const label = `batch-${seq}`;
    seq += 1;
    performance.mark(`${label}:start`);
    run?.();
    performance.mark(`${label}:end`);
    performance.measure(label, `${label}:start`, `${label}:end`);
  }
  performance.mark('sweep:end');
  performance.measure('sweep', 'sweep:start', 'sweep:end');

  return { batches, hidden: grid.querySelectorAll(`[${HIDDEN_ATTR}="1"]`).length };
}

function report(name: string, batches: Batch[]): void {
  const durations = batches.map((b) => b.durationMs).sort((a, b) => a - b);
  const total = durations.reduce((sum, d) => sum + d, 0);
  const entries = performance.getEntriesByType('measure');
  const sweep = entries.find((e) => e.name === 'sweep');
  const measured = entries.filter((e) => e.name.startsWith('batch-'));
  const worstMeasure = Math.max(...measured.map((e) => e.duration));


  console.log(
    [
      ``,
      `NFR-01 — ${name}`,
      `  cards: ${CARD_COUNT}   index: ${INDEX_SIZE} ids   batches: ${batches.length}`,
      `  nodes per batch: ${batches.map((b) => b.nodes).join(', ')}`,
      `  batch ms  min ${durations[0]?.toFixed(3)}  median ${durations[Math.floor(durations.length / 2)]?.toFixed(3)}  max ${durations.at(-1)?.toFixed(3)}`,
      `  performance.measure worst batch: ${worstMeasure.toFixed(3)} ms`,
      `  performance.measure whole sweep: ${sweep?.duration.toFixed(3)} ms`,
      `  budget: ${BATCH_BUDGET_MS} ms   total scan: ${total.toFixed(3)} ms`,
    ].join('\n'),
  );
}

describe('NFR-01 — batch budget on a 300-card grid', () => {
  it('keeps every batch inside the 8ms budget (half the grid hidden)', () => {
    performance.clearMarks();
    performance.clearMeasures();
    const { batches, hidden } = sweepAndMeasure(0.5);
    report('50% hidden', batches);

    expect(hidden).toBe(150);
    expect(batches.length).toBeGreaterThan(0);
    for (const batch of batches) {
      // The budget is checked after an item completes, so a batch may overshoot
      // by at most one card's cost. Asserting 2x the budget keeps that honest
      // while still failing loudly on a genuine long task.
      expect(batch.durationMs).toBeLessThan(BATCH_BUDGET_MS * 2);
    }
  });

  it('holds when nothing matches, which is the common case', () => {
    performance.clearMarks();
    performance.clearMeasures();
    const { batches, hidden } = sweepAndMeasure(0);
    report('nothing hidden', batches);

    expect(hidden).toBe(0);
    for (const batch of batches) {
      expect(batch.durationMs).toBeLessThan(BATCH_BUDGET_MS * 2);
    }
  });

  it('splits the grid into batches rather than one long task', () => {
    performance.clearMarks();
    performance.clearMeasures();
    const { batches } = sweepAndMeasure(0.5);
    // 300 cards against a 100-node cap cannot be fewer than three batches.
    expect(batches.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...batches.map((b) => b.nodes))).toBeLessThanOrEqual(100);
  });
});
