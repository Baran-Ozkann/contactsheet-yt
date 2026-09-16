import {
  DEFAULT_SETTINGS,
  MIN_SYNC_INTERVAL_MINUTES,
  defaultSettings,
  isPlaylistId,
  type PlaylistSetting,
  type Settings,
} from './types.js';
import { MAX_TITLE_LENGTH } from './schema.js';
import { log } from './logger.js';

const KEY = 'settings';

/**
 * `typeof x === 'number'` still admits NaN and Infinity. Both would reach
 * chrome.alarms.create() and silently kill the sync schedule, so every numeric
 * field is screened through this.
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Anything read back from storage is treated as untrusted: a corrupted or
 * hand-edited value must degrade to defaults, never throw into the content
 * script and never leave hiding half-configured (spec NFR-04).
 */
export function coerceSettings(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) return defaultSettings();
  const input = raw as Partial<Settings>;

  // Accumulate on a null-prototype object: "__proto__" and "constructor" both
  // satisfy PLAYLIST_ID_RE, and a plain `{}` would route those assignments to
  // the prototype setter instead of creating an entry — silently losing the
  // playlist and leaving stray keys resolvable through the prototype chain.
  // Spreading a null-prototype object back out creates real own properties.
  const accumulator: Record<string, PlaylistSetting> = Object.create(null) as Record<string, PlaylistSetting>;
  if (typeof input.playlists === 'object' && input.playlists !== null) {
    for (const [id, value] of Object.entries(input.playlists)) {
      if (!isPlaylistId(id) || typeof value !== 'object' || value === null) continue;
      const entry = value as Partial<PlaylistSetting>;
      accumulator[id] = {
        title: typeof entry.title === 'string' ? entry.title.slice(0, MAX_TITLE_LENGTH) : id,
        hidden: entry.hidden === true,
        itemCount: isFiniteNumber(entry.itemCount) && entry.itemCount >= 0 ? Math.floor(entry.itemCount) : null,
        lastSyncedAt: isFiniteNumber(entry.lastSyncedAt) ? entry.lastSyncedAt : null,
      };
    }
  }

  const interval = isFiniteNumber(input.syncIntervalMinutes)
    ? input.syncIntervalMinutes
    : DEFAULT_SETTINGS.syncIntervalMinutes;

  return {
    schemaVersion: 1,
    enabled: input.enabled !== false,
    debugOverlay: input.debugOverlay === true,
    syncIntervalMinutes: Math.max(MIN_SYNC_INTERVAL_MINUTES, Math.round(interval)),
    playlists: { ...accumulator },
  };
}

export async function readSettings(): Promise<Settings> {
  try {
    const stored = await chrome.storage.local.get(KEY);
    return coerceSettings(stored[KEY]);
  } catch (err) {
    log.error('settings read failed, using defaults', err);
    return defaultSettings();
  }
}

/** Writes go through the service worker only, so no lock is needed here. */
export async function writeSettings(next: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: coerceSettings(next) });
}

// ---- export / import (FR-10) -----------------------------------------------

/** Spec FR-10: `contactsheet-settings-YYYYMMDD.json`. */
export function settingsFilename(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `contactsheet-settings-${y}${m}${d}.json`;
}

/**
 * Settings only — never the index (spec FR-10). The index is derived data that
 * a sync rebuilds, it is far larger, and it is the part that actually lists
 * what the user watches. Keeping it out of an exported file means a settings
 * backup is not a record of anyone's viewing.
 */
export function exportSettings(settings: Settings): string {
  const safe = coerceSettings(settings);
  return `${JSON.stringify(safe, null, 2)}\n`;
}

/**
 * Parses an exported file. Anything unrecognised degrades to defaults rather
 * than throwing, and a file that is not an object at all is rejected outright
 * so an accidental import cannot silently wipe settings.
 */
export function importSettings(text: string): Settings | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  // An index smuggled into the file is dropped here: coerceSettings only ever
  // copies the fields it knows about.
  return coerceSettings(parsed);
}
