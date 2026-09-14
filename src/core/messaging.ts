import type { PlaylistId, Settings } from './types.js';

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
  | { type: 'ping' };

export const MESSAGE_TYPES: ReadonlySet<Message['type']> = new Set([
  'settings:get',
  'settings:set',
  'settings:changed',
  'playlists:discover',
  'sync:start',
  'sync:status',
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
