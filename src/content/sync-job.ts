import { indexPlaylist } from './indexer.js';
import type { SyncRunResponse } from '../core/messaging.js';
import { isPlaylistId, type IndexEntry } from '../core/types.js';
import { log } from '../core/logger.js';

/**
 * Serving indexing jobs for the service worker, which cannot reach the network
 * itself (spec §2.1).
 *
 * Separate from main.ts so the reply this builds can be tested. The reply is a
 * trust boundary — it is the only way anything the content script learns
 * reaches storage — and a field quietly left out of it is invisible from both
 * sides: the indexer's own tests pass, the worker's own tests pass, and the
 * value never arrives. That is exactly how playlist titles went missing.
 */

let syncAbort: AbortController | null = null;

export function cancelSync(reason: string): void {
  if (!syncAbort) return;
  log.debug('cancelling sync', { reason });
  syncAbort.abort();
  syncAbort = null;
}

/**
 * Indexes the requested playlists one at a time. Concurrency stays at 1 across
 * playlists as well as within one (spec §4.3) — parallel fetching is exactly
 * the traffic pattern that gets a session rate-limited.
 */
export async function runSyncJob(playlistIds: readonly string[]): Promise<SyncRunResponse> {
  cancelSync('superseded');
  const controller = new AbortController();
  syncAbort = controller;

  const entries: IndexEntry[] = [];
  const titles: Record<string, string> = {};
  try {
    for (const playlistId of playlistIds) {
      if (controller.signal.aborted) break;
      if (!isPlaylistId(playlistId)) continue;
      const result = await indexPlaylist(playlistId, { signal: controller.signal });
      // The title rides beside the entry, not inside it: an IndexEntry is
      // exactly what the index store holds. It used to be dropped here on the
      // grounds that titles are the worker's business — but this is the only
      // context that can read one, so dropping it left the worker with nothing
      // to store and a manually added playlist displaying its id for good.
      if (result.title !== null) titles[result.playlistId] = result.title;
      entries.push({
        playlistId: result.playlistId,
        videoIds: result.videoIds,
        syncedAt: result.syncedAt,
        complete: result.complete,
      });
    }
  } finally {
    if (syncAbort === controller) syncAbort = null;
  }
  return { entries, titles };
}
