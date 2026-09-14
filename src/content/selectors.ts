/**
 * Every CSS selector in this project lives here (spec §10.6).
 *
 * YouTube A/B-tests its component names, so each slot is a layered list:
 * try them in order, first match wins, and if none match fall back to the
 * generic anchor walk in scanner.ts rather than guessing.
 *
 * Last verified against YouTube web: 2026-09-14. Confirmed live on the signed-in
 * homepage — the debug overlay marked the expected cards, and real hiding left
 * the grid intact with no gaps.
 */
export const SELECTORS = {
  grid: [
    'ytd-rich-grid-renderer',
    'ytd-two-column-browse-results-renderer',
  ],
  item: [
    'ytd-rich-item-renderer',
    'ytd-rich-grid-media',
    'yt-lockup-view-model',
  ],
  section: [
    'ytd-rich-section-renderer',
    'ytd-rich-shelf-renderer',
  ],
} as const;

export const HIDDEN_ATTR = 'data-cs-hidden';
export const SEEN_ATTR = 'data-cs-seen';
export const DEBUG_ATTR = 'data-cs-debug';
export const STYLE_ID = 'cs-style';

export function firstMatch(root: ParentNode, slot: keyof typeof SELECTORS): Element | null {
  for (const selector of SELECTORS[slot]) {
    const found = root.querySelector(selector);
    if (found) return found;
  }
  return null;
}
