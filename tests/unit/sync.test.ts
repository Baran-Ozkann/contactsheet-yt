import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptEntries,
  findYouTubeTab,
  persistEntries,
  resetSyncState,
  serializeWrite,
  startSync,
} from '../../src/background/sync.js';
import { readIndex } from '../../src/core/index-store.js';
import { readSettings, writeSettings } from '../../src/core/settings.js';
import { DEFAULT_SETTINGS } from '../../src/core/types.js';
import { installFakeChrome, type FakeStorage } from '../helpers/fake-chrome.js';

const A = 'dQw4w9WgXcQ';
const B = 'aBcDeFgHiJk';

let storage: FakeStorage;

beforeEach(() => {
  storage = installFakeChrome();
  resetSyncState();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('serializeWrite', () => {
  it('runs tasks one after another, never interleaved', async () => {
    const order: string[] = [];
    const task = (name: string) => async (): Promise<void> => {
      order.push(`${name}:start`);
      await Promise.resolve();
      order.push(`${name}:end`);
    };
    await Promise.all([serializeWrite(task('a')), serializeWrite(task('b'))]);
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });

  it('keeps the queue alive after a task rejects', async () => {
    await expect(serializeWrite(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(serializeWrite(() => Promise.resolve('next'))).resolves.toBe('next');
  });
});

describe('findYouTubeTab', () => {
  it('finds a tab with an id', async () => {
    storage.tabs = [{ url: 'https://www.youtube.com/' }, { id: 7, url: 'https://www.youtube.com/' }];
    expect((await findYouTubeTab())?.id).toBe(7);
  });

  it('returns undefined when there is no tab', async () => {
    storage.tabs = [];
    expect(await findYouTubeTab()).toBeUndefined();
  });
});

describe('acceptEntries — content script data is re-validated (§7.8)', () => {
  it('keeps well-formed entries', () => {
    const entries = acceptEntries([
      { playlistId: 'WL', videoIds: [A], syncedAt: 5, complete: true },
    ]);
    expect(entries).toEqual([{ playlistId: 'WL', videoIds: [A], syncedAt: 5, complete: true }]);
  });

  it('drops entries with an invalid playlist id', () => {
    expect(acceptEntries([{ playlistId: 'not valid!', videoIds: [A] }])).toEqual([]);
    expect(acceptEntries([{ videoIds: [A] }])).toEqual([]);
  });

  it('strips invalid video ids and clears the completeness claim', () => {
    const entries = acceptEntries([
      { playlistId: 'WL', videoIds: [A, 'junk'], syncedAt: 1, complete: true },
    ]);
    expect(entries[0]?.videoIds).toEqual([A]);
    expect(entries[0]?.complete).toBe(false);
  });

  it('returns empty for anything that is not a list', () => {
    for (const raw of [null, undefined, 'entries', 42, {}]) {
      expect(acceptEntries(raw)).toEqual([]);
    }
  });
});

describe('persistEntries', () => {
  it('writes each index under its own key and stamps settings', async () => {
    await writeSettings({
      ...DEFAULT_SETTINGS,
      playlists: { WL: { title: 'Later', hidden: true, itemCount: null, lastSyncedAt: null } },
    });
    await persistEntries([{ playlistId: 'WL', videoIds: [A, B], syncedAt: 999, complete: true }]);

    expect((await readIndex('WL'))?.videoIds).toEqual([A, B]);
    const settings = await readSettings();
    expect(settings.playlists.WL?.itemCount).toBe(2);
    expect(settings.playlists.WL?.lastSyncedAt).toBe(999);
  });

  it('writes the index even for a playlist not present in settings', async () => {
    await persistEntries([{ playlistId: 'WL', videoIds: [A], syncedAt: 1, complete: true }]);
    expect((await readIndex('WL'))?.videoIds).toEqual([A]);
  });
});

describe('startSync', () => {
  beforeEach(async () => {
    await writeSettings({
      ...DEFAULT_SETTINGS,
      playlists: { WL: { title: 'Later', hidden: true, itemCount: null, lastSyncedAt: null } },
    });
  });

  it('hands the job to a youtube tab and writes the result', async () => {
    storage.tabs = [{ id: 3, url: 'https://www.youtube.com/' }];
    storage.tabResponse = {
      entries: [{ playlistId: 'WL', videoIds: [A, B], syncedAt: 5, complete: true }],
    };

    const outcome = await startSync();
    expect(outcome).toEqual({ ok: true, written: 1 });
    expect(storage.sentToTabs[0]).toEqual({
      tabId: 3,
      message: { type: 'sync:run', playlistIds: ['WL'] },
    });
    expect((await readIndex('WL'))?.videoIds).toEqual([A, B]);
  });

  it('reports no-tab and writes nothing when no youtube tab is open', async () => {
    storage.tabs = [];
    expect(await startSync()).toEqual({ ok: false, reason: 'no-tab' });
    expect(await readIndex('WL')).toBeNull();
  });

  it('writes nothing when the tab never answers', async () => {
    storage.tabs = [{ id: 3, url: 'https://www.youtube.com/' }];
    storage.tabResponse = null; // sendMessage throws
    expect(await startSync()).toEqual({ ok: false, reason: 'no-response' });
    expect(await readIndex('WL')).toBeNull();
  });

  it('does nothing when no playlist is configured', async () => {
    await writeSettings({ ...DEFAULT_SETTINGS });
    expect(await startSync()).toEqual({ ok: false, reason: 'nothing-to-sync' });
  });

  it('coalesces a second sync into the running one (acceptance criterion)', async () => {
    storage.tabs = [{ id: 3, url: 'https://www.youtube.com/' }];
    storage.tabResponse = {
      entries: [{ playlistId: 'WL', videoIds: [A], syncedAt: 5, complete: true }],
    };

    const [first, second] = await Promise.all([startSync(), startSync()]);
    expect(first).toEqual(second);
    // One pass, so the tab was asked exactly once — no competing writes.
    expect(storage.sentToTabs).toHaveLength(1);
  });

  it('allows a fresh sync once the previous one finished', async () => {
    storage.tabs = [{ id: 3, url: 'https://www.youtube.com/' }];
    storage.tabResponse = {
      entries: [{ playlistId: 'WL', videoIds: [A], syncedAt: 5, complete: true }],
    };
    await startSync();
    await startSync();
    expect(storage.sentToTabs).toHaveLength(2);
  });
});
