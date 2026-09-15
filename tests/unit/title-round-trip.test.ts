import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSyncJob } from '../../src/content/sync-job.js';
import {
  acceptTitles,
  addPlaylist,
  buildPopupState,
  persistEntries,
  resetSyncState,
  startSync,
} from '../../src/background/sync.js';
import { acceptEntries } from '../../src/background/sync.js';
import { readSettings } from '../../src/core/settings.js';
import { installFakeChrome, type FakeStorage } from '../helpers/fake-chrome.js';
import { PAGE_PLAYLIST_ID, PAGE_TITLE_ONLY_IN_HEAD } from '../fixtures/playlist-titles.js';

/**
 * The whole chain, content script to popup.
 *
 * A manually added playlist indexed 32 videos and kept displaying its id. The
 * extractor was fine — every unit test around it passed, and still does. The
 * title was resolved on the page and then dropped at the message boundary, and
 * no test on either side of that boundary could see it: the indexer's tests
 * asserted `result.title`, the worker's tests asserted what persistEntries did
 * with what it was handed, and nobody checked that the two were the same value.
 *
 * So this walks the real path. Only the network and chrome are stubbed; the
 * content script's reply, the worker's validation and the popup's state are all
 * the shipping code.
 */

const NAME = 'Kayıt listesi';

let storage: FakeStorage;

beforeEach(() => {
  storage = installFakeChrome();
  resetSyncState();
  vi.stubGlobal('fetch', (url: string) => {
    if (String(url).includes('/playlist')) {
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(PAGE_TITLE_ONLY_IN_HEAD),
      } as Response);
    }
    return Promise.resolve({ ok: false, text: () => Promise.resolve('') } as Response);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a resolved title reaches the popup', () => {
  it('survives the content script reply', async () => {
    const reply = await runSyncJob([PAGE_PLAYLIST_ID]);
    expect(reply.entries).toHaveLength(1);
    // The failure this pins: the reply used to carry entries and nothing else.
    expect(reply.titles[PAGE_PLAYLIST_ID]).toBe(NAME);
  });

  it('survives the worker, end to end, and replaces the id placeholder', async () => {
    await addPlaylist(PAGE_PLAYLIST_ID);
    // addPlaylist stands the id in until a sync resolves the real name.
    expect((await readSettings()).playlists[PAGE_PLAYLIST_ID]?.title).toBe(PAGE_PLAYLIST_ID);

    storage.tabs = [{ id: 1, url: 'https://www.youtube.com/' }];
    // The real reply the content script would send, through the real worker.
    storage.tabResponse = await runSyncJob([PAGE_PLAYLIST_ID]);

    const outcome = await startSync([PAGE_PLAYLIST_ID]);
    expect(outcome.ok).toBe(true);

    const state = await buildPopupState();
    const row = state.playlists.find((p) => p.id === PAGE_PLAYLIST_ID);
    expect(row?.title).toBe(NAME);
    expect(row?.title).not.toBe(PAGE_PLAYLIST_ID);
    // The rest of the sync is unaffected: this is the field that went missing.
    expect(row?.indexedCount).toBe(3);
  });

  it('does not demote a known name when a later sync resolves nothing', async () => {
    await addPlaylist(PAGE_PLAYLIST_ID);
    await persistEntries(
      [{ playlistId: PAGE_PLAYLIST_ID, videoIds: [], syncedAt: 1, complete: true }],
      { [PAGE_PLAYLIST_ID]: NAME },
    );
    // A page that gave no title must leave the stored one alone rather than
    // writing the id back over it.
    await persistEntries(
      [{ playlistId: PAGE_PLAYLIST_ID, videoIds: [], syncedAt: 2, complete: true }],
      {},
    );
    expect((await readSettings()).playlists[PAGE_PLAYLIST_ID]?.title).toBe(NAME);
  });
});

describe('acceptTitles (spec §7.8)', () => {
  it('keeps a well-formed title', () => {
    expect(acceptTitles({ [PAGE_PLAYLIST_ID]: NAME })).toEqual({ [PAGE_PLAYLIST_ID]: NAME });
  });

  it('collapses whitespace, as a multi-line <title> arrives', () => {
    expect(acceptTitles({ [PAGE_PLAYLIST_ID]: '  Uzun\n   liste  ' })).toEqual({
      [PAGE_PLAYLIST_ID]: 'Uzun liste',
    });
  });

  it('caps the length', () => {
    const long = 'x'.repeat(500);
    expect(acceptTitles({ [PAGE_PLAYLIST_ID]: long })[PAGE_PLAYLIST_ID]).toHaveLength(200);
  });

  it.each([
    ['a non-object', 42],
    ['null', null],
    ['an array', ['a']],
  ])('drops %s', (_name, raw) => {
    expect(acceptTitles(raw)).toEqual({});
  });

  it.each([
    ['an invalid id', { 'not a playlist id!': NAME }],
    ['a non-string title', { [PAGE_PLAYLIST_ID]: 12 }],
    ['an empty title', { [PAGE_PLAYLIST_ID]: '   ' }],
  ])('drops %s', (_name, raw) => {
    expect(acceptTitles(raw)).toEqual({});
  });

  it('is not fooled by a prototype-polluting key', () => {
    expect(acceptTitles(JSON.parse('{"__proto__": "pwned"}'))).toEqual({});
    expect(({} as Record<string, unknown>)['pwned']).toBeUndefined();
  });
});

describe('acceptEntries still rejects what it always did', () => {
  it('drops an entry with no usable identity', () => {
    expect(acceptEntries([{ videoIds: [] }])).toEqual([]);
  });
});
