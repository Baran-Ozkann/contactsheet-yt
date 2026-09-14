import { coerceIndexEntry } from './schema.js';
import { isPlaylistId, type IndexEntry, type PlaylistId, type Settings, type VideoId } from './types.js';
import { log } from './logger.js';

/**
 * Persistence for `playlistId -> videoId[]`.
 *
 * Spec §3: one storage key per playlist. Writing a single combined object
 * would serialize every playlist on every sync and make two concurrent syncs
 * clobber each other.
 *
 * Every read fails open: a missing, unreadable or malformed entry yields no
 * ids, which means nothing gets hidden (NFR-04).
 */

const PREFIX = 'index:';

export function indexKey(playlistId: PlaylistId): string {
  return `${PREFIX}${playlistId}`;
}

export async function readIndex(playlistId: PlaylistId): Promise<IndexEntry | null> {
  if (!isPlaylistId(playlistId)) return null;
  try {
    const key = indexKey(playlistId);
    const stored = await chrome.storage.local.get(key);
    return coerceIndexEntry(stored[key], playlistId);
  } catch (err) {
    log.error('index read failed', err);
    return null;
  }
}

/** Writes are serialized by the service worker, which is the only caller. */
export async function writeIndex(entry: IndexEntry): Promise<void> {
  if (!isPlaylistId(entry.playlistId)) return;
  const safe = coerceIndexEntry(entry, entry.playlistId);
  if (!safe) return;
  await chrome.storage.local.set({ [indexKey(safe.playlistId)]: safe });
}

export async function deleteIndex(playlistId: PlaylistId): Promise<void> {
  if (!isPlaylistId(playlistId)) return;
  await chrome.storage.local.remove(indexKey(playlistId));
}

/** Ids of every playlist that currently has a stored index. */
export async function listIndexedPlaylistIds(): Promise<PlaylistId[]> {
  try {
    const all = await chrome.storage.local.get(null);
    return Object.keys(all)
      .filter((key) => key.startsWith(PREFIX))
      .map((key) => key.slice(PREFIX.length))
      .filter(isPlaylistId);
  } catch (err) {
    log.error('index listing failed', err);
    return [];
  }
}

/**
 * The structure the filter actually runs against: one Set holding the ids of
 * every playlist currently marked hidden. Rebuilt whenever settings change.
 *
 * A playlist marked hidden with no stored index simply contributes nothing —
 * its cards still disappear through L0, which needs no network at all.
 */
export async function buildHiddenVideoSet(settings: Settings): Promise<Set<VideoId>> {
  const hidden = Object.entries(settings.playlists)
    .filter(([id, value]) => value.hidden && isPlaylistId(id))
    .map(([id]) => id);

  const merged = new Set<VideoId>();
  if (hidden.length === 0) return merged;

  try {
    const stored = await chrome.storage.local.get(hidden.map(indexKey));
    for (const playlistId of hidden) {
      const entry = coerceIndexEntry(stored[indexKey(playlistId)], playlistId);
      if (!entry) continue;
      for (const id of entry.videoIds) merged.add(id);
    }
  } catch (err) {
    // Fail open: an unreadable index hides nothing rather than hiding wrongly.
    log.error('hidden set build failed, hiding nothing', err);
    return new Set<VideoId>();
  }
  return merged;
}

/** Drops stored indexes for playlists the user no longer tracks. */
export async function pruneIndexes(settings: Settings): Promise<void> {
  const known = new Set(Object.keys(settings.playlists));
  const stale = (await listIndexedPlaylistIds()).filter((id) => !known.has(id));
  if (stale.length === 0) return;
  await chrome.storage.local.remove(stale.map(indexKey));
}
