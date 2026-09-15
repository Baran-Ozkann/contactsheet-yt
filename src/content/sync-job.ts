import { indexPlaylist } from './indexer.js';
import { isPlaylistId, type IndexEntry } from '../core/types.js';
import { log } from '../core/logger.js';

/**
 * Serving indexing jobs for the service worker, which cannot reach the network
 * itself (spec §2.1).
 *
 * Separate from main.ts so the reply this builds can be tested. The reply is a
 * trust boundary — it is the only way anything the content script learns
 * reaches storage — and main.ts registers chrome listeners on import, so
 * nothing could build one in a test.
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
export async function runSyncJob(
  playlistIds: readonly string[],
): Promise<{ entries: IndexEntry[] }> {
  cancelSync('superseded');
  const controller = new AbortController();
  syncAbort = controller;

  const entries: IndexEntry[] = [];
  try {
    for (const playlistId of playlistIds) {
      if (controller.signal.aborted) break;
      if (!isPlaylistId(playlistId)) continue;
      const result = await indexPlaylist(playlistId, { signal: controller.signal });
      // Drop the display-only title before crossing the boundary; the worker
      // stores index entries, and settings titles are its own business.
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
  return { entries };
}
