/**
 * Every CSS selector the popup uses (spec §10.6).
 *
 * These match the popup's own markup, not YouTube's, so they live beside the
 * popup rather than in content/selectors.ts: the two surfaces share no
 * selector, and only the YouTube list goes stale when someone else ships.
 */
export const I18N_TEXT = '[data-i18n]';
export const I18N_ARIA = '[data-i18n-aria]';

export const FRAME = '.frame';
export const OPEN_FRAME = '.frame.is-confirming';
export const ROW = '.row';
export const REMOVE = '.remove';
export const CONFIRM = '.confirm';
export const CONFIRM_YES = '.confirm-yes';
export const CONFIRM_NO = '.confirm-no';

export function rowFor(playlistId: string): string {
  return `${ROW}[data-playlist-id="${CSS.escape(playlistId)}"]`;
}

export function removeFor(playlistId: string): string {
  return `${REMOVE}[data-playlist-id="${CSS.escape(playlistId)}"]`;
}
