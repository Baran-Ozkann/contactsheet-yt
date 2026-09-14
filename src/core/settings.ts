import {
  DEFAULT_SETTINGS,
  MIN_SYNC_INTERVAL_MINUTES,
  isPlaylistId,
  type PlaylistSetting,
  type Settings,
} from './types.js';
import { log } from './logger.js';

const KEY = 'settings';

/**
 * Anything read back from storage is treated as untrusted: a corrupted or
 * hand-edited value must degrade to defaults, never throw into the content
 * script and never leave hiding half-configured (spec NFR-04).
 */
export function coerceSettings(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS };
  const input = raw as Partial<Settings>;

  const playlists: Record<string, PlaylistSetting> = {};
  if (typeof input.playlists === 'object' && input.playlists !== null) {
    for (const [id, value] of Object.entries(input.playlists)) {
      if (!isPlaylistId(id) || typeof value !== 'object' || value === null) continue;
      const entry = value as Partial<PlaylistSetting>;
      playlists[id] = {
        title: typeof entry.title === 'string' ? entry.title.slice(0, 200) : id,
        hidden: entry.hidden === true,
        itemCount: typeof entry.itemCount === 'number' && entry.itemCount >= 0 ? entry.itemCount : null,
        lastSyncedAt: typeof entry.lastSyncedAt === 'number' ? entry.lastSyncedAt : null,
      };
    }
  }

  const interval = typeof input.syncIntervalMinutes === 'number' ? input.syncIntervalMinutes : DEFAULT_SETTINGS.syncIntervalMinutes;

  return {
    schemaVersion: 1,
    enabled: input.enabled !== false,
    debugOverlay: input.debugOverlay === true,
    syncIntervalMinutes: Math.max(MIN_SYNC_INTERVAL_MINUTES, Math.round(interval)),
    playlists,
  };
}

export async function readSettings(): Promise<Settings> {
  try {
    const stored = await chrome.storage.local.get(KEY);
    return coerceSettings(stored[KEY]);
  } catch (err) {
    log.error('settings read failed, using defaults', err);
    return { ...DEFAULT_SETTINGS };
  }
}

/** Writes go through the service worker only, so no lock is needed here. */
export async function writeSettings(next: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: coerceSettings(next) });
}
