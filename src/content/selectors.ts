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

/**
 * Links that identify a card. Used to recognise a card no layered selector
 * knows (the §5.3 generic fallback), and to find the href to read once a card
 * is recognised.
 */
export const IDENTIFIABLE_LINK = 'a[href*="/watch"], a[href*="/playlist"]';
export const ANY_LINK = 'a[href]';

export const HIDDEN_ATTR = 'data-cs-hidden';
export const SEEN_ATTR = 'data-cs-seen';
export const DEBUG_ATTR = 'data-cs-debug';
export const STYLE_ID = 'cs-style';

/** Everything we marked, whatever the value — teardown has to find it all. */
export const HIDDEN_MARKED = `[${HIDDEN_ATTR}]`;
export const SEEN_MARKED = `[${SEEN_ATTR}]`;

/**
 * The one stylesheet we inject. Hiding is an attribute plus this rule, never a
 * write to the card's own style (spec §5.1).
 */
export const HIDING_CSS = `
[${HIDDEN_ATTR}="1"] { display: none !important; }
[${HIDDEN_ATTR}="1"][${DEBUG_ATTR}="1"] {
  display: block !important;
  opacity: .28;
  outline: 2px solid #D0342C;
  outline-offset: -2px;
}
`;

export function firstMatch(root: ParentNode, slot: keyof typeof SELECTORS): Element | null {
  for (const selector of SELECTORS[slot]) {
    const found = root.querySelector(selector);
    if (found) return found;
  }
  return null;
}
