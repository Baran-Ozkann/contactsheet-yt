// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { Scanner, collectCandidates, findGridContainer, isCandidate } from '../../src/content/scanner.js';
import { clearSeen, isHidden, unhideAll } from '../../src/content/hider.js';
import { HIDDEN_ATTR, SEEN_ATTR } from '../../src/content/selectors.js';

const HIDDEN_VIDEO = 'dQw4w9WgXcQ';
const VISIBLE_VIDEO = 'aBcDeFgHiJk';

/**
 * Two layout variants, per spec §8. Variant A is the current rich grid; variant
 * B is the lockup-based markup YouTube A/B tests, with none of the ytd-* names.
 */
type Variant = 'A' | 'B' | 'C';

const ITEM_TAG: Record<Variant, string> = {
  A: 'ytd-rich-item-renderer',
  B: 'yt-lockup-view-model',
  // Variant C is a shape none of the selectors know, so it exercises the §5.3
  // generic fallback end to end rather than only in isolation.
  C: 'yt-future-grid-item',
};

function videoCard(doc: Document, variant: Variant, id: string): Element {
  const el = doc.createElement(ITEM_TAG[variant]);
  const a = doc.createElement('a');
  a.setAttribute('href', `/watch?v=${id}&pp=ygUKdGVzdA%3D%3D`);
  const thumb = doc.createElement('div'); // identity must survive nesting
  thumb.append(a);
  el.append(thumb);
  return el;
}

function playlistCard(doc: Document, variant: Variant, listId: string): Element {
  const el = doc.createElement(
    variant === 'A' ? 'ytd-rich-section-renderer' : variant === 'B' ? 'yt-lockup-view-model' : 'yt-future-shelf',
  );
  const a = doc.createElement('a');
  a.setAttribute('href', `/playlist?list=${listId}`);
  el.append(a);
  return el;
}

/** A card shape the selector list does not know — exercises the §5.3 fallback. */
function unknownCard(doc: Document, id: string): Element {
  const el = doc.createElement('yt-some-future-renderer');
  const a = doc.createElement('a');
  a.setAttribute('href', `/watch?v=${id}`);
  el.append(a);
  return el;
}

function buildGrid(): { grid: Element } {
  document.body.textContent = '';
  const grid = document.createElement('ytd-rich-grid-renderer');
  document.body.append(grid);
  return { grid };
}

function makeScanner(): Scanner {
  // Drain synchronously so assertions do not race the frame scheduler.
  const pending: (() => void)[] = [];
  const scanner = new Scanner({ schedule: (run) => pending.push(run) });
  const originalStart = scanner.start.bind(scanner);
  (scanner as unknown as { start: (c: Element) => void }).start = (c: Element): void => {
    originalStart(c);
    while (pending.length > 0) pending.shift()?.();
  };
  (scanner as unknown as { flush: () => void }).flush = (): void => {
    while (pending.length > 0) pending.shift()?.();
  };
  return scanner;
}

const hidden = {
  videos: new Set([HIDDEN_VIDEO]),
  playlists: new Set(['WL']),
};

beforeEach(() => {
  document.body.textContent = '';
});

describe.each<Variant>(['A', 'B', 'C'])('scanner over layout variant %s', (variant) => {
  it('hides a video card in the index and leaves the others alone', () => {
    const { grid } = buildGrid();
    const target = videoCard(document, variant, HIDDEN_VIDEO);
    const other = videoCard(document, variant, VISIBLE_VIDEO);
    grid.append(target, other);

    const scanner = makeScanner();
    scanner.setHidden(hidden);
    scanner.start(grid);

    expect(isHidden(target)).toBe(true);
    expect(isHidden(other)).toBe(false);
  });

  it('hides a playlist card pointing at a hidden playlist', () => {
    const { grid } = buildGrid();
    const target = playlistCard(document, variant, 'WL');
    const other = playlistCard(document, variant, 'PLsomethingelse');
    grid.append(target, other);

    const scanner = makeScanner();
    scanner.setHidden(hidden);
    scanner.start(grid);

    expect(isHidden(target)).toBe(true);
    expect(isHidden(other)).toBe(false);
  });
});

describe('marking never mutates structure (spec §5.1)', () => {
  it('leaves the node in the tree, with no inline style and no class', () => {
    const { grid } = buildGrid();
    const target = videoCard(document, 'A', HIDDEN_VIDEO);
    grid.append(target);

    const scanner = makeScanner();
    scanner.setHidden(hidden);
    scanner.start(grid);

    expect(target.isConnected).toBe(true);
    expect(grid.children).toHaveLength(1);
    expect(target.getAttribute('style')).toBeNull();
    expect(target.className).toBe('');
    // The only marks are our own attributes.
    expect(target.getAttribute(HIDDEN_ATTR)).toBe('1');
  });

  it('keeps sibling order intact, so the grid cannot gap', () => {
    const { grid } = buildGrid();
    const cards = [VISIBLE_VIDEO, HIDDEN_VIDEO, VISIBLE_VIDEO].map((id, i) => {
      const el = videoCard(document, 'A', id);
      el.setAttribute('data-pos', String(i));
      return el;
    });
    grid.append(...cards);

    const scanner = makeScanner();
    scanner.setHidden(hidden);
    scanner.start(grid);

    expect([...grid.children].map((c) => c.getAttribute('data-pos'))).toEqual(['0', '1', '2']);
  });
});

describe('infinite scroll', () => {
  it('judges cards appended after the observer attached', async () => {
    const { grid } = buildGrid();
    const scanner = makeScanner();
    scanner.setHidden(hidden);
    scanner.start(grid);

    const later = videoCard(document, 'A', HIDDEN_VIDEO);
    grid.append(later);

    // MutationObserver callbacks are microtask-scheduled.
    await Promise.resolve();
    (scanner as unknown as { flush: () => void }).flush();

    expect(isHidden(later)).toBe(true);
  });

  it('stays correct across five appended pages', async () => {
    const { grid } = buildGrid();
    const scanner = makeScanner();
    scanner.setHidden(hidden);
    scanner.start(grid);

    const targets: Element[] = [];
    for (let pageNo = 0; pageNo < 5; pageNo += 1) {
      const page = document.createElement('div');
      for (let i = 0; i < 20; i += 1) {
        const isTarget = i % 4 === 0;
        const card = videoCard(document, 'A', isTarget ? HIDDEN_VIDEO : VISIBLE_VIDEO);
        if (isTarget) targets.push(card);
        page.append(card);
      }
      grid.append(page);
      await Promise.resolve();
      (scanner as unknown as { flush: () => void }).flush();
    }

    expect(targets).toHaveLength(25);
    expect(targets.every(isHidden)).toBe(true);
    expect(grid.querySelectorAll(`[${HIDDEN_ATTR}="1"]`)).toHaveLength(25);
  });
});

describe('selector fallback (spec §5.3)', () => {
  it('still judges a card whose renderer name we do not know', () => {
    const { grid } = buildGrid();
    const future = unknownCard(document, HIDDEN_VIDEO);
    grid.append(future);

    const scanner = makeScanner();
    scanner.setHidden(hidden);
    scanner.start(grid);

    expect(isHidden(future)).toBe(true);
  });

  it('hides nothing at all when no card matches the index', () => {
    const { grid } = buildGrid();
    grid.append(unknownCard(document, VISIBLE_VIDEO), videoCard(document, 'A', VISIBLE_VIDEO));

    const scanner = makeScanner();
    scanner.setHidden(hidden);
    scanner.start(grid);

    // The engine must not get more aggressive when it recognises little.
    expect(grid.querySelectorAll(`[${HIDDEN_ATTR}="1"]`)).toHaveLength(0);
  });

  it('leaves a card with no identifiable link untouched', () => {
    const { grid } = buildGrid();
    const chrome = document.createElement('ytd-rich-section-renderer');
    chrome.append(document.createElement('span'));
    grid.append(chrome);

    const scanner = makeScanner();
    scanner.setHidden(hidden);
    scanner.start(grid);

    expect(isHidden(chrome)).toBe(false);
  });
});

describe('master toggle (FR-08)', () => {
  it('unhideAll restores every card without touching the tree', () => {
    const { grid } = buildGrid();
    const target = videoCard(document, 'A', HIDDEN_VIDEO);
    grid.append(target);

    const scanner = makeScanner();
    scanner.setHidden(hidden);
    scanner.start(grid);
    expect(isHidden(target)).toBe(true);

    const restored = unhideAll(document);
    expect(restored).toBe(1);
    expect(isHidden(target)).toBe(false);
    expect(target.isConnected).toBe(true);
    expect(target.getAttribute(HIDDEN_ATTR)).toBeNull();
  });

  it('re-judges after the hidden set changes', () => {
    const { grid } = buildGrid();
    const card = videoCard(document, 'A', VISIBLE_VIDEO);
    grid.append(card);

    const scanner = makeScanner();
    scanner.setHidden(hidden);
    scanner.start(grid);
    expect(isHidden(card)).toBe(false);

    // The video later joins a hidden playlist. Without clearSeen the card would
    // be skipped as already judged.
    clearSeen(document);
    scanner.setHidden({ videos: new Set([VISIBLE_VIDEO]), playlists: new Set() });
    scanner.start(grid);

    expect(isHidden(card)).toBe(true);
  });

  it('leaves no attributes behind after teardown (NFR-07)', () => {
    const { grid } = buildGrid();
    grid.append(videoCard(document, 'A', HIDDEN_VIDEO));

    const scanner = makeScanner();
    scanner.setHidden(hidden);
    scanner.start(grid);
    scanner.stop();

    unhideAll(document);
    clearSeen(document);

    expect(document.querySelectorAll(`[${HIDDEN_ATTR}]`)).toHaveLength(0);
    expect(document.querySelectorAll(`[${SEEN_ATTR}]`)).toHaveLength(0);
  });
});

describe('debug overlay (FR-09)', () => {
  it('marks hidden cards for the overlay instead of plain hiding', () => {
    const { grid } = buildGrid();
    const target = videoCard(document, 'A', HIDDEN_VIDEO);
    grid.append(target);

    const scanner = makeScanner();
    scanner.setHidden(hidden);
    scanner.setDebug(true);
    scanner.start(grid);

    expect(target.getAttribute(HIDDEN_ATTR)).toBe('1');
    expect(target.getAttribute('data-cs-debug')).toBe('1');
  });
});

describe('helpers', () => {
  it('finds the grid container', () => {
    const { grid } = buildGrid();
    expect(findGridContainer(document)).toBe(grid);
  });

  it('returns null when there is no grid', () => {
    document.body.textContent = '';
    expect(findGridContainer(document)).toBeNull();
  });

  it('recognises known and unknown card shapes', () => {
    expect(isCandidate(videoCard(document, 'A', HIDDEN_VIDEO))).toBe(true);
    expect(isCandidate(unknownCard(document, HIDDEN_VIDEO))).toBe(true);
    expect(isCandidate(document.createElement('div'))).toBe(false);
  });

  it('collects each candidate once', () => {
    const { grid } = buildGrid();
    grid.append(videoCard(document, 'A', HIDDEN_VIDEO), videoCard(document, 'A', VISIBLE_VIDEO));
    expect(collectCandidates(grid)).toHaveLength(2);
  });
});
