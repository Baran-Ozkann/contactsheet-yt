import type { PlaylistId, Settings } from './types.js';

/** Which capability layer a playlist is actually being filtered at (spec §4.0). */
export type Layer = 'L0' | 'L1' | 'L2';

/**
 * One row of the popup. The popup does no work of its own (spec §2.2), so the
 * worker resolves settings and index state into exactly what gets rendered.
 */
export interface PlaylistView {
  id: PlaylistId;
  title: string;
  hidden: boolean;
  /** Total the playlist claims to hold; null until a sync has run. */
  itemCount: number | null;
  /** How many ids we actually hold. */
  indexedCount: number;
  complete: boolean;
  layer: Layer;
  lastSyncedAt: number | null;
}

export interface PopupState {
  enabled: boolean;
  debugOverlay: boolean;
  syncing: boolean;
  playlists: PlaylistView[];
  hiddenPlaylistCount: number;
  hiddenVideoCount: number;
  lastSyncedAt: number | null;
}

/**
 * The only message types that exist. Anything else is dropped by the router.
 * Phases 2–5 extend this union; they do not invent ad-hoc string types.
 */
export type Message =
  | { type: 'settings:get' }
  | { type: 'settings:set'; patch: Partial<Settings> }
  | { type: 'settings:changed'; settings: Settings }
  | { type: 'playlists:discover' }
  | { type: 'sync:start'; playlistIds?: PlaylistId[] }
  | { type: 'sync:status' }
  // Service worker -> content script. The worker has no network access of its
  // own (spec §2.1), so it hands the job to a tab on youtube.com.
  | { type: 'sync:run'; playlistIds: PlaylistId[] }
  // Popup -> worker. Every mutation is a request; the worker owns the write.
  | { type: 'popup:state' }
  | { type: 'playlists:add'; playlistId: PlaylistId }
  | { type: 'playlists:remove'; playlistId: PlaylistId }
  | { type: 'playlists:toggle'; playlistId: PlaylistId; hidden: boolean }
  | { type: 'ping' };

export const MESSAGE_TYPES: ReadonlySet<Message['type']> = new Set([
  'settings:get',
  'settings:set',
  'settings:changed',
  'playlists:discover',
  'sync:start',
  'sync:status',
  'sync:run',
  'popup:state',
  'playlists:add',
  'playlists:remove',
  'playlists:toggle',
  'ping',
]);

export function isMessage(value: unknown): value is Message {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' && MESSAGE_TYPES.has(type as Message['type']);
}

/** Spec §7.8: only accept traffic that originates from this extension. */
export function isTrustedSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id;
}

/** Spec §2.3 — no message may leave a caller waiting forever. */
export const MESSAGE_TIMEOUT_MS = 5_000;

/**
 * Resolves to `fallback` if `promise` has not settled in time, and on rejection.
 * A stalled or dead service worker must never block the filter, so the caller
 * always receives a value rather than an exception (NFR-04).
 */
export function withTimeout<T>(
  promise: Promise<T>,
  fallback: T,
  timeoutMs: number = MESSAGE_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const finish = (value: T): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(fallback), timeoutMs);
    promise.then(
      (value) => finish(value),
      () => finish(fallback),
    );
  });
}

/**
 * The only way any context should talk to the service worker: typed in, bounded
 * in time, and never throwing. `undefined` means "no usable answer" — treat it
 * as a reason to do nothing, never as a reason to hide.
 */
export async function sendMessage(
  message: Message,
  timeoutMs: number = MESSAGE_TIMEOUT_MS,
): Promise<unknown> {
  return withTimeout(
    Promise.resolve().then(() => chrome.runtime.sendMessage(message) as Promise<unknown>),
    undefined,
    timeoutMs,
  );
}
