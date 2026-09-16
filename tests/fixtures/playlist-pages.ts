/**
 * Playlist page-1 payloads, in both render shapes (ADR-0002).
 *
 * Minimal reconstructions, not captures: real responses carry real video ids
 * and account data and may never be committed (spec §10 rule 11). Every field
 * below is one ADR-0002 measured — the lockup marker pair, the legacy renderer
 * name, `continuationCommand.token`, and the empty continuation body — and
 * nothing else is invented around them.
 *
 * They exist because the two shapes behave differently at the end of the
 * playlist, which is what the 2026-09-16 pass found: `WL` (legacy) finished
 * with no token at all, while twelve lockup playlists that fit on one page
 * each carried a token anyway.
 */

export const API_KEY = 'AIzaSyAO_Fake_Key_For_Tests_123';
export const CLIENT_VERSION = '2.20260911.01.00';

/** Scrubbed 11-character ids, shaped like the real thing and belonging to no one. */
export function videoId(n: number): string {
  return `vid${String(n).padStart(8, '0')}`;
}

/** New shape: the marker pair is the discriminator, never the parent key. */
export function lockupItem(id: string): unknown {
  return { lockupViewModel: { contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: id } };
}

/** Old shape: here the renderer name IS the discriminator. */
export function legacyItem(id: string): unknown {
  return { playlistVideoRenderer: { videoId: id } };
}

/** A token in the item list's own section — the one ADR-0002 found works. */
export function itemListToken(token: string): unknown {
  return { continuationItemViewModel: { continuationCommand: { token } } };
}

/**
 * A token somewhere else on the page. ADR-0002 measured two tokens on one page
 * and only the item-list one returned content; this is the other.
 */
export function offListToken(token: string): unknown {
  return { engagementPanels: [{ continuationCommand: { token } }] };
}

/**
 * What a token that is not a video continuation answers with: HTTP 200 and a
 * body carrying no items. Measured in ADR-0002.
 */
export const EMPTY_CONTINUATION = { responseContext: {}, trackingParams: 'scrubbed' };

export interface PageOptions {
  /** A token in the item list section, as a longer playlist carries. */
  itemToken?: string;
  /** A token outside the item list, which a lockup page carries regardless. */
  offToken?: string;
}

function pageOf(items: unknown[], options: PageOptions = {}): Record<string, unknown> {
  const contents: unknown[] = [...items];
  if (options.itemToken !== undefined) contents.push(itemListToken(options.itemToken));
  const page: Record<string, unknown> = { contents };
  if (options.offToken !== undefined) Object.assign(page, offListToken(options.offToken));
  return page;
}

/** An ordinary `PL...` playlist: the shape twelve of thirteen lists came back in. */
export function lockupPage(ids: readonly string[], options?: PageOptions): Record<string, unknown> {
  return pageOf(ids.map(lockupItem), options);
}

/** `WL`, which is still served in the old shape. */
export function legacyPage(ids: readonly string[], options?: PageOptions): Record<string, unknown> {
  return pageOf(ids.map(legacyItem), options);
}

/**
 * The served HTML around a payload. `withConfig` off is the signed-out or
 * stripped page, where Path 2 is unavailable and the index stays at L1.
 */
export function pageHtml(data: unknown, withConfig = true): string {
  const config = withConfig
    ? `"INNERTUBE_API_KEY":"${API_KEY}","INNERTUBE_CLIENT_VERSION":"${CLIENT_VERSION}",`
    : '';
  return `<html><script>var ytcfg = {${config}"x":1};</script><script>var ytInitialData = ${JSON.stringify(data)};</script></html>`;
}
