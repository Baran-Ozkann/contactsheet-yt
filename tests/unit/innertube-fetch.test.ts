import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extractPlaylistTitle,
  fetchContinuation,
  fetchPlaylistHtml,
} from '../../src/content/innertube.js';

const CONFIG = { apiKey: 'AIzaSyAO_Fake_Key_For_Tests_123', clientVersion: '2.20260911.01.00' };

interface Call {
  url: string;
  init: RequestInit | undefined;
}

let calls: Call[];

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>): void {
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return impl(url, init);
  });
}

function ok(body: string): Promise<Response> {
  return Promise.resolve({ ok: true, text: () => Promise.resolve(body) } as Response);
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchPlaylistHtml', () => {
  it('requests the playlist page with credentials', async () => {
    stubFetch(() => ok('<html></html>'));
    await fetchPlaylistHtml('PLabc123');
    expect(calls[0]?.url).toBe('https://www.youtube.com/playlist?list=PLabc123');
    expect(calls[0]?.init?.credentials).toBe('include');
  });

  it('sends no Authorization header (ADR-0002, spec §7 rule 15)', async () => {
    stubFetch(() => ok('<html></html>'));
    await fetchPlaylistHtml('PLabc123');
    expect(calls[0]?.init?.headers).toBeUndefined();
  });

  it('refuses an invalid playlist id without making a request', async () => {
    stubFetch(() => ok(''));
    expect(await fetchPlaylistHtml('not a valid id!')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('returns null on a non-ok response', async () => {
    stubFetch(() => Promise.resolve({ ok: false, text: () => Promise.resolve('') } as Response));
    expect(await fetchPlaylistHtml('PLabc123')).toBeNull();
  });

  it('returns null when the request throws, including on abort', async () => {
    stubFetch(() => Promise.reject(new Error('aborted')));
    expect(await fetchPlaylistHtml('PLabc123')).toBeNull();
  });
});

describe('fetchContinuation', () => {
  it('posts the ADR-0002 body to the browse endpoint', async () => {
    stubFetch(() => ok('{"ok":true}'));
    await fetchContinuation('TOKEN', CONFIG);
    expect(calls[0]?.url).toBe(
      `https://www.youtube.com/youtubei/v1/browse?key=${CONFIG.apiKey}`,
    );
    expect(calls[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      context: { client: { clientName: 'WEB', clientVersion: CONFIG.clientVersion } },
      continuation: 'TOKEN',
    });
  });

  it('sends Content-Type and nothing else — no signature, ever', async () => {
    stubFetch(() => ok('{}'));
    await fetchContinuation('TOKEN', CONFIG);
    expect(calls[0]?.init?.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('parses the response through the bounded parser', async () => {
    stubFetch(() => ok('{"a":1}'));
    expect(await fetchContinuation('TOKEN', CONFIG)).toEqual({ a: 1 });
  });

  it('returns undefined on a non-ok response, so the chain just stops', async () => {
    stubFetch(() => Promise.resolve({ ok: false, text: () => Promise.resolve('') } as Response));
    expect(await fetchContinuation('TOKEN', CONFIG)).toBeUndefined();
  });

  it('returns undefined on malformed json rather than throwing', async () => {
    stubFetch(() => ok('{"a":'));
    expect(await fetchContinuation('TOKEN', CONFIG)).toBeUndefined();
  });
});

describe('no request path reads cookies', () => {
  it('never touches document.cookie', async () => {
    const cookie = vi.fn(() => 'SAPISID=secret');
    vi.stubGlobal('document', { get cookie() { return cookie(); } });
    stubFetch(() => ok('<html></html>'));
    await fetchPlaylistHtml('PLabc123');
    await fetchContinuation('TOKEN', CONFIG);
    expect(cookie).not.toHaveBeenCalled();
  });
});

describe('extractPlaylistTitle', () => {
  it('reads the header shape', () => {
    expect(
      extractPlaylistTitle({ header: { playlistHeaderRenderer: { title: { simpleText: 'Music' } } } }),
    ).toBe('Music');
  });

  it('reads the metadata and microformat shapes', () => {
    expect(extractPlaylistTitle({ metadata: { playlistMetadataRenderer: { title: 'Saved' } } })).toBe(
      'Saved',
    );
    expect(
      extractPlaylistTitle({ microformat: { microformatDataRenderer: { title: 'Later' } } }),
    ).toBe('Later');
  });

  it('returns null for an unrecognised shape, so the popup shows the id', () => {
    expect(extractPlaylistTitle({ contents: [] })).toBeNull();
    expect(extractPlaylistTitle(null)).toBeNull();
    expect(extractPlaylistTitle({ header: { playlistHeaderRenderer: { title: {} } } })).toBeNull();
  });

  it('bounds an over-long title', () => {
    const data = { metadata: { playlistMetadataRenderer: { title: 'x'.repeat(5000) } } };
    expect(extractPlaylistTitle(data)).toHaveLength(200);
  });
});
