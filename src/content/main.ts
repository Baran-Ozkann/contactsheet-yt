import { DEBUG_ATTR, HIDDEN_ATTR, STYLE_ID } from './selectors.js';
import { indexPlaylist } from './indexer.js';
import { isMessage, isTrustedSender } from '../core/messaging.js';
import { isPlaylistId, type IndexEntry } from '../core/types.js';
import { log } from '../core/logger.js';

/**
 * Runs at document_start on youtube.com.
 *
 * Phase 3 scope: inject the stylesheet and serve indexing jobs for the service
 * worker, which cannot reach the network itself (spec §2.1). The scanner and
 * hider arrive in Phase 4 — nothing here hides anything yet, and nothing ever
 * hides on a failure path (NFR-04).
 */

const CSS = `
[${HIDDEN_ATTR}="1"] { display: none !important; }
[${HIDDEN_ATTR}="1"][${DEBUG_ATTR}="1"] {
  display: block !important;
  opacity: .28;
  outline: 2px solid #D0342C;
  outline-offset: -2px;
}
`;

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS; // never innerHTML — spec §7.2
  (document.head ?? document.documentElement).append(style);
}

function isHomepage(): boolean {
  return location.pathname === '/' || location.pathname === '';
}

/**
 * Cancels in-flight indexing when the page goes away. Spec §4.3 requires a
 * clean abort on navigation or tab close rather than letting requests run on.
 */
let syncAbort: AbortController | null = null;

function cancelSync(reason: string): void {
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
async function runSyncJob(playlistIds: readonly string[]): Promise<{ entries: IndexEntry[] }> {
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

function start(): void {
  injectStyle();
  log.debug('content script ready', { homepage: isHomepage() });

  chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    if (!isTrustedSender(sender) || !isMessage(raw)) return false;
    if (raw.type !== 'sync:run') return false;

    runSyncJob(raw.playlistIds).then(sendResponse, (err: unknown) => {
      log.error('sync job failed', err);
      sendResponse({ entries: [] }); // fail-open: nothing written, nothing hidden
    });
    return true; // async response
  });

  // YouTube is a single-page app: navigation does not reload the document.
  window.addEventListener('yt-navigate-finish', () => {
    log.debug('navigation', { homepage: isHomepage() });
    // Phase 4: attach/detach the MutationObserver here.
  });

  window.addEventListener('pagehide', () => cancelSync('pagehide'));
}

start();
