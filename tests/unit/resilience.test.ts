import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coerceSettings, readSettings, writeSettings } from '../../src/core/settings.js';
import { buildHiddenVideoSet, writeIndex } from '../../src/core/index-store.js';
import { extractVideoIds, extractYtInitialData } from '../../src/content/innertube.js';
import { shouldHide } from '../../src/content/scanner.js';
import { DEFAULT_SETTINGS, defaultSettings } from '../../src/core/types.js';
import { installFakeChrome, type FakeStorage } from '../helpers/fake-chrome.js';

let storage: FakeStorage;

beforeEach(() => {
  storage = installFakeChrome();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Spec §9 Phase 6 — schema migration. */
describe('settings migration', () => {
  it('stamps the current schema version whatever the file claimed', () => {
    for (const version of [undefined, 0, 2, 99, '1', null]) {
      expect(coerceSettings({ schemaVersion: version }).schemaVersion).toBe(1);
    }
  });

  it('keeps usable data from an older-looking file', () => {
    const old = {
      schemaVersion: 0,
      enabled: false,
      playlists: { WL: { title: 'Watch later', hidden: true } },
    };
    const migrated = coerceSettings(old);
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.enabled).toBe(false);
    expect(migrated.playlists.WL?.hidden).toBe(true);
    // Fields the old file never had come back as safe defaults.
    expect(migrated.playlists.WL?.itemCount).toBeNull();
    expect(migrated.syncIntervalMinutes).toBe(DEFAULT_SETTINGS.syncIntervalMinutes);
  });

  it('survives a file from a hypothetical future version', () => {
    const future = {
      schemaVersion: 7,
      enabled: true,
      unknownFutureField: { nested: true },
      playlists: { WL: { title: 'a', hidden: true, futurePerPlaylistField: 1 } },
    };
    const result = coerceSettings(future);
    expect(result).toEqual({
      ...defaultSettings(),
      playlists: { WL: { title: 'a', hidden: true, itemCount: null, lastSyncedAt: null } },
    });
  });

  it('round-trips through storage without drifting', async () => {
    await writeSettings(coerceSettings({ schemaVersion: 0, enabled: false }));
    const first = await readSettings();
    await writeSettings(first);
    expect(await readSettings()).toEqual(first);
  });
});

/** Spec §9 Phase 6 — signed out. */
describe('signed out', () => {
  const SIGNED_OUT_HTML =
    '<!doctype html><html><head><title>YouTube</title></head><body>' +
    '<div>Sign in to see your playlists</div></body></html>';

  it('finds no payload in a signed-out page', () => {
    expect(extractYtInitialData(SIGNED_OUT_HTML)).toBeUndefined();
  });

  it('extracts nothing rather than throwing', () => {
    expect(extractVideoIds(extractYtInitialData(SIGNED_OUT_HTML))).toEqual([]);
  });

  it('hides nothing when a hidden playlist has no index', async () => {
    await writeSettings({
      ...defaultSettings(),
      playlists: { WL: { title: 'a', hidden: true, itemCount: null, lastSyncedAt: null } },
    });
    const set = await buildHiddenVideoSet(await readSettings());
    expect(set.size).toBe(0);
    // A card must survive an empty index — this is the whole fail-open promise.
    expect(shouldHide({ videoId: 'dQw4w9WgXcQ', playlistId: null }, { videos: set, playlists: new Set() })).toBe(
      false,
    );
  });
});

/** Spec §9 Phase 6 — zero playlists. */
describe('zero playlists', () => {
  it('produces an empty hidden set and hides nothing', async () => {
    const set = await buildHiddenVideoSet(defaultSettings());
    expect(set.size).toBe(0);
    expect(shouldHide({ videoId: 'dQw4w9WgXcQ', playlistId: 'WL' }, { videos: set, playlists: new Set() })).toBe(
      false,
    );
  });
});

/** Spec §9 Phase 6 — a very large playlist. NFR-03 caps the index at 20,000. */
describe('very large playlists', () => {
  function ids(count: number, prefix = 'v'): string[] {
    return Array.from({ length: count }, (_, i) => `${prefix}${String(i).padStart(10, '0')}`);
  }

  it('merges a 10k-video playlist into the hidden set', async () => {
    const many = ids(10_000);
    await writeSettings({
      ...defaultSettings(),
      playlists: { WL: { title: 'a', hidden: true, itemCount: many.length, lastSyncedAt: null } },
    });
    await writeIndex({ playlistId: 'WL', videoIds: many, syncedAt: 1, complete: true });

    const set = await buildHiddenVideoSet(await readSettings());
    expect(set.size).toBe(10_000);
    expect(set.has('v0000009999')).toBe(true);
  });

  it('merges two large playlists without losing either', async () => {
    await writeSettings({
      ...defaultSettings(),
      playlists: {
        WL: { title: 'a', hidden: true, itemCount: null, lastSyncedAt: null },
        PLabc123: { title: 'b', hidden: true, itemCount: null, lastSyncedAt: null },
      },
    });
    await writeIndex({ playlistId: 'WL', videoIds: ids(6_000, 'a'), syncedAt: 1, complete: true });
    await writeIndex({ playlistId: 'PLabc123', videoIds: ids(6_000, 'b'), syncedAt: 1, complete: true });

    const set = await buildHiddenVideoSet(await readSettings());
    expect(set.size).toBe(12_000);
  });

  it('caps a payload at the documented per-playlist ceiling', () => {
    const payload = {
      contents: ids(60_000).map((id) => ({
        lockupViewModel: { contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: id },
      })),
    };
    // NFR-03 / §7 rule 7: 50,000 per playlist, enforced during extraction.
    expect(extractVideoIds(payload)).toHaveLength(50_000);
  });

  it('matches in constant time against a 20k index (NFR-02)', async () => {
    const many = ids(20_000);
    await writeSettings({
      ...defaultSettings(),
      playlists: { WL: { title: 'a', hidden: true, itemCount: null, lastSyncedAt: null } },
    });
    await writeIndex({ playlistId: 'WL', videoIds: many, syncedAt: 1, complete: true });
    const set = await buildHiddenVideoSet(await readSettings());
    const hidden = { videos: set, playlists: new Set<string>() };

    // A miss must cost the same as a hit; a linear scan would not.
    const start = performance.now();
    for (let i = 0; i < 20_000; i += 1) {
      shouldHide({ videoId: 'zzzzzzzzzzz', playlistId: null }, hidden);
    }
    const misses = performance.now() - start;
    expect(misses).toBeLessThan(200);
  });

  it('keeps storage failure fail-open even at scale', async () => {
    await writeSettings({
      ...defaultSettings(),
      playlists: { WL: { title: 'a', hidden: true, itemCount: null, lastSyncedAt: null } },
    });
    await writeIndex({ playlistId: 'WL', videoIds: ids(10_000), syncedAt: 1, complete: true });
    const settings = await readSettings();
    storage.failing = true;
    expect((await buildHiddenVideoSet(settings)).size).toBe(0);
  });
});
