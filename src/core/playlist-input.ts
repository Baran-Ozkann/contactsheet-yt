import { isPlaylistId, type PlaylistId } from './types.js';

/**
 * Manual playlist entry (spec FR-11, §4.1).
 *
 * The user pastes a URL. We never ask for a playlist *name*: names are not
 * unique, get renamed, and cannot be matched against a card's href. Everything
 * downstream keys on the id.
 *
 * Accepted:
 *   https://www.youtube.com/playlist?list=PLabc123
 *   https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123
 *   youtube.com/playlist?list=WL
 *   PLabc123        (bare id)
 *   WL / LL
 */
export function parsePlaylistInput(raw: string): PlaylistId | null {
  const input = raw.trim();
  if (input === '') return null;

  // Bare id, pasted without a URL around it.
  if (!input.includes('/') && !input.includes('?')) {
    return isPlaylistId(input) ? input : null;
  }

  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^m\./, '').replace(/^www\./, '');
  if (host !== 'youtube.com' && host !== 'music.youtube.com') return null;

  const list = url.searchParams.get('list');
  return isPlaylistId(list) ? list : null;
}

/**
 * Watch Later and Liked videos are system playlists with fixed ids, so the
 * popup can offer them as one-tap additions instead of making the user hunt
 * for a URL.
 */
export const SYSTEM_PLAYLISTS: ReadonlyArray<{ id: PlaylistId; messageKey: string }> = [
  { id: 'WL', messageKey: 'playlistWatchLater' },
  { id: 'LL', messageKey: 'playlistLiked' },
];
