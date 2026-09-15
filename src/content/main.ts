import { DEBUG_ATTR, HIDDEN_ATTR, STYLE_ID } from './selectors.js';
import { Scanner, findGridContainer } from './scanner.js';
import { clearSeen, unhideAll } from './hider.js';
import { cancelSync, runSyncJob } from './sync-job.js';
import { buildHiddenVideoSet } from '../core/index-store.js';
import { readSettings } from '../core/settings.js';
import { isMessage, isTrustedSender } from '../core/messaging.js';
import type { PlaylistId } from '../core/types.js';
import { log } from '../core/logger.js';

/**
 * Runs at document_start on youtube.com.
 *
 * Two jobs: filter the homepage grid, and serve indexing jobs for the service
 * worker, which cannot reach the network itself (spec §2.1).
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

// ---- filtering --------------------------------------------------------------

const scanner = new Scanner();
let attached = false;

/**
 * Waits a bounded number of frames for the grid to exist. The document is empty
 * at document_start, and spec §5.4 forbids polling — so this gives up rather
 * than watching forever, and the next yt-navigate-finish will try again.
 */
function waitForGrid(framesLeft: number, then: (grid: Element) => void): void {
  const grid = findGridContainer();
  if (grid) {
    then(grid);
    return;
  }
  if (framesLeft <= 0) return;
  requestAnimationFrame(() => waitForGrid(framesLeft - 1, then));
}

function detach(): void {
  if (!attached) return;
  scanner.stop();
  attached = false;
}

async function refresh(): Promise<void> {
  const settings = await readSettings();

  // Master toggle (FR-08): everything comes back with no page reload, because
  // hiding was only ever an attribute.
  if (!settings.enabled) {
    detach();
    unhideAll();
    return;
  }

  const videos = await buildHiddenVideoSet(settings);
  const playlists = new Set<PlaylistId>(
    Object.entries(settings.playlists)
      .filter(([, value]) => value.hidden)
      .map(([id]) => id),
  );

  scanner.setHidden({ videos, playlists });
  scanner.setDebug(settings.debugOverlay);

  if (!isHomepage()) {
    detach();
    return;
  }

  // The sets just changed, so previous verdicts are stale: a card judged
  // visible under the old settings has to be judged again, not skipped.
  clearSeen();

  waitForGrid(60, (grid) => {
    scanner.start(grid);
    attached = true;
  });
}

// ---- wiring -----------------------------------------------------------------

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

  // The worker is the only writer, so its writes are the change signal. This is
  // what makes the master toggle and a finished sync take effect live.
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area !== 'local') return;
    void refresh();
  });

  // YouTube is a single-page app: navigation does not reload the document.
  window.addEventListener('yt-navigate-finish', () => {
    log.debug('navigation', { homepage: isHomepage() });
    void refresh();
  });

  window.addEventListener('pagehide', () => {
    cancelSync('pagehide');
    detach();
  });

  void refresh();
}

start();
