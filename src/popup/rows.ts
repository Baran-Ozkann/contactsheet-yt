import { buildCross } from './cross.js';
import { perforate } from './sprocket.js';
import type { PlaylistView } from '../core/messaging.js';

/**
 * Building the strip's frames.
 *
 * Separate from popup.ts because that module registers chrome listeners and
 * calls start() on import, so nothing there can be built in a test. Everything
 * here is pure DOM: the chrome-dependent parts — translation and number
 * formatting — arrive as a context rather than being reached for.
 */

export interface RowContext {
  /** chrome.i18n lookup (spec §10 rule 13). */
  t: (key: string, ...substitutions: string[]) => string;
  /** Locale-aware number formatting. */
  num: (value: number) => string;
}

export function rowNote(view: PlaylistView, ctx: RowContext): string | null {
  // A hidden playlist with no index is L0: its card goes, its videos stay. That
  // is legitimate, and saying so beats letting the user guess (spec §4.0).
  if (view.hidden && view.layer === 'L0') return ctx.t('popupLayerCardOnly');
  if (view.hidden && view.partial) {
    return ctx.t(
      'popupPartial',
      ctx.num(view.indexedCount),
      ctx.num(view.itemCount ?? view.indexedCount),
    );
  }
  return null;
}

export function buildRow(
  view: PlaylistView,
  position: number,
  ctx: RowContext,
): HTMLButtonElement {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'row';
  row.setAttribute('role', 'switch');
  row.setAttribute('aria-checked', String(view.hidden));
  row.dataset.playlistId = view.id;
  // The row's own hole in the sprocket gutter. It takes grease from the same
  // aria-checked the cross does, so the margin cannot disagree with the list.
  perforate(row, position - 1);

  const no = document.createElement('span');
  no.className = 'row-no';
  no.textContent = String(position).padStart(2, '0');

  const title = document.createElement('span');
  title.className = 'row-title';
  title.textContent = view.title; // textContent only — spec §7 rule 2

  const count = document.createElement('span');
  count.className = 'row-count';
  count.textContent = ctx.t('popupRowVideos', ctx.num(view.indexedCount));

  row.append(no, title, count);

  const note = rowNote(view, ctx);
  if (note !== null) {
    const noteEl = document.createElement('span');
    noteEl.className = 'row-note';
    noteEl.textContent = note;
    row.append(noteEl);
  }

  row.append(buildCross());
  return row;
}
