import { vi } from 'vitest';

/**
 * A stand-in for the two requests the indexer makes: the playlist page, and
 * the unsigned InnerTube continuation (ADR-0002).
 *
 * A token the test never registers answers with a failed request — which is a
 * different thing from a token that answers with no videos, and the difference
 * is exactly what `complete` turns on.
 */
export interface FakeYouTube {
  /** Served for `/playlist`; null makes that request fail. */
  pageHtml: string | null;
  /** token -> the body it answers with. An unregistered token fails. */
  continuations: Map<string, unknown>;
  /** Every url requested, in order. */
  requests: string[];
}

export function installFakeYouTube(): FakeYouTube {
  const server: FakeYouTube = { pageHtml: null, continuations: new Map(), requests: [] };

  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    server.requests.push(url);

    if (url.includes('/playlist')) {
      const ok = server.pageHtml !== null;
      return Promise.resolve({
        ok,
        text: () => Promise.resolve(server.pageHtml ?? ''),
      } as Response);
    }

    const body = JSON.parse(String(init?.body)) as { continuation: string };
    const payload = server.continuations.get(body.continuation);
    if (payload === undefined) {
      return Promise.resolve({ ok: false, text: () => Promise.resolve('') } as Response);
    }
    return Promise.resolve({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(payload)),
    } as Response);
  });

  return server;
}
