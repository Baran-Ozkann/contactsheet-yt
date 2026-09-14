import { describe, expect, it } from 'vitest';
import {
  MAX_PARSE_DEPTH,
  coerceIndexEntry,
  exceedsDepth,
  safeJsonParse,
  sanitizeVideoIds,
} from '../../src/core/schema.js';

const VALID = 'dQw4w9WgXcQ';
const VALID_2 = 'aBcDeFgHiJk';

describe('sanitizeVideoIds', () => {
  it('keeps well-formed ids in first-seen order', () => {
    expect(sanitizeVideoIds([VALID, VALID_2])).toEqual([VALID, VALID_2]);
  });

  it('drops anything that is not an 11-character id', () => {
    expect(
      sanitizeVideoIds([VALID, 'too-short', `${VALID}extra`, 42, null, undefined, {}, ['x']]),
    ).toEqual([VALID]);
  });

  it('deduplicates', () => {
    expect(sanitizeVideoIds([VALID, VALID, VALID])).toEqual([VALID]);
  });

  it('returns empty for non-arrays instead of throwing', () => {
    for (const raw of [null, undefined, 'abc', 7, {}]) {
      expect(sanitizeVideoIds(raw)).toEqual([]);
    }
  });

  it('enforces the per-playlist cap', () => {
    const many = Array.from({ length: 50 }, (_, i) => `vid${String(i).padStart(8, '0')}`);
    expect(sanitizeVideoIds(many, 10)).toHaveLength(10);
  });
});

describe('exceedsDepth', () => {
  it('accepts flat and shallow values', () => {
    expect(exceedsDepth({ a: 1 })).toBe(false);
    expect(exceedsDepth([1, 2, [3]])).toBe(false);
    expect(exceedsDepth('scalar')).toBe(false);
    expect(exceedsDepth(null)).toBe(false);
  });

  it('rejects nesting past the limit', () => {
    let deep: unknown = 'leaf';
    for (let i = 0; i < MAX_PARSE_DEPTH + 5; i += 1) deep = { next: deep };
    expect(exceedsDepth(deep)).toBe(true);
  });

  it('counts array nesting too', () => {
    let deep: unknown = 'leaf';
    for (let i = 0; i < MAX_PARSE_DEPTH + 5; i += 1) deep = [deep];
    expect(exceedsDepth(deep)).toBe(true);
  });
});

describe('safeJsonParse', () => {
  it('parses ordinary json', () => {
    expect(safeJsonParse('{"a":[1,2]}')).toEqual({ a: [1, 2] });
  });

  it('returns undefined for malformed json instead of throwing', () => {
    expect(safeJsonParse('{"a":')).toBeUndefined();
    expect(safeJsonParse('')).toBeUndefined();
  });

  it('returns undefined for non-strings', () => {
    expect(safeJsonParse(null)).toBeUndefined();
    expect(safeJsonParse({ a: 1 })).toBeUndefined();
  });

  it('refuses a body over the byte budget', () => {
    const big = `"${'x'.repeat(200)}"`;
    expect(safeJsonParse(big, 50)).toBeUndefined();
    expect(safeJsonParse(big, 10_000)).toBe('x'.repeat(200));
  });

  it('measures budget in utf-8 bytes, not code units', () => {
    // 10 code units, 30 utf-8 bytes, plus the two quote characters.
    const multibyte = `"${'あ'.repeat(10)}"`;
    expect(safeJsonParse(multibyte, 12)).toBeUndefined();
    expect(safeJsonParse(multibyte, 64)).toBe('あ'.repeat(10));
  });

  it('refuses a payload nested past the depth limit', () => {
    let deep = '"leaf"';
    for (let i = 0; i < MAX_PARSE_DEPTH + 5; i += 1) deep = `{"n":${deep}}`;
    expect(safeJsonParse(deep)).toBeUndefined();
  });
});

describe('coerceIndexEntry', () => {
  it('returns null when the record is not an object', () => {
    expect(coerceIndexEntry(null, 'WL')).toBeNull();
    expect(coerceIndexEntry('nope', 'WL')).toBeNull();
  });

  it('always stamps the playlist id from the caller, not the payload', () => {
    const entry = coerceIndexEntry({ playlistId: 'PLevil', videoIds: [VALID] }, 'WL');
    expect(entry?.playlistId).toBe('WL');
  });

  it('keeps an empty playlist as a valid record', () => {
    const entry = coerceIndexEntry({ videoIds: [], syncedAt: 5, complete: true }, 'WL');
    expect(entry).toEqual({ playlistId: 'WL', videoIds: [], syncedAt: 5, complete: true });
  });

  it('clears complete when ids were dropped during validation', () => {
    const entry = coerceIndexEntry({ videoIds: [VALID, 'junk'], complete: true }, 'WL');
    expect(entry?.videoIds).toEqual([VALID]);
    expect(entry?.complete).toBe(false);
  });

  it('defaults a corrupt timestamp to zero', () => {
    expect(coerceIndexEntry({ videoIds: [], syncedAt: NaN }, 'WL')?.syncedAt).toBe(0);
    expect(coerceIndexEntry({ videoIds: [], syncedAt: 'now' }, 'WL')?.syncedAt).toBe(0);
  });

  it('treats a missing complete flag as incomplete', () => {
    expect(coerceIndexEntry({ videoIds: [VALID] }, 'WL')?.complete).toBe(false);
  });
});
