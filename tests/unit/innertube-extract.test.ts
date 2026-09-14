import { describe, expect, it } from 'vitest';
import { extractVideoIds } from '../../src/content/innertube.js';

const V1 = 'dQw4w9WgXcQ';
const V2 = 'aBcDeFgHiJk';
const V3 = 'zYxWvUtSrQp';
const DECOY = 'DEcoyDEcoy1';

/** The shape ordinary PL... playlists render with (ADR-0002). */
function lockup(id: string): unknown {
  return {
    lockupViewModel: {
      contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
      contentId: id,
      metadata: { title: 'whatever' },
    },
  };
}

/** The shape WL still renders with (ADR-0002). */
function legacy(id: string): unknown {
  return { playlistVideoRenderer: { videoId: id, index: { simpleText: '1' } } };
}

describe('extractVideoIds — supported shapes', () => {
  it('reads the new lockup shape', () => {
    expect(extractVideoIds({ contents: [lockup(V1), lockup(V2)] })).toEqual([V1, V2]);
  });

  it('reads the old playlistVideoRenderer shape', () => {
    expect(extractVideoIds({ contents: [legacy(V1), legacy(V2)] })).toEqual([V1, V2]);
  });

  it('reads both shapes in one payload, since YouTube runs them in parallel', () => {
    expect(extractVideoIds({ contents: [lockup(V1), legacy(V2)] })).toEqual([V1, V2]);
  });

  it('finds lockups wherever they sit, not only under a known parent key', () => {
    const data = { a: { b: { c: [{ d: lockup(V1) }] } } };
    expect(extractVideoIds(data)).toEqual([V1]);
  });

  it('preserves playlist order and deduplicates', () => {
    const data = { contents: [lockup(V1), lockup(V2), lockup(V1), legacy(V3)] };
    expect(extractVideoIds(data)).toEqual([V1, V2, V3]);
  });
});

describe('extractVideoIds — the blind-harvest trap (ADR-0002)', () => {
  it('ignores the action fields that also carry 11-character ids', () => {
    // Every one of these was observed on a real playlist page carrying a valid
    // id. They are button actions, not playlist contents.
    const data = {
      contents: [lockup(V1)],
      actions: {
        addedVideoId: DECOY,
        removedVideoId: DECOY,
        animationActivationTargetId: DECOY,
        videoId: DECOY,
      },
    };
    expect(extractVideoIds(data)).toEqual([V1]);
  });

  it('ignores a bare videoId that is not under playlistVideoRenderer', () => {
    expect(extractVideoIds({ someRenderer: { videoId: DECOY } })).toEqual([]);
    expect(extractVideoIds({ videoId: DECOY })).toEqual([]);
  });

  it('ignores a lockup whose contentType is not a video', () => {
    const playlistLockup = {
      lockupViewModel: { contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST', contentId: DECOY },
    };
    expect(extractVideoIds(playlistLockup)).toEqual([]);
  });

  it('does not take contentId when contentType is absent', () => {
    expect(extractVideoIds({ lockupViewModel: { contentId: DECOY } })).toEqual([]);
  });

  it('keeps the real ids even when decoys outnumber them', () => {
    const data = {
      decoys: Array.from({ length: 100 }, () => ({ addedVideoId: DECOY })),
      contents: [lockup(V1), legacy(V2)],
    };
    expect(extractVideoIds(data)).toEqual([V1, V2]);
  });
});

describe('extractVideoIds — robustness', () => {
  it('returns empty for anything that is not a payload', () => {
    for (const raw of [null, undefined, 'html', 42, []]) {
      expect(extractVideoIds(raw)).toEqual([]);
    }
  });

  it('drops a malformed id rather than storing it', () => {
    expect(extractVideoIds({ contents: [lockup('too-short'), lockup(V1)] })).toEqual([V1]);
    expect(extractVideoIds({ contents: [legacy(''), legacy(V1)] })).toEqual([V1]);
  });

  it('honours the cap', () => {
    const many = Array.from({ length: 40 }, (_, i) => lockup(`vid${String(i).padStart(8, '0')}`));
    expect(extractVideoIds({ contents: many }, 10)).toHaveLength(10);
  });

  it('does not blow the stack on a deeply nested payload', () => {
    let deep: unknown = lockup(V1);
    for (let i = 0; i < 5_000; i += 1) deep = { next: deep };
    expect(() => extractVideoIds(deep)).not.toThrow();
  });
});
