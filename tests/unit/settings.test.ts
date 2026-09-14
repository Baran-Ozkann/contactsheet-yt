import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coerceSettings, readSettings, writeSettings } from '../../src/core/settings.js';
import { DEFAULT_SETTINGS, MIN_SYNC_INTERVAL_MINUTES } from '../../src/core/types.js';
import { installFakeChrome, type FakeStorage } from '../helpers/fake-chrome.js';

describe('coerceSettings', () => {
  it('returns defaults for values that are not objects', () => {
    for (const raw of [null, undefined, 42, 'settings', true, []]) {
      expect(coerceSettings(raw)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('fills in every missing field from an incomplete object', () => {
    expect(coerceSettings({ enabled: false })).toEqual({
      ...DEFAULT_SETTINGS,
      enabled: false,
    });
  });

  it('drops foreign fields instead of carrying them through', () => {
    const result = coerceSettings({
      enabled: true,
      evil: 'payload',
      __proto__: { polluted: true },
      schemaVersion: 99,
    });
    expect(result).toEqual(DEFAULT_SETTINGS);
    expect('evil' in result).toBe(false);
    expect(result.schemaVersion).toBe(1);
  });

  it('clamps the sync interval to the documented minimum', () => {
    expect(coerceSettings({ syncIntervalMinutes: 5 }).syncIntervalMinutes).toBe(
      MIN_SYNC_INTERVAL_MINUTES,
    );
    expect(coerceSettings({ syncIntervalMinutes: 720 }).syncIntervalMinutes).toBe(720);
  });

  it('rejects non-finite intervals that would break the alarm', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const result = coerceSettings({ syncIntervalMinutes: bad });
      expect(Number.isFinite(result.syncIntervalMinutes)).toBe(true);
      expect(result.syncIntervalMinutes).toBe(DEFAULT_SETTINGS.syncIntervalMinutes);
    }
  });

  it('keeps only entries whose key is a valid playlist id', () => {
    const result = coerceSettings({
      playlists: {
        WL: { title: 'Watch later', hidden: true, itemCount: 12, lastSyncedAt: 5 },
        'not a playlist id!': { title: 'nope', hidden: true, itemCount: 1, lastSyncedAt: 1 },
        '': { title: 'empty', hidden: true, itemCount: 1, lastSyncedAt: 1 },
      },
    });
    expect(Object.keys(result.playlists)).toEqual(['WL']);
  });

  it('repairs a corrupt playlist entry rather than dropping the playlist', () => {
    const result = coerceSettings({
      playlists: {
        PLabc123: { title: 404, hidden: 'yes', itemCount: NaN, lastSyncedAt: Infinity },
      },
    });
    expect(result.playlists.PLabc123).toEqual({
      title: 'PLabc123', // falls back to the id, never a non-string
      hidden: false, // only a literal true means hidden — fail open
      itemCount: null,
      lastSyncedAt: null,
    });
  });

  it('keeps a "__proto__" playlist id as a real entry, not a prototype write', () => {
    // Both "__proto__" and "constructor" satisfy PLAYLIST_ID_RE, and a stored
    // settings blob is user-editable, so this has to survive coercion intact.
    const result = coerceSettings(
      JSON.parse('{"playlists":{"__proto__":{"title":"evil","hidden":true},"WL":{"title":"ok"}}}'),
    );
    expect(Object.getPrototypeOf(result.playlists)).toBe(Object.prototype);
    expect(Object.keys(result.playlists).sort()).toEqual(['WL', '__proto__']);
    // An id that was never configured must not resolve through the chain.
    expect(result.playlists.title).toBeUndefined();
    expect(result.playlists.hidden).toBeUndefined();
  });

  it('defaults hiding to on but never infers hidden from a truthy value', () => {
    expect(coerceSettings({}).enabled).toBe(true);
    const result = coerceSettings({ playlists: { WL: { hidden: 1 } } });
    expect(result.playlists.WL?.hidden).toBe(false);
  });

  it('bounds an over-long title', () => {
    const result = coerceSettings({ playlists: { WL: { title: 'x'.repeat(5000) } } });
    expect(result.playlists.WL?.title).toHaveLength(200);
  });
});

describe('defaults are never shared', () => {
  it('hands each caller its own playlists map', async () => {
    const first = coerceSettings(null);
    first.playlists.PLabc123 = { title: 'x', hidden: true, itemCount: null, lastSyncedAt: null };
    // A shallow spread of DEFAULT_SETTINGS would leak this into every later
    // fallback, so the "safe default" would carry someone else's data.
    expect(Object.keys(coerceSettings(null).playlists)).toEqual([]);
    expect(Object.keys(DEFAULT_SETTINGS.playlists)).toEqual([]);
  });

  it('freezes the constant so accidental mutation cannot pass silently', () => {
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SETTINGS.playlists)).toBe(true);
  });

  it('gives readSettings a fresh map on the failure path too', async () => {
    const storage = installFakeChrome();
    storage.failing = true;
    const a = await readSettings();
    a.playlists.PLabc123 = { title: 'x', hidden: true, itemCount: null, lastSyncedAt: null };
    const b = await readSettings();
    expect(Object.keys(b.playlists)).toEqual([]);
    vi.unstubAllGlobals();
  });
});

describe('settings store', () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = installFakeChrome();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips through storage', async () => {
    await writeSettings({ ...DEFAULT_SETTINGS, enabled: false, syncIntervalMinutes: 90 });
    const read = await readSettings();
    expect(read.enabled).toBe(false);
    expect(read.syncIntervalMinutes).toBe(90);
  });

  it('returns defaults when nothing has been stored', async () => {
    expect(await readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults when the stored value is garbage', async () => {
    storage.data.settings = 'corrupted';
    expect(await readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults when storage itself throws', async () => {
    storage.failing = true;
    expect(await readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('sanitizes on the way in, so storage never holds an invalid interval', async () => {
    await writeSettings({ ...DEFAULT_SETTINGS, syncIntervalMinutes: 1 });
    expect((storage.data.settings as { syncIntervalMinutes: number }).syncIntervalMinutes).toBe(
      MIN_SYNC_INTERVAL_MINUTES,
    );
  });
});
