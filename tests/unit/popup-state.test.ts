import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addPlaylist,
  buildPopupState,
  layerFor,
  removePlaylist,
  resetSyncState,
  setPlaylistHidden,
} from '../../src/background/sync.js';
import { readIndex, writeIndex } from '../../src/core/index-store.js';
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

describe('layerFor (spec §4.0)', () => {
  it('reports L0 when there is no index', () => {
    expect(layerFor(null)).toBe('L0');
  });

  it('reports L0 for an index holding nothing', () => {
    expect(layerFor({ playlistId: 'WL', videoIds: [], syncedAt: 1, complete: true })).toBe('L0');
  });

  it('reports L1 for a partial index', () => {
    expect(layerFor({ playlistId: 'WL', videoIds: [A], syncedAt: 1, complete: false })).toBe('L1');
  });

  it('reports L2 for a complete index', () => {
    expect(layerFor({ playlistId: 'WL', videoIds: [A], syncedAt: 1, complete: true })).toBe('L2');
  });
});

describe('buildPopupState', () => {
  it('is empty and safe with nothing configured', async () => {
    const state = await buildPopupState();
    expect(state.playlists).toEqual([]);
    expect(state.hiddenPlaylistCount).toBe(0);
    expect(state.hiddenVideoCount).toBe(0);
    expect(state.enabled).toBe(true);
  });

  it('resolves a row from settings plus index', async () => {
    await writeSettings({
      ...DEFAULT_SETTINGS,
      playlists: { WL: { title: 'Watch later', hidden: true, itemCount: 2, lastSyncedAt: 99 } },
    });
    await writeIndex({ playlistId: 'WL', videoIds: [A, B], syncedAt: 99, complete: true });

    const state = await buildPopupState();
    expect(state.playlists[0]).toEqual({
      id: 'WL',
      title: 'Watch later',
      hidden: true,
      itemCount: 2,
      indexedCount: 2,
      complete: true,
      layer: 'L2',
      lastSyncedAt: 99,
    });
  });

  it('counts hidden videos only from playlists actually marked hidden', async () => {
    await writeSettings({
      ...DEFAULT_SETTINGS,
      playlists: {
        WL: { title: 'a', hidden: true, itemCount: null, lastSyncedAt: null },
        PLabc123: { title: 'b', hidden: false, itemCount: null, lastSyncedAt: null },
      },
    });
    await writeIndex({ playlistId: 'WL', videoIds: [A], syncedAt: 1, complete: true });
    await writeIndex({ playlistId: 'PLabc123', videoIds: [B], syncedAt: 1, complete: true });

    const state = await buildPopupState();
    expect(state.hiddenPlaylistCount).toBe(1);
    expect(state.hiddenVideoCount).toBe(1);
  });

  it('reports a hidden playlist with no index as L0, not as broken', async () => {
    await writeSettings({
      ...DEFAULT_SETTINGS,
      playlists: { WL: { title: 'a', hidden: true, itemCount: null, lastSyncedAt: null } },
    });
    const state = await buildPopupState();
    expect(state.playlists[0]?.layer).toBe('L0');
    expect(state.playlists[0]?.indexedCount).toBe(0);
  });

  it('reports the most recent sync across playlists', async () => {
    await writeSettings({
      ...DEFAULT_SETTINGS,
      playlists: {
        WL: { title: 'a', hidden: true, itemCount: null, lastSyncedAt: 10 },
        PLabc123: { title: 'b', hidden: true, itemCount: null, lastSyncedAt: 50 },
      },
    });
    expect((await buildPopupState()).lastSyncedAt).toBe(50);
  });

  it('degrades to L0 rather than claiming completeness when storage fails', async () => {
    await writeSettings({
      ...DEFAULT_SETTINGS,
      playlists: { WL: { title: 'a', hidden: true, itemCount: null, lastSyncedAt: null } },
    });
    await writeIndex({ playlistId: 'WL', videoIds: [A], syncedAt: 1, complete: true });
    storage.failing = true;
    // readSettings also fails, so this is the fully-degraded case.
    const state = await buildPopupState();
    expect(state.playlists).toEqual([]);
  });
});

describe('playlist mutations', () => {
  it('adds a playlist hidden by default, titled with its id until synced', async () => {
    expect(await addPlaylist('PLabc123')).toBe(true);
    const settings = await readSettings();
    expect(settings.playlists.PLabc123).toEqual({
      title: 'PLabc123',
      hidden: true,
      itemCount: null,
      lastSyncedAt: null,
    });
  });

  it('does not re-add an existing playlist', async () => {
    await addPlaylist('PLabc123');
    expect(await addPlaylist('PLabc123')).toBe(false);
  });

  it('refuses an invalid id', async () => {
    expect(await addPlaylist('not a valid id!')).toBe(false);
    expect(Object.keys((await readSettings()).playlists)).toEqual([]);
  });

  it('removing a playlist also drops its index', async () => {
    await addPlaylist('WL');
    await writeIndex({ playlistId: 'WL', videoIds: [A], syncedAt: 1, complete: true });
    await removePlaylist('WL');
    expect((await readSettings()).playlists.WL).toBeUndefined();
    expect(await readIndex('WL')).toBeNull();
  });

  it('toggles hidden without touching anything else', async () => {
    await addPlaylist('WL');
    await setPlaylistHidden('WL', false);
    expect((await readSettings()).playlists.WL?.hidden).toBe(false);
    await setPlaylistHidden('WL', true);
    expect((await readSettings()).playlists.WL?.hidden).toBe(true);
  });

  it('ignores a toggle for a playlist that is not configured', async () => {
    await setPlaylistHidden('WL', true);
    expect((await readSettings()).playlists.WL).toBeUndefined();
  });
});
