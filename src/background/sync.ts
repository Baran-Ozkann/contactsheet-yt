import { coerceIndexEntry } from '../core/schema.js';
import { pruneIndexes, writeIndex } from '../core/index-store.js';
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
