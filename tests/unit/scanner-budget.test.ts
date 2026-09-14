import { describe, expect, it } from 'vitest';
import { BATCH_BUDGET_MS, BatchQueue, shouldHide } from '../../src/content/scanner.js';

const A = 'dQw4w9WgXcQ';
const B = 'aBcDeFgHiJk';

/** Drives the queue with a fake clock and an explicit scheduler. */
function harness(opts: { costPerItem?: number; budgetMs?: number; maxPerBatch?: number } = {}) {
  let clock = 0;
  const frames: (() => void)[] = [];
  const processed: number[] = [];
  const batches: { nodes: number; durationMs: number }[] = [];

  const queue = new BatchQueue<number>(
    (item) => {
      clock += opts.costPerItem ?? 0;
      processed.push(item);
    },
    {
      ...(opts.budgetMs !== undefined ? { budgetMs: opts.budgetMs } : {}),
      ...(opts.maxPerBatch !== undefined ? { maxPerBatch: opts.maxPerBatch } : {}),
      schedule: (run) => frames.push(run),
      now: () => clock,
      onBatch: (stats) => batches.push(stats),
    },
  );

  return {
    queue,
    processed,
    batches,
    frames,
    /** Runs every frame the queue has asked for, until it stops asking. */
    runAllFrames(limit = 1000): number {
      let count = 0;
      while (frames.length > 0 && count < limit) {
        const run = frames.shift();
        run?.();
        count += 1;
      }
      return count;
    },
  };
}

describe('BatchQueue — the 8ms budget (NFR-01)', () => {
  it('defaults to the documented budget', () => {
    expect(BATCH_BUDGET_MS).toBe(8);
  });

  it('stops a batch once the budget is spent and defers the rest', () => {
    // 3ms per item against an 8ms budget: 3 items takes it to 9ms.
    const h = harness({ costPerItem: 3, budgetMs: 8 });
    h.queue.push([1, 2, 3, 4, 5, 6]);
    h.frames.shift()?.();

    expect(h.batches[0]?.nodes).toBe(3);
    expect(h.processed).toEqual([1, 2, 3]);
    expect(h.queue.size).toBe(3);
  });

  it('no single batch exceeds the budget by more than one item', () => {
    const h = harness({ costPerItem: 3, budgetMs: 8 });
    h.queue.push(Array.from({ length: 50 }, (_, i) => i));
    h.runAllFrames();
    // Each batch stops at the first check past 8ms, so the overshoot is bounded
    // by one item's cost — never an unbounded long task.
    for (const batch of h.batches) {
      expect(batch.durationMs).toBeLessThanOrEqual(8 + 3);
    }
  });

  it('carries the remainder into the next frame until drained', () => {
    const h = harness({ costPerItem: 3, budgetMs: 8 });
    h.queue.push(Array.from({ length: 10 }, (_, i) => i));
    const frames = h.runAllFrames();
    expect(frames).toBeGreaterThan(1);
    expect(h.processed).toHaveLength(10);
    expect(h.queue.size).toBe(0);
  });

  it('always advances, even when one item costs more than the whole budget', () => {
    const h = harness({ costPerItem: 100, budgetMs: 8 });
    h.queue.push([1, 2, 3]);
    h.runAllFrames();
    // Budget is checked after the first item precisely so this cannot deadlock.
    expect(h.processed).toEqual([1, 2, 3]);
  });

  it('caps a batch by node count even when items are free', () => {
    const h = harness({ costPerItem: 0, maxPerBatch: 100 });
    h.queue.push(Array.from({ length: 250 }, (_, i) => i));
    h.frames.shift()?.();
    expect(h.batches[0]?.nodes).toBe(100);
  });

  it('schedules only one frame no matter how many pushes arrive', () => {
    const h = harness({ costPerItem: 0 });
    h.queue.push([1]);
    h.queue.push([2]);
    h.queue.push([3]);
    expect(h.frames).toHaveLength(1);
  });

  it('does not schedule anything for an empty push', () => {
    const h = harness();
    h.queue.push([]);
    expect(h.frames).toHaveLength(0);
  });

  it('drops pending work when cleared', () => {
    const h = harness({ costPerItem: 0 });
    h.queue.push([1, 2, 3]);
    h.queue.clear();
    h.runAllFrames();
    expect(h.processed).toEqual([]);
  });
});

describe('shouldHide — the decision (NFR-02, NFR-04)', () => {
  const hidden = { videos: new Set([A]), playlists: new Set(['WL']) };

  it('hides a card whose video is in the index', () => {
    expect(shouldHide({ videoId: A, playlistId: null }, hidden)).toBe(true);
  });

  it('hides a card pointing at a hidden playlist', () => {
    expect(shouldHide({ videoId: null, playlistId: 'WL' }, hidden)).toBe(true);
  });

  it('tries both identities separately on a /watch card carrying a list', () => {
    expect(shouldHide({ videoId: B, playlistId: 'WL' }, hidden)).toBe(true);
    expect(shouldHide({ videoId: A, playlistId: 'PLother' }, hidden)).toBe(true);
  });

  it('shows a card that matches nothing', () => {
    expect(shouldHide({ videoId: B, playlistId: 'PLother' }, hidden)).toBe(false);
  });

  it('shows a card with no identity at all — fail open', () => {
    expect(shouldHide({ videoId: null, playlistId: null }, hidden)).toBe(false);
  });

  it('hides nothing when the index is empty', () => {
    const empty = { videos: new Set<string>(), playlists: new Set<string>() };
    expect(shouldHide({ videoId: A, playlistId: 'WL' }, empty)).toBe(false);
  });
});
