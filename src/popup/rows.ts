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

/**
 * One film frame: the switch, plus the quiet remove control over its right
 * edge (FR-13).
 *
 * The control cannot live inside the row, because the row is a `<button>` and
 * a button may not contain another one. So the frame is a wrapper with no
 * appearance of its own — the row keeps its background, padding, perforation
 * and cross — and the control is a sibling positioned over it. That is also
 * what keeps the two actions apart: a click on the control never reaches the
 * delegated toggle handler, because `closest('.row')` does not cross out of
 * the button.
 */
export function buildFrame(
  view: PlaylistView,
  position: number,
  ctx: RowContext,
): HTMLDivElement {
  const frame = document.createElement('div');
  frame.className = 'frame';
  frame.append(buildRow(view, position, ctx), buildRemove(view, ctx));
  return frame;
}

/**
 * Quiet by construction: no button chrome, no accent, the secondary register
 * (spec §6.5). Toggling is the primary action and this must not compete with
 * it — but it is always rendered rather than revealed on hover, because a
 * control nobody can find is not a control, and the strip stays keyboard
 * navigable either way.
 */
export function buildRemove(view: PlaylistView, ctx: RowContext): HTMLButtonElement {
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'remove';
  remove.dataset.playlistId = view.id;
  remove.setAttribute('aria-label', ctx.t('popupRemoveLabel', view.title));
  // A minus sign, not a cross: the grease cross is the row's state mark, and a
  // second X on the same row reads as one more of those instead of an action.
  // Removing an entry from a list is what a minus already means. Plain text,
  // so still no icon font and no emoji (spec §6).
  remove.textContent = '−';
  return remove;
}

/**
 * The inline confirmation (FR-13, spec §6.5).
 *
 * Its own frame in the strip, under the row it belongs to, rather than a
 * modal: a 380x520 popup has no room for an overlay and does not need one.
 *
 * It names the playlist and says what goes with it, because the index is the
 * expensive part to lose — re-adding restores the entry but not the videos,
 * and a resync needs a YouTube tab open. Confirm and cancel are separate
 * targets, so no repeated click on one spot can remove anything.
 */
export function buildConfirm(view: PlaylistView, ctx: RowContext): HTMLDivElement {
  const panel = document.createElement('div');
  panel.className = 'confirm perf';
  panel.dataset.playlistId = view.id;
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', ctx.t('popupRemoveConfirm', view.title));

  const question = document.createElement('p');
  question.className = 'confirm-question';
  question.textContent = ctx.t('popupRemoveConfirm', view.title);

  const consequence = document.createElement('p');
  consequence.className = 'confirm-consequence';
  consequence.textContent =
    view.indexedCount > 0
      ? ctx.t('popupRemoveIndexed', ctx.num(view.indexedCount))
      : ctx.t('popupRemoveNotIndexed');

  const actions = document.createElement('div');
  actions.className = 'confirm-actions';

  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.className = 'link confirm-yes';
  confirm.dataset.playlistId = view.id;
  confirm.textContent = ctx.t('actionRemove');

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'link confirm-no';
  cancel.textContent = ctx.t('actionCancel');

  actions.append(confirm, cancel);
  panel.append(question, consequence, actions);
  return panel;
}

/** What a click inside the strip means. */
export type StripAction =
  | { kind: 'open-confirm'; playlistId: string }
  | { kind: 'remove'; playlistId: string }
  | { kind: 'cancel' }
  | { kind: 'toggle'; playlistId: string }
  | null;

/**
 * Maps a click target to the action it means, in one place, so the ordering
 * that keeps removal behind a confirmation is testable rather than reviewable.
 * The remove control and both confirmation buttons are matched before the row,
 * and none of them is inside it.
 */
export function classifyClick(target: Element | null): StripAction {
  if (!target) return null;

  const remove = target.closest<HTMLElement>('.remove');
  if (remove?.dataset.playlistId) {
    return { kind: 'open-confirm', playlistId: remove.dataset.playlistId };
  }

  const confirmed = target.closest<HTMLElement>('.confirm-yes');
  if (confirmed?.dataset.playlistId) {
    return { kind: 'remove', playlistId: confirmed.dataset.playlistId };
  }

  if (target.closest('.confirm-no')) return { kind: 'cancel' };

  const row = target.closest<HTMLElement>('.row');
  if (row?.dataset.playlistId) return { kind: 'toggle', playlistId: row.dataset.playlistId };

  return null;
}
