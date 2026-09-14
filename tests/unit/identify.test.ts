import { describe, expect, it } from 'vitest';
import { identifyHref } from '../../src/content/identify.js';
import { coerceSettings } from '../../src/core/settings.js';

describe('identifyHref', () => {
  it('reads a plain watch url', () => {
    expect(identifyHref('/watch?v=dQw4w9WgXcQ')).toEqual({
      videoId: 'dQw4w9WgXcQ',
      playlistId: null,
    });
  });

  it('reads both ids when a video is opened inside a playlist', () => {
    expect(identifyHref('/watch?v=dQw4w9WgXcQ&list=WL&index=3')).toEqual({
      videoId: 'dQw4w9WgXcQ',
      playlistId: 'WL',
    });
  });

  it('reads a playlist url', () => {
    expect(identifyHref('/playlist?list=PLabc123DEF')).toEqual({
      videoId: null,
      playlistId: 'PLabc123DEF',
    });
  });

  it('reads a shorts url', () => {
    expect(identifyHref('/shorts/dQw4w9WgXcQ').videoId).toBe('dQw4w9WgXcQ');
  });

  it('rejects malformed video ids instead of guessing', () => {
    expect(identifyHref('/watch?v=tooshort').videoId).toBeNull();
  });

  it('ignores off-site links', () => {
    expect(identifyHref('https://evil.example/watch?v=dQw4w9WgXcQ')).toEqual({
      videoId: null,
      playlistId: null,
    });
  });

  it('does not throw on garbage', () => {
    expect(identifyHref('::::')).toEqual({ videoId: null, playlistId: null });
  });
});

describe('coerceSettings', () => {
  it('falls back to defaults for junk input', () => {
    const settings = coerceSettings('not an object');
    expect(settings.enabled).toBe(true);
    expect(settings.playlists).toEqual({});
  });

  it('drops playlist entries with invalid ids', () => {
    const settings = coerceSettings({
      playlists: { 'bad id!': { hidden: true }, WL: { hidden: true, title: 'Daha sonra izle' } },
    });
    expect(Object.keys(settings.playlists)).toEqual(['WL']);
  });

  it('clamps the sync interval to the floor', () => {
    expect(coerceSettings({ syncIntervalMinutes: 1 }).syncIntervalMinutes).toBe(30);
  });

  it('treats a missing hidden flag as visible (fail-open)', () => {
    const settings = coerceSettings({ playlists: { WL: { title: 'x' } } });
    expect(settings.playlists.WL?.hidden).toBe(false);
  });
});
