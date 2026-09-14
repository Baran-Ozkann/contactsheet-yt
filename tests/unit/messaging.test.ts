import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MESSAGE_TYPES,
  isMessage,
  isTrustedSender,
  withTimeout,
} from '../../src/core/messaging.js';

describe('isMessage', () => {
  it('accepts every declared type', () => {
    for (const type of MESSAGE_TYPES) {
      expect(isMessage({ type })).toBe(true);
    }
  });

  it('rejects an unknown type', () => {
    expect(isMessage({ type: 'settings:wipe' })).toBe(false);
    expect(isMessage({ type: '__proto__' })).toBe(false);
  });

  it('rejects values that are not message-shaped', () => {
    for (const raw of [null, undefined, 'ping', 42, [], {}, { type: 7 }]) {
      expect(isMessage(raw)).toBe(false);
    }
  });
});

describe('isTrustedSender', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts our own extension id and rejects anything else', () => {
    vi.stubGlobal('chrome', { runtime: { id: 'me' } });
    expect(isTrustedSender({ id: 'me' } as chrome.runtime.MessageSender)).toBe(true);
    expect(isTrustedSender({ id: 'someone-else' } as chrome.runtime.MessageSender)).toBe(false);
    expect(isTrustedSender({} as chrome.runtime.MessageSender)).toBe(false);
  });
});

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes through a value that arrives in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 'fallback', 50)).resolves.toBe('ok');
  });

  it('falls back instead of hanging', async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise<string>(() => {}), 'fallback', 5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toBe('fallback');
  });

  it('falls back on rejection rather than throwing at the caller', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('worker died')), 'fallback', 50),
    ).resolves.toBe('fallback');
  });

  it('ignores a late answer once it has fallen back', async () => {
    vi.useFakeTimers();
    let release: (value: string) => void = () => {};
    const slow = new Promise<string>((resolve) => {
      release = resolve;
    });
    const pending = withTimeout(slow, 'fallback', 1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    release('too late');
    await expect(pending).resolves.toBe('fallback');
  });
});
