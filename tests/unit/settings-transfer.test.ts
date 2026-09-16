import { describe, expect, it } from 'vitest';
import {
  coerceSettings,
  exportSettings,
  importSettings,
  settingsFilename,
} from '../../src/core/settings.js';
import { DEFAULT_SETTINGS, defaultSettings } from '../../src/core/types.js';

const sample = {
  ...defaultSettings(),
  enabled: false,
  syncIntervalMinutes: 720,
  playlists: {
    WL: { title: 'Watch later', hidden: true, itemCount: 48, lastSyncedAt: 1_700_000_000_000 },
  },
};

describe('settingsFilename (FR-10)', () => {
  it('uses the documented pattern', () => {
    expect(settingsFilename(new Date(2026, 8, 14))).toBe('contactsheet-settings-20260914.json');
  });

  it('pads single-digit months and days', () => {
    expect(settingsFilename(new Date(2026, 0, 5))).toBe('contactsheet-settings-20260105.json');
  });
});

describe('exportSettings', () => {
  it('round-trips through import', () => {
    expect(importSettings(exportSettings(sample))).toEqual(coerceSettings(sample));
  });

  it('is readable JSON ending in a newline', () => {
    const text = exportSettings(sample);
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('\n  ');
  });

  it('carries settings only, never the index (FR-10)', () => {
    const text = exportSettings(sample);
    expect(text).not.toContain('videoIds');
    expect(text).not.toContain('index:');
    // The exported shape is exactly the settings keys.
    expect(Object.keys(JSON.parse(text) as object).sort()).toEqual(
      Object.keys(DEFAULT_SETTINGS).sort(),
    );
  });

  it('sanitizes on the way out, so a corrupt in-memory value is not exported', () => {
    const dirty = { ...sample, syncIntervalMinutes: 1 } as typeof sample;
    expect(JSON.parse(exportSettings(dirty)).syncIntervalMinutes).toBe(30);
  });
});

describe('importSettings', () => {
  it('rejects anything that is not a settings object', () => {
    for (const text of ['', 'null', '[]', '"a string"', '42', '{', 'not json']) {
      expect(importSettings(text)).toBeNull();
    }
  });

  it('drops an index smuggled into the file', () => {
    const text = JSON.stringify({
      ...sample,
      'index:WL': { videoIds: ['dQw4w9WgXcQ'] },
      videoIds: ['dQw4w9WgXcQ'],
    });
    const result = importSettings(text);
    expect(result).not.toBeNull();
    expect(Object.keys(result ?? {}).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it('repairs a partial file rather than rejecting it', () => {
    const result = importSettings('{"enabled":false}');
    expect(result?.enabled).toBe(false);
    expect(result?.syncIntervalMinutes).toBe(DEFAULT_SETTINGS.syncIntervalMinutes);
    expect(result?.playlists).toEqual({});
  });

  it('drops playlist entries with invalid ids', () => {
    const result = importSettings(
      '{"playlists":{"WL":{"hidden":true},"not a valid id!":{"hidden":true}}}',
    );
    expect(Object.keys(result?.playlists ?? {})).toEqual(['WL']);
  });

  it('does not let an imported file poison the defaults', () => {
    const result = importSettings('{"playlists":{"WL":{"hidden":true}}}');
    expect(result?.playlists.WL).toBeDefined();
    expect(Object.keys(DEFAULT_SETTINGS.playlists)).toEqual([]);
  });
});
