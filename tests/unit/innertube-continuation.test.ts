import { describe, expect, it } from 'vitest';
import { extractContinuationTokens } from '../../src/content/innertube.js';

const GOOD = 'token-under-continuation-item-view-model';
const OTHER = 'token-from-somewhere-else';

describe('extractContinuationTokens', () => {
  it('finds a token', () => {
    expect(extractContinuationTokens({ continuationCommand: { token: OTHER } })).toEqual([OTHER]);
  });

  it('ranks the continuationItemViewModel token first (ADR-0002)', () => {
    const data = {
      header: { menu: { continuationCommand: { token: OTHER } } },
      contents: {
        continuationItemViewModel: { continuationCommand: { token: GOOD } },
      },
    };
    expect(extractContinuationTokens(data)).toEqual([GOOD, OTHER]);
  });

  it('keeps the preferred ranking however deep the viewmodel sits', () => {
    const data = {
      a: { continuationCommand: { token: OTHER } },
      b: { c: { continuationItemViewModel: { d: { continuationCommand: { token: GOOD } } } } },
    };
    expect(extractContinuationTokens(data)[0]).toBe(GOOD);
  });

  it('returns every candidate, since only asking tells them apart', () => {
    const data = {
      a: { continuationCommand: { token: 't1' } },
      b: { continuationCommand: { token: 't2' } },
    };
    expect(extractContinuationTokens(data)).toHaveLength(2);
  });

  it('deduplicates a token that appears twice', () => {
    const data = {
      a: { continuationCommand: { token: OTHER } },
      b: { continuationCommand: { token: OTHER } },
    };
    expect(extractContinuationTokens(data)).toEqual([OTHER]);
  });

  it('returns empty when the payload has no continuation', () => {
    expect(extractContinuationTokens({ contents: [] })).toEqual([]);
    expect(extractContinuationTokens(null)).toEqual([]);
    expect(extractContinuationTokens('html')).toEqual([]);
  });

  it('ignores a token that is not a usable string', () => {
    expect(extractContinuationTokens({ continuationCommand: { token: 42 } })).toEqual([]);
    expect(extractContinuationTokens({ continuationCommand: { token: '' } })).toEqual([]);
    expect(
      extractContinuationTokens({ continuationCommand: { token: 'x'.repeat(5000) } }),
    ).toEqual([]);
  });
});
