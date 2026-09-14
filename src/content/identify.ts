import { isPlaylistId, isVideoId, type PlaylistId, type VideoId } from '../core/types.js';

export interface CardIdentity {
  videoId: VideoId | null;
  playlistId: PlaylistId | null;
}

const EMPTY: CardIdentity = { videoId: null, playlistId: null };

/**
 * Pure so it can be tested without a DOM. Uses the URL parser rather than a
 * regex (spec §5.2) — YouTube hrefs carry a long tail of tracking params and
 * hand-rolled matching gets them wrong.
 */
export function identifyHref(href: string, base = 'https://www.youtube.com'): CardIdentity {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return EMPTY;
  }

  if (url.hostname !== 'www.youtube.com' && url.hostname !== 'youtube.com') return EMPTY;

  const list = url.searchParams.get('list');
  const playlistId = isPlaylistId(list) ? list : null;

  if (url.pathname === '/watch') {
    const v = url.searchParams.get('v');
    return { videoId: isVideoId(v) ? v : null, playlistId };
  }

  if (url.pathname === '/playlist') {
    return { videoId: null, playlistId };
  }

  // /shorts/<id> uses a path segment rather than a query param.
  if (url.pathname.startsWith('/shorts/')) {
    const id = url.pathname.slice('/shorts/'.length).split('/')[0] ?? '';
    return { videoId: isVideoId(id) ? id : null, playlistId };
  }

  return EMPTY;
}

/** Reads the first usable anchor inside a card element. */
export function identifyElement(el: Element): CardIdentity {
  const anchors = el.querySelectorAll('a[href]');
  for (const anchor of anchors) {
    const href = anchor.getAttribute('href');
    if (!href) continue;
    const identity = identifyHref(href);
    if (identity.videoId || identity.playlistId) return identity;
  }
  return EMPTY;
}
