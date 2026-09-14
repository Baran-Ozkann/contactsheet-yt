import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverPlaylists, extractPlaylistSummaries } from '../../src/content/innertube.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('extractPlaylistSummaries — shapes', () => {
  it('reads the lockup playlist shape', () => {
    const data = {
      contents: [
        {
          lockupViewModel: {
            contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST',
            contentId: 'PLabc123',
            metadata: { lockupMetadataViewModel: { title: { content: 'Music' } } },
          },
        },
      ],
    };
    expect(extractPlaylistSummaries(data)).toEqual([{ id: 'PLabc123', title: 'Music' }]);
  });

  it('reads the grid renderer shape', () => {
    const data = {
      items: [{ gridPlaylistRenderer: { playlistId: 'PLabc123', title: { runs: [{ text: 'Saved' }] } } }],
    };
    expect(extractPlaylistSummaries(data)).toEqual([{ id: 'PLabc123', title: 'Saved' }]);
  });

  it('reads the list renderer shape', () => {
    const data = { items: [{ playlistRenderer: { playlistId: 'WL', title: { simpleText: 'Later' } } }] };
    expect(extractPlaylistSummaries(data)).toEqual([{ id: 'WL', title: 'Later' }]);
  });

  it('keeps the id when no title shape is recognised', () => {
    const data = { items: [{ gridPlaylistRenderer: { playlistId: 'PLabc123' } }] };
    expect(extractPlaylistSummaries(data)).toEqual([{ id: 'PLabc123', title: null }]);
  });

  it('deduplicates a playlist that renders twice', () => {
    const data = {
      a: { gridPlaylistRenderer: { playlistId: 'WL' } },
      b: { playlistRenderer: { playlistId: 'WL' } },
    };
    expect(extractPlaylistSummaries(data)).toHaveLength(1);
  });
});

describe('extractPlaylistSummaries — does not over-collect', () => {
  it('ignores a video lockup', () => {
    const data = {
      contents: [{ lockupViewModel: { contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: 'dQw4w9WgXcQ' } }],
    };
    expect(extractPlaylistSummaries(data)).toEqual([]);
  });

  it('ignores a bare playlistId outside a known renderer', () => {
    expect(extractPlaylistSummaries({ someRenderer: { playlistId: 'PLabc123' } })).toEqual([]);
  });

  it('rejects an id that fails validation', () => {
    expect(extractPlaylistSummaries({ a: { gridPlaylistRenderer: { playlistId: 'x' } } })).toEqual([]);
  });

  it('returns empty for junk', () => {
    for (const raw of [null, undefined, 'html', 42, []]) {
      expect(extractPlaylistSummaries(raw)).toEqual([]);
    }
  });
});

describe('discoverPlaylists — fail-open', () => {
  it('requests the library page with credentials', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', (url: string) => {
      calls.push(url);
      return Promise.resolve({ ok: true, text: () => Promise.resolve('<html></html>') } as Response);
    });
    await discoverPlaylists();
    expect(calls[0]).toBe('https://www.youtube.com/feed/playlists');
  });

  it('returns empty when the request fails, so manual entry still works', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: false, text: () => Promise.resolve('') } as Response));
    expect(await discoverPlaylists()).toEqual([]);
  });

  it('returns empty when the request throws', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    expect(await discoverPlaylists()).toEqual([]);
  });

  it('returns empty when the page has no payload (signed out)', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: true, text: () => Promise.resolve('<html>signed out</html>') } as Response),
    );
    expect(await discoverPlaylists()).toEqual([]);
  });
});
