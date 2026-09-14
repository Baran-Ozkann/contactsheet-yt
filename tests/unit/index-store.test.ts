import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildHiddenVideoSet,
  deleteIndex,
  indexKey,
  listIndexedPlaylistIds,
  pruneIndexes,
  readIndex,
  writeIndex,
} from '../../src/core/index-store.js';
import { DEFAULT_SETTINGS, type Settings } from '../../src/core/types.js';
import { installFakeChrome, type FakeStorage } from '../helpers/fake-chrome.js';

const A = 'dQw4w9WgXcQ';
const B = 'aBcDeFgHiJk';
const C = 'zYxWvUtSrQp';

function settingsWith(playlists: Settings['playlists']): Settings {
  return { ...DEFAULT_SETTINGS, playlists };
}

function entry(hidden: boolean, title = 't'): Settings['playlists'][string] {
  return { title, hidden, itemCount: null, lastSyncedAt: null };
}

describe('index store', () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = installFakeChrome();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses one key per playlist', () => {
    expect(indexKey('WL')).toBe('index:WL');
  });

  it('round-trips an entry', async () => {
    await writeIndex({ playlistId: 'WL', videoIds: [A, B], syncedAt: 10, complete: true });
    expect(await readIndex('WL')).toEqual({
      playlistId: 'WL',
      videoIds: [A, B],
      syncedAt: 10,
      complete: true,
    });
  });

  it('returns null for an unknown playlist', async () => {
    expect(await readIndex('WL')).toBeNull();
  });

  it('returns null rather than throwing when storage fails', async () => {
    storage.failing = true;
    expect(await readIndex('WL')).toBeNull();
  });

  it('refuses to write under an invalid playlist id', async () => {
    await writeIndex({ playlistId: 'not a valid id!', videoIds: [A], syncedAt: 1, complete: true });
    expect(Object.keys(storage.data)).toHaveLength(0);
  });

  it('sanitizes on write, so storage never holds a bad id', async () => {
    await writeIndex({
      playlistId: 'WL',
      videoIds: [A, 'junk', A],
      syncedAt: 1,
      complete: true,
    });
    const stored = storage.data['index:WL'] as { videoIds: string[]; complete: boolean };
    expect(stored.videoIds).toEqual([A]);
    expect(stored.complete).toBe(false);
  });

  it('deletes an entry', async () => {
    await writeIndex({ playlistId: 'WL', videoIds: [A], syncedAt: 1, complete: true });
    await deleteIndex('WL');
    expect(await readIndex('WL')).toBeNull();
  });

  it('lists only index keys, ignoring other storage', async () => {
    await writeIndex({ playlistId: 'WL', videoIds: [A], syncedAt: 1, complete: true });
    await writeIndex({ playlistId: 'PLabc123', videoIds: [B], syncedAt: 1, complete: true });
    storage.data.settings = { enabled: true };
    storage.data.meta = { v: 1 };
    expect((await listIndexedPlaylistIds()).sort()).toEqual(['PLabc123', 'WL']);
  });
});

describe('buildHiddenVideoSet', () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = installFakeChrome();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('merges the ids of every hidden playlist', async () => {
    await writeIndex({ playlistId: 'WL', videoIds: [A, B], syncedAt: 1, complete: true });
    await writeIndex({ playlistId: 'PLabc123', videoIds: [C], syncedAt: 1, complete: true });
    const set = await buildHiddenVideoSet(
      settingsWith({ WL: entry(true), PLabc123: entry(true) }),
    );
    expect([...set].sort()).toEqual([A, B, C].sort());
  });

  it('ignores playlists that are not marked hidden', async () => {
    await writeIndex({ playlistId: 'WL', videoIds: [A], syncedAt: 1, complete: true });
    await writeIndex({ playlistId: 'PLabc123', videoIds: [C], syncedAt: 1, complete: true });
    const set = await buildHiddenVideoSet(
      settingsWith({ WL: entry(true), PLabc123: entry(false) }),
    );
    expect([...set]).toEqual([A]);
  });

  it('is empty when nothing is marked hidden', async () => {
    await writeIndex({ playlistId: 'WL', videoIds: [A], syncedAt: 1, complete: true });
    const set = await buildHiddenVideoSet(settingsWith({ WL: entry(false) }));
    expect(set.size).toBe(0);
  });

  it('contributes nothing for a hidden playlist that has no index yet', async () => {
    const set = await buildHiddenVideoSet(settingsWith({ WL: entry(true) }));
    expect(set.size).toBe(0);
  });

  it('hides nothing when storage fails, rather than hiding wrongly', async () => {
    await writeIndex({ playlistId: 'WL', videoIds: [A, B], syncedAt: 1, complete: true });
    storage.failing = true;
    const set = await buildHiddenVideoSet(settingsWith({ WL: entry(true) }));
    expect(set.size).toBe(0);
  });

  it('skips a corrupt stored entry without losing the healthy ones', async () => {
    await writeIndex({ playlistId: 'WL', videoIds: [A], syncedAt: 1, complete: true });
    storage.data['index:PLabc123'] = 'corrupted';
    const set = await buildHiddenVideoSet(
      settingsWith({ WL: entry(true), PLabc123: entry(true) }),
    );
    expect([...set]).toEqual([A]);
  });

  it('uses a Set so matching stays O(1) per card', async () => {
    await writeIndex({ playlistId: 'WL', videoIds: [A], syncedAt: 1, complete: true });
    const set = await buildHiddenVideoSet(settingsWith({ WL: entry(true) }));
    expect(set).toBeInstanceOf(Set);
    expect(set.has(A)).toBe(true);
    expect(set.has(C)).toBe(false);
  });
});

describe('pruneIndexes', () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = installFakeChrome();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('removes indexes for playlists the user no longer tracks', async () => {
    await writeIndex({ playlistId: 'WL', videoIds: [A], syncedAt: 1, complete: true });
    await writeIndex({ playlistId: 'PLabc123', videoIds: [C], syncedAt: 1, complete: true });
    await pruneIndexes(settingsWith({ WL: entry(false) }));
    expect(await listIndexedPlaylistIds()).toEqual(['WL']);
  });

  it('leaves storage alone when nothing is stale', async () => {
    await writeIndex({ playlistId: 'WL', videoIds: [A], syncedAt: 1, complete: true });
    await pruneIndexes(settingsWith({ WL: entry(true) }));
    expect(await listIndexedPlaylistIds()).toEqual(['WL']);
    expect(storage.data['index:WL']).toBeDefined();
  });
});
