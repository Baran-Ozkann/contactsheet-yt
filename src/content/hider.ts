import { DEBUG_ATTR, HIDDEN_ATTR, SEEN_ATTR } from './selectors.js';

/**
 * Hiding is attribute marking and nothing else (spec §5.1).
 *
 * `element.remove()`, writing `style.display` and injecting classes are all
 * forbidden: YouTube's rich grid is a virtual list that recycles its own nodes
 * and reconciles against them. Removing or restyling a node it still owns makes
 * it fight back — blank rows, stuck scrolling, duplicated cards. An attribute
 * it does not know about is inert to the reconciler, and a stylesheet we
 * injected once turns it into `display:none`.
 *
 * Everything here is reversible, because the master toggle has to bring content
 * back without a page reload (FR-08).
 */

export function isSeen(el: Element): boolean {
  return el.hasAttribute(SEEN_ATTR);
}

export function markSeen(el: Element): void {
  el.setAttribute(SEEN_ATTR, '1');
}

export function isHidden(el: Element): boolean {
  return el.getAttribute(HIDDEN_ATTR) === '1';
}

/**
 * In debug mode the card stays visible, dimmed and outlined, instead of
 * disappearing (FR-09). The stylesheet does the work; this only sets the flag.
 */
export function hide(el: Element, debug = false): void {
  el.setAttribute(HIDDEN_ATTR, '1');
  if (debug) el.setAttribute(DEBUG_ATTR, '1');
  else el.removeAttribute(DEBUG_ATTR);
}

export function unhide(el: Element): void {
  el.removeAttribute(HIDDEN_ATTR);
  el.removeAttribute(DEBUG_ATTR);
}

/**
 * Reverses every mark we made. Used by the master toggle and on teardown, so
 * that disabling or removing the extension leaves no trace (NFR-07).
 */
export function unhideAll(root: ParentNode = document): number {
  const marked = root.querySelectorAll(`[${HIDDEN_ATTR}]`);
  for (const el of marked) unhide(el);
  return marked.length;
}

/**
 * Clears the "already processed" stamps so the next pass re-evaluates every
 * card. Needed when the hidden set changes: a card judged visible under the old
 * settings must be judged again, not skipped.
 */
export function clearSeen(root: ParentNode = document): void {
  for (const el of root.querySelectorAll(`[${SEEN_ATTR}]`)) el.removeAttribute(SEEN_ATTR);
}
