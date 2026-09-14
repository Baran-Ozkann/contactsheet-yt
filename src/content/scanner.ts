import { SELECTORS, firstMatch } from './selectors.js';
import { identifyElement, type CardIdentity } from './identify.js';
import { hide, isSeen, markSeen, unhide } from './hider.js';
import type { PlaylistId, VideoId } from '../core/types.js';

/**
 * Watches the homepage grid and decides, per card, whether it should be marked.
 *
 * Two constraints shape everything here. The observer is attached to the grid
 * container and never to document.body (spec §5.4) — body-level subtree
 * observation on YouTube fires on every player tick. And work is done in
 * bounded batches inside requestAnimationFrame, because NFR-01 allows no long
 * task: 8 ms per batch, then yield to the next frame.
 */

export const BATCH_BUDGET_MS = 8;
export const MAX_NODES_PER_BATCH = 100;

export interface HiddenSets {
  videos: ReadonlySet<VideoId>;
  playlists: ReadonlySet<PlaylistId>;
}

/**
 * The whole hiding decision, as a pure function. Both lookups are Set.has, so
 * the cost is O(1) per card regardless of index size (NFR-02).
 *
 * A card with no identity is left alone. That is the fail-open rule in its
 * smallest form: an unrecognised card is shown, never hidden (NFR-04).
 */
export function shouldHide(identity: CardIdentity, hidden: HiddenSets): boolean {
  if (identity.videoId !== null && hidden.videos.has(identity.videoId)) return true;
  // A /watch card can carry a list param too, so both are tried separately.
  if (identity.playlistId !== null && hidden.playlists.has(identity.playlistId)) return true;
  return false;
}

export interface BatchStats {
  nodes: number;
  durationMs: number;
}

export interface QueueOptions {
  budgetMs?: number;
  maxPerBatch?: number;
  schedule?: (run: () => void) => void;
  now?: () => number;
  onBatch?: (stats: BatchStats) => void;
}

/**
 * Drains a queue in frame-sized slices. Kept free of DOM references so the
 * budget behaviour can be tested against a fake clock and scheduler.
 */
export class BatchQueue<T> {
  private readonly pending: T[] = [];
  private scheduled = false;

  private readonly budgetMs: number;
  private readonly maxPerBatch: number;
  private readonly schedule: (run: () => void) => void;
  private readonly now: () => number;
  private readonly onBatch: ((stats: BatchStats) => void) | undefined;

  constructor(
    private readonly process: (item: T) => void,
    options: QueueOptions = {},
  ) {
    this.budgetMs = options.budgetMs ?? BATCH_BUDGET_MS;
    this.maxPerBatch = options.maxPerBatch ?? MAX_NODES_PER_BATCH;
    this.schedule = options.schedule ?? ((run): void => void requestAnimationFrame(run));
    this.now = options.now ?? ((): number => performance.now());
    this.onBatch = options.onBatch;
  }

  get size(): number {
    return this.pending.length;
  }

  push(items: Iterable<T>): void {
    for (const item of items) this.pending.push(item);
    this.ensureScheduled();
  }

  clear(): void {
    this.pending.length = 0;
  }

  private ensureScheduled(): void {
    if (this.scheduled || this.pending.length === 0) return;
    this.scheduled = true;
    this.schedule(() => this.drain());
  }

  /** One slice. Exposed so tests can step deterministically. */
  drain(): BatchStats {
    this.scheduled = false;
    const start = this.now();
    let nodes = 0;

    while (this.pending.length > 0) {
      const item = this.pending.shift();
      if (item === undefined) break;
      this.process(item);
      nodes += 1;
      // Checked after at least one item so the queue always advances, even if
      // a single card somehow costs more than the whole budget.
      if (nodes >= this.maxPerBatch) break;
      if (this.now() - start >= this.budgetMs) break;
    }

    const stats: BatchStats = { nodes, durationMs: this.now() - start };
    this.onBatch?.(stats);
    // Whatever is left rides the next frame rather than extending this one.
    this.ensureScheduled();
    return stats;
  }
}

/** Does this element look like something we can judge? Spec §5.3. */
export function isCandidate(el: Element): boolean {
  for (const slot of ['item', 'section'] as const) {
    for (const selector of SELECTORS[slot]) {
      if (el.matches(selector)) return true;
    }
  }
  // Generic fallback for A/B-tested component names: anything holding a link we
  // can identify. Note this only ever finds MORE candidates to examine — each
  // one still has to match the index before it is marked, so a selector miss
  // cannot turn into over-hiding.
  return el.querySelector('a[href*="/watch"], a[href*="/playlist"]') !== null;
}

/** Collects candidate elements from a subtree, including its root. */
export function collectCandidates(root: Element): Element[] {
  const out: Element[] = [];
  if (isCandidate(root)) out.push(root);
  for (const slot of ['item', 'section'] as const) {
    for (const selector of SELECTORS[slot]) {
      for (const el of root.querySelectorAll(selector)) out.push(el);
    }
  }
  return [...new Set(out)];
}

export function findGridContainer(root: ParentNode = document): Element | null {
  return firstMatch(root, 'grid');
}

export interface ScannerOptions extends QueueOptions {
  debug?: boolean;
}

/**
 * Owns the observer and the queue for one page view. Create on entering the
 * homepage, `stop()` on leaving — spec §5.4 forbids polling the URL.
 */
export class Scanner {
  private observer: MutationObserver | null = null;
  private readonly queue: BatchQueue<Element>;
  private hidden: HiddenSets = { videos: new Set(), playlists: new Set() };
  private debug: boolean;

  constructor(options: ScannerOptions = {}) {
    this.debug = options.debug ?? false;
    this.queue = new BatchQueue<Element>((el) => this.judge(el), options);
  }

  setHidden(hidden: HiddenSets): void {
    this.hidden = hidden;
  }

  setDebug(debug: boolean): void {
    this.debug = debug;
  }

  private judge(el: Element): void {
    if (isSeen(el)) return;
    markSeen(el);
    // Identity comes from the card's own href, parsed with the URL API rather
    // than a regex (spec §5.2).
    if (shouldHide(identifyElement(el), this.hidden)) hide(el, this.debug);
    else unhide(el);
  }

  /** Re-judges everything currently in the container. */
  sweep(container: Element): void {
    this.queue.push(collectCandidates(container));
  }

  start(container: Element): void {
    this.stop();
    this.observer = new MutationObserver((records) => {
      const added: Element[] = [];
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          added.push(...collectCandidates(node as Element));
        }
      }
      if (added.length > 0) this.queue.push(added);
    });
    this.observer.observe(container, { childList: true, subtree: true });
    this.sweep(container);
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.queue.clear();
  }

  get pending(): number {
    return this.queue.size;
  }
}
