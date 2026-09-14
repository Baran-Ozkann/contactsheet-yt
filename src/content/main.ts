import { DEBUG_ATTR, HIDDEN_ATTR, STYLE_ID } from './selectors.js';
import { log } from '../core/logger.js';

/**
 * Runs at document_start on youtube.com.
 *
 * Phase 0 scope: inject the stylesheet and prove the script loads. The scanner,
 * hider and indexer are added in Phases 3 and 4. Nothing here hides anything
 * yet — and nothing ever hides on a failure path (spec NFR-04, fail-open).
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

function start(): void {
  injectStyle();
  log.debug('content script ready', { homepage: isHomepage() });

  // YouTube is a single-page app: navigation does not reload the document.
  window.addEventListener('yt-navigate-finish', () => {
    log.debug('navigation', { homepage: isHomepage() });
    // Phase 4: attach/detach the MutationObserver here.
  });
}

start();
