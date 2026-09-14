import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_CONTINUATION_PAGES, MIN_REQUEST_SPACING_MS, indexPlaylist } from '../../src/content/indexer.js';

const KEY = 'AIzaSyAO_Fake_Key_For_Tests_123';
const VERSION = '2.20260911.01.00';

function videoId(n: number): string {
  return `vid${String(n).padStart(8, '0')}`;
}

/** The new lockup shape, per ADR-0002. */
function lockup(id: string): unknown {
  return { lockupViewModel: { contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: id } };
}

function tokenNode(token: string): unknown {
  return { continuationItemViewModel: { continuationCommand: { token } } };
}

function page(ids: string[], nextToken?: string): unknown {
  const contents: unknown[] = ids.map(lockup);
  if (nextToken) contents.push(tokenNode(nextToken));
  return { contents };
}

function html(data: unknown, withConfig = true): string {
  const config = withConfig
    ? `"INNERTUBE_API_KEY":"${KEY}","INNERTUBE_CLIENT_VERSION":"${VERSION}",`
    : '';
  return `<html><script>var ytcfg = {${config}"x":1};</script><script>var ytInitialData = ${JSON.stringify(data)};</script></html>`;
}

interface Server {
  /** playlist page HTML, or null to fail the request */
  pageHtml: string | null;
  /** token -> response payload; a missing token responds 500 */
  continuations: Map<string, unknown>;
  requests: string[];
}

let server: Server;
let sleeps: number[];
const sleep = (ms: number): Promise<void> => {
  sleeps.push(ms);
  return Promise.resolve();
};

beforeEach(() => {
  sleeps = [];
  server = { pageHtml: null, continuations: new Map(), requests: [] };
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    server.requests.push(url);
    if (url.includes('/playlist')) {
      if (server.pageHtml === null) return Promise.resolve({ ok: false, text: () => Promise.resolve('') } as Response);
      return Promise.resolve({ ok: true, text: () => Promise.resolve(server.pageHtml ?? '') } as Response);
    }
    const body = JSON.parse(String(init?.body)) as { continuation: string };
    const payload = server.continuations.get(body.continuation);
    if (payload === undefined) {
      return Promise.resolve({ ok: false, text: () => Promise.resolve('') } as Response);
    }
    return Promise.resolve({ ok: true, text: () => Promise.resolve(JSON.stringify(payload)) } as Response);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('indexPlaylist — happy paths', () => {
  it('indexes a single-page playlist as complete', async () => {
    server.pageHtml = html(page([videoId(1), videoId(2)]));
    const result = await indexPlaylist('PLabc123', { sleep });
    expect(result.videoIds).toEqual([videoId(1), videoId(2)]);
    expect(result.complete).toBe(true);
  });

  it('follows the continuation chain to the end', async () => {
    server.pageHtml = html(page([videoId(1)], 't1'));
    server.continuations.set('t1', page([videoId(2)], 't2'));
    server.continuations.set('t2', page([videoId(3)]));
    const result = await indexPlaylist('PLabc123', { sleep });
    expect(result.videoIds).toEqual([videoId(1), videoId(2), videoId(3)]);
    expect(result.complete).toBe(true);
  });

  it('indexes a 500+ video playlist completely (acceptance criterion)', async () => {
    const PER_PAGE = 25;
    const TOTAL = 525;
    const ids = Array.from({ length: TOTAL }, (_, i) => videoId(i));
    server.pageHtml = html(page(ids.slice(0, PER_PAGE), 'c1'));
    for (let p = 1; p * PER_PAGE < TOTAL; p += 1) {
      const slice = ids.slice(p * PER_PAGE, (p + 1) * PER_PAGE);
      const isLast = (p + 1) * PER_PAGE >= TOTAL;
      server.continuations.set(`c${p}`, page(slice, isLast ? undefined : `c${p + 1}`));
    }
    const result = await indexPlaylist('PLabc123', { sleep });
    expect(result.videoIds).toHaveLength(TOTAL);
    expect(new Set(result.videoIds).size).toBe(TOTAL);
    expect(result.complete).toBe(true);
  });

  it('reads the playlist title for display', async () => {
    const data = page([videoId(1)]) as Record<string, unknown>;
    data.metadata = { playlistMetadataRenderer: { title: 'Music' } };
    server.pageHtml = html(data);
    expect((await indexPlaylist('PLabc123', { sleep })).title).toBe('Music');
  });

  it('reports progress as pages arrive', async () => {
    server.pageHtml = html(page([videoId(1)], 't1'));
    server.continuations.set('t1', page([videoId(2)]));
    const progress: number[] = [];
    await indexPlaylist('PLabc123', { sleep, onProgress: (p) => progress.push(p.videoCount) });
    expect(progress.at(0)).toBe(1);
    expect(progress.at(-1)).toBe(2);
  });
});

describe('indexPlaylist — token selection (ADR-0002)', () => {
  it('skips a token that returns no videos and keeps the one that works', async () => {
    const data = page([videoId(1)]) as Record<string, unknown>;
    // A decoy token outside continuationItemViewModel, plus the real one inside.
    data.header = { continuationCommand: { token: 'decoy' } };
    (data.contents as unknown[]).push(tokenNode('real'));
    server.pageHtml = html(data);
    server.continuations.set('decoy', { responseContext: {}, trackingParams: 'x' });
    server.continuations.set('real', page([videoId(2)]));

    const result = await indexPlaylist('PLabc123', { sleep });
    expect(result.videoIds).toEqual([videoId(1), videoId(2)]);
    expect(result.complete).toBe(true);
  });

  it('stops cleanly when a token is repeated instead of looping forever', async () => {
    server.pageHtml = html(page([videoId(1)], 'loop'));
    // Responds with its own token again — a chain that would never terminate.
    server.continuations.set('loop', page([videoId(2)], 'loop'));
    const result = await indexPlaylist('PLabc123', { sleep });
    expect(result.videoIds).toEqual([videoId(1), videoId(2)]);
    expect(result.complete).toBe(true);
  });
});

describe('indexPlaylist — fail-open behaviour', () => {
  it('indexes nothing when the playlist page cannot be fetched', async () => {
    server.pageHtml = null;
    const result = await indexPlaylist('PLabc123', { sleep });
    expect(result.videoIds).toEqual([]);
    expect(result.complete).toBe(false);
  });

  it('indexes nothing when the page carries no parseable payload', async () => {
    server.pageHtml = '<html>signed out</html>';
    const result = await indexPlaylist('PLabc123', { sleep });
    expect(result.videoIds).toEqual([]);
    expect(result.complete).toBe(false);
  });

  it('stays at L1 with complete:false when Path 2 is unavailable (acceptance criterion)', async () => {
    // Continuations exist, but no InnerTube config -> page 1 only.
    server.pageHtml = html(page([videoId(1), videoId(2)], 't1'), false);
    const result = await indexPlaylist('PLabc123', { sleep });
    expect(result.videoIds).toEqual([videoId(1), videoId(2)]);
    expect(result.complete).toBe(false);
    expect(server.requests.filter((u) => u.includes('browse'))).toHaveLength(0);
  });

  it('keeps the pages it got when a continuation fails outright', async () => {
    server.pageHtml = html(page([videoId(1)], 't1'));
    server.continuations.set('t1', page([videoId(2)], 'dead'));
    // 'dead' is never registered, so every attempt 500s.
    const result = await indexPlaylist('PLabc123', { sleep });
    expect(result.videoIds).toEqual([videoId(1), videoId(2)]);
    expect(result.complete).toBe(false);
  });

  it('never returns more videos on a failure path than on the happy path', async () => {
    server.pageHtml = html(page([videoId(1)], 't1'));
    server.continuations.set('t1', page([videoId(2)], 't2'));
    server.continuations.set('t2', page([videoId(3)]));
    const full = await indexPlaylist('PLabc123', { sleep });

    server.continuations.delete('t2');
    const partial = await indexPlaylist('PLabc123', { sleep });

    expect(partial.videoIds.length).toBeLessThan(full.videoIds.length);
    expect(full.videoIds).toEqual(expect.arrayContaining(partial.videoIds));
  });
});

describe('indexPlaylist — request discipline (spec §4.3)', () => {
  it('waits at least the minimum spacing before each continuation', async () => {
    server.pageHtml = html(page([videoId(1)], 't1'));
    server.continuations.set('t1', page([videoId(2)]));
    await indexPlaylist('PLabc123', { sleep });
    expect(sleeps).toContain(MIN_REQUEST_SPACING_MS);
  });

  it('retries on failure with an increasing backoff, then gives up', async () => {
    server.pageHtml = html(page([videoId(1)], 'dead'));
    const result = await indexPlaylist('PLabc123', { sleep });
    const backoffs = sleeps.filter((ms) => ms !== MIN_REQUEST_SPACING_MS);
    expect(backoffs).toEqual([1_000, 2_000, 4_000]);
    expect(result.complete).toBe(false);
  });

  it('issues requests one at a time', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const original = globalThis.fetch;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        return await (original as typeof fetch)(url, init);
      } finally {
        inFlight -= 1;
      }
    });
    server.pageHtml = html(page([videoId(1)], 't1'));
    server.continuations.set('t1', page([videoId(2)], 't2'));
    server.continuations.set('t2', page([videoId(3)]));
    await indexPlaylist('PLabc123', { sleep });
    expect(maxInFlight).toBe(1);
  });

  it('stops at the page ceiling and flags the result incomplete', async () => {
    // Every page hands back a fresh token, so only the cap can stop this.
    server.pageHtml = html(page([videoId(0)], 'c0'));
    for (let i = 0; i < MAX_CONTINUATION_PAGES + 10; i += 1) {
      server.continuations.set(`c${i}`, page([videoId(i + 1)], `c${i + 1}`));
    }
    const result = await indexPlaylist('PLabc123', { sleep, maxPages: 5 });
    expect(result.complete).toBe(false);
    expect(result.videoIds).toHaveLength(6);
  });
});

describe('indexPlaylist — cancellation', () => {
  it('stops promptly when aborted and keeps what it had', async () => {
    const controller = new AbortController();
    server.pageHtml = html(page([videoId(1)], 't1'));
    server.continuations.set('t1', page([videoId(2)], 't2'));
    server.continuations.set('t2', page([videoId(3)]));

    const result = await indexPlaylist('PLabc123', {
      signal: controller.signal,
      sleep: async (ms) => {
        sleeps.push(ms);
        controller.abort();
      },
    });
    expect(result.complete).toBe(false);
    expect(result.videoIds).toEqual([videoId(1)]);
  });
});

describe('indexPlaylist — title resolution', () => {
  it('falls back to the document title when no JSON shape matches', async () => {
    // The 2026-09-14 regression: a real sync indexed its videos and still
    // showed the playlist id, because every InnerTube shape missed.
    const data = page([videoId(1)]);
    server.pageHtml = html(data).replace(
      '<html>',
      '<html><head><title>Kayıt listesi - YouTube</title></head>',
    );
    const result = await indexPlaylist('PLabc123', { sleep });
    expect(result.title).toBe('Kayıt listesi');
  });

  it('prefers a JSON title when one is present', async () => {
    const data = page([videoId(1)]) as Record<string, unknown>;
    data.metadata = { playlistMetadataRenderer: { title: 'From JSON' } };
    server.pageHtml = html(data).replace(
      '<html>',
      '<html><head><title>From HTML - YouTube</title></head>',
    );
    expect((await indexPlaylist('PLabc123', { sleep })).title).toBe('From JSON');
  });

  it('leaves the title null when neither source has one', async () => {
    server.pageHtml = html(page([videoId(1)]));
    expect((await indexPlaylist('PLabc123', { sleep })).title).toBeNull();
  });
});
