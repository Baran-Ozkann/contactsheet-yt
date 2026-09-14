import { coerceIndexEntry } from '../core/schema.js';
import { indexKey, pruneIndexes, writeIndex } from '../core/index-store.js';
import type { Layer, PlaylistView, PopupState } from '../core/messaging.js';
import { readSettings, writeSettings } from '../core/settings.js';
import { isPlaylistId, type IndexEntry, type PlaylistId } from '../core/types.js';
import { log } from '../core/logger.js';

/**
 * Sync orchestration for the service worker (spec §2.2).
 *
 * The worker never touches the network — it finds a tab already on
 * youtube.com, hands it the job, and writes back whatever comes home. It is
 * also the sole writer to storage, so every write goes through one queue.
 *
 * Kept out of service-worker.ts so it can be tested without the module
 * registering global chrome listeners on import.
 */

export interface SyncOutcome {
  ok: boolean;
  reason?: 'no-tab' | 'no-response' | 'nothing-to-sync';
  written?: number;
}

/**
 * Serializes every storage write through a single chain. Two syncs finishing
 * together must not interleave read-modify-write on settings.
 */
let writeChain: Promise<unknown> = Promise.resolve();

export function serializeWrite<T>(task: () => Promise<T>): Promise<T> {
  const next = writeChain.then(task, task);
  // Swallow on the chain only; the caller still sees its own rejection.
  writeChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/**
 * Works with host_permissions alone — the "tabs" permission is deliberately
 * not requested (spec §7 rule 3).
 */
export async function findYouTubeTab(): Promise<chrome.tabs.Tab | undefined> {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
    return tabs.find((tab) => typeof tab.id === 'number');
  } catch {
    return undefined;
  }
}

/** Entries arrive from a content script, so they are re-validated here (§7.8). */
export function acceptEntries(raw: unknown): IndexEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: IndexEntry[] = [];
  for (const candidate of raw) {
    const id = (candidate as { playlistId?: unknown } | null)?.playlistId;
    if (!isPlaylistId(id)) continue;
    const entry = coerceIndexEntry(candidate, id);
    if (entry) out.push(entry);
  }
  return out;
}

/** Persists index entries and stamps the matching settings metadata. */
export async function persistEntries(entries: readonly IndexEntry[]): Promise<number> {
  if (entries.length === 0) return 0;
  return serializeWrite(async () => {
    const settings = await readSettings();
    for (const entry of entries) {
      await writeIndex(entry);
      const existing = settings.playlists[entry.playlistId];
      if (existing) {
        existing.itemCount = entry.videoIds.length;
        existing.lastSyncedAt = entry.syncedAt;
      }
    }
    await writeSettings(settings);
    return entries.length;
  });
}

/**
 * One sync at a time. A second request while one is running joins the running
 * one rather than starting a competing pass (acceptance criterion: a second
 * sync produces no contention).
 */
let inFlight: Promise<SyncOutcome> | null = null;

export function isSyncing(): boolean {
  return inFlight !== null;
}

export function startSync(playlistIds?: readonly PlaylistId[]): Promise<SyncOutcome> {
  if (inFlight) {
    log.debug('sync already running; joining it');
    return inFlight;
  }
  const run = runSync(playlistIds).finally(() => {
    inFlight = null;
  });
  inFlight = run;
  return run;
}

async function runSync(playlistIds?: readonly PlaylistId[]): Promise<SyncOutcome> {
  const settings = await readSettings();
  const targets = (playlistIds ?? Object.keys(settings.playlists)).filter(isPlaylistId);
  if (targets.length === 0) return { ok: false, reason: 'nothing-to-sync' };

  const tab = await findYouTubeTab();
  if (!tab || typeof tab.id !== 'number') return { ok: false, reason: 'no-tab' };

  let response: unknown;
  try {
    response = await chrome.tabs.sendMessage(tab.id, {
      type: 'sync:run',
      playlistIds: [...targets],
    });
  } catch {
    // Tab closed or navigated mid-flight. Nothing was written; nothing hides.
    return { ok: false, reason: 'no-response' };
  }

  const entries = acceptEntries((response as { entries?: unknown } | null)?.entries);
  if (entries.length === 0) return { ok: false, reason: 'no-response' };

  const written = await persistEntries(entries);
  await serializeWrite(async () => {
    await pruneIndexes(await readSettings());
  });
  return { ok: true, written };
}

/** Test seam: reset module state between cases. */
export function resetSyncState(): void {
  inFlight = null;
  writeChain = Promise.resolve();
}

// ---- popup state -----------------------------------------------------------

/**
 * Which layer a playlist is genuinely being filtered at (spec §4.0). The popup
 * shows this so nobody has to guess why a playlist is "marked hidden but its
 * videos still show" — that state is L0, and it is legitimate.
 */
export function layerFor(entry: IndexEntry | null): Layer {
  if (!entry || entry.videoIds.length === 0) return 'L0';
  return entry.complete ? 'L2' : 'L1';
}

/**
 * Resolves settings plus index state into exactly what the popup renders. The
 * popup does no work of its own (spec §2.2), so every derived number is
 * computed here.
 */
export async function buildPopupState(): Promise<PopupState> {
  const settings = await readSettings();
  const ids = Object.keys(settings.playlists).filter(isPlaylistId);

  let stored: Record<string, unknown> = {};
  try {
    stored = await chrome.storage.local.get(ids.map(indexKey));
  } catch {
    // Fail open: an unreadable index reports as L0, never as a full one.
    stored = {};
  }

  const playlists: PlaylistView[] = ids.map((id) => {
    const setting = settings.playlists[id];
    const entry = coerceIndexEntry(stored[indexKey(id)], id);
    const indexedCount = entry?.videoIds.length ?? 0;
    const itemCount = setting?.itemCount ?? null;
    const complete = entry?.complete ?? false;
    return {
      id,
      title: setting?.title ?? id,
      hidden: setting?.hidden ?? false,
      itemCount,
      indexedCount,
      complete,
      // Reporting "32/32" as partial is worse than saying nothing: it tells the
      // user something is missing when nothing is. A shortfall has to be
      // demonstrable — a known total we genuinely hold fewer than.
      partial: !complete && indexedCount > 0 && itemCount !== null && indexedCount < itemCount,
      layer: layerFor(entry),
      lastSyncedAt: setting?.lastSyncedAt ?? null,
    };
  });

  const hiddenRows = playlists.filter((row) => row.hidden);
  const lastSyncedAt = playlists.reduce<number | null>(
    (latest, row) =>
      row.lastSyncedAt !== null && (latest === null || row.lastSyncedAt > latest)
        ? row.lastSyncedAt
        : latest,
    null,
  );

  return {
    enabled: settings.enabled,
    debugOverlay: settings.debugOverlay,
    syncing: isSyncing(),
    playlists,
    hiddenPlaylistCount: hiddenRows.length,
    hiddenVideoCount: hiddenRows.reduce((sum, row) => sum + row.indexedCount, 0),
    lastSyncedAt,
  };
}

/**
 * Playlist mutations. Each is a read-modify-write on settings, so each goes
 * through the same queue as every other write.
 */
export async function addPlaylist(playlistId: PlaylistId): Promise<boolean> {
  if (!isPlaylistId(playlistId)) return false;
  return serializeWrite(async () => {
    const settings = await readSettings();
    if (settings.playlists[playlistId]) return false;
    settings.playlists[playlistId] = {
      // The id stands in until the first sync fills the real title (spec §4.1).
      title: playlistId,
      hidden: true,
      itemCount: null,
      lastSyncedAt: null,
    };
    await writeSettings(settings);
    return true;
  });
}

export async function removePlaylist(playlistId: PlaylistId): Promise<void> {
  if (!isPlaylistId(playlistId)) return;
  await serializeWrite(async () => {
    const settings = await readSettings();
    delete settings.playlists[playlistId];
    await writeSettings(settings);
    await chrome.storage.local.remove(indexKey(playlistId));
  });
}

export async function setPlaylistHidden(playlistId: PlaylistId, hidden: boolean): Promise<void> {
  if (!isPlaylistId(playlistId)) return;
  await serializeWrite(async () => {
    const settings = await readSettings();
    const entry = settings.playlists[playlistId];
    if (!entry) return;
    entry.hidden = hidden;
    await writeSettings(settings);
  });
}
