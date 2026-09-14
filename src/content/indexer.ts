import {
  extractClientConfig,
  extractContinuationTokens,
  extractPlaylistTitle,
  extractVideoIds,
  extractYtInitialData,
  fetchContinuation,
  fetchPlaylistHtml,
  type ClientConfig,
} from './innertube.js';
import { MAX_VIDEO_IDS_PER_PLAYLIST } from '../core/schema.js';
import type { IndexEntry, PlaylistId, VideoId } from '../core/types.js';
import { log } from '../core/logger.js';

/**
 * Walks a playlist: page 1 from the HTML (Path 1), the rest through unsigned
 * continuation requests (Path 2). Per ADR-0002 and spec §4.3.
 *
 * The governing rule is that failure narrows the index, never widens it. Any
 * error, abort or cap produces a partial entry with `complete:false`, and a
 * partial entry only ever hides fewer videos than a full one. No path here can
 * cause something to be hidden that was not matched (NFR-04).
 */

/** Spec §4.3 — sequential requests, never closer together than this. */
export const MIN_REQUEST_SPACING_MS = 400;
/** Spec §4.3 — hard ceiling on continuation pages for one playlist. */
export const MAX_CONTINUATION_PAGES = 200;
/** Spec §4.3: four attempts with three delays. */
export const MAX_ATTEMPTS = 4;
export const BACKOFF_MS: readonly number[] = [1_000, 2_000, 4_000];

export interface IndexProgress {
  playlistId: PlaylistId;
  videoCount: number;
  pages: number;
}

export interface IndexOptions {
  signal?: AbortSignal;
  onProgress?: (progress: IndexProgress) => void;
  /** Injected in tests so the backoff ladder does not run in real time. */
  sleep?: (ms: number) => Promise<void>;
  maxPages?: number;
}

export interface IndexResult extends IndexEntry {
  /** Display only; null when the shape was not recognised (spec §4.1). */
  title: string | null;
}

function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One continuation request with the spec §4.3 retry ladder. Returns undefined
 * once the attempts are spent, which the caller turns into `complete:false`.
 */
async function requestWithBackoff(
  token: string,
  config: ClientConfig,
  options: Required<Pick<IndexOptions, 'sleep'>> & { signal?: AbortSignal },
): Promise<unknown> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (options.signal?.aborted) return undefined;
    const response = await fetchContinuation(token, config, options.signal);
    if (response !== undefined) return response;
    const wait = BACKOFF_MS[attempt];
    if (wait === undefined) break;
    await options.sleep(wait);
  }
  return undefined;
}

export async function indexPlaylist(
  playlistId: PlaylistId,
  options: IndexOptions = {},
): Promise<IndexResult> {
  const sleep = options.sleep ?? realSleep;
  const maxPages = options.maxPages ?? MAX_CONTINUATION_PAGES;
  const signal = options.signal;

  const videoIds: VideoId[] = [];
  const seen = new Set<VideoId>();
  let title: string | null = null;

  const absorb = (ids: readonly VideoId[]): number => {
    let added = 0;
    for (const id of ids) {
      if (seen.has(id) || videoIds.length >= MAX_VIDEO_IDS_PER_PLAYLIST) continue;
      seen.add(id);
      videoIds.push(id);
      added += 1;
    }
    return added;
  };

  const finish = (complete: boolean, pages: number): IndexResult => {
    options.onProgress?.({ playlistId, videoCount: videoIds.length, pages });
    return { playlistId, videoIds, syncedAt: Date.now(), complete, title };
  };

  // ---- Path 1: page 1 from the playlist HTML -------------------------------
  const html = await fetchPlaylistHtml(playlistId, signal);
  if (html === null) return finish(false, 0);

  const page1 = extractYtInitialData(html);
  if (page1 === undefined) return finish(false, 0);

  title = extractPlaylistTitle(page1);
  absorb(extractVideoIds(page1));
  options.onProgress?.({ playlistId, videoCount: videoIds.length, pages: 0 });

  let candidates = extractContinuationTokens(page1);
  // No continuation at all means the playlist fit on one page — genuinely done.
  if (candidates.length === 0) return finish(true, 0);

  // Config lives in the same HTML we already fetched, so Path 2 costs no extra
  // request. Without it we stay at L1: page 1 only, explicitly incomplete.
  const config = extractClientConfig(html);
  if (config === null) {
    log.debug('no innertube config; staying at L1');
    return finish(false, 0);
  }

  // ---- Path 2: the continuation chain --------------------------------------
  const usedTokens = new Set<string>();
  let established = false;
  let pages = 0;

  while (pages < maxPages) {
    if (signal?.aborted) return finish(false, pages);

    // ADR-0002: several tokens exist and only one returns content. Before the
    // chain is established, try them in ranked order and keep the first that
    // actually yields videos. Afterwards the top-ranked token is the chain.
    const toTry = established ? candidates.slice(0, 1) : candidates;
    let response: unknown;
    let progressed = false;

    for (const token of toTry) {
      if (usedTokens.has(token)) continue;
      usedTokens.add(token);
      await sleep(MIN_REQUEST_SPACING_MS);
      if (signal?.aborted) return finish(false, pages);

      const candidateResponse = await requestWithBackoff(token, config, { sleep, ...(signal ? { signal } : {}) });
      if (candidateResponse === undefined) continue;

      const ids = extractVideoIds(candidateResponse);
      // An established chain may legitimately hand back a page with nothing new;
      // an unestablished one has to prove the token works by returning videos.
      if (!established && ids.length === 0) continue;

      response = candidateResponse;
      absorb(ids);
      progressed = true;
      break;
    }

    if (!progressed) return finish(false, pages);

    pages += 1;
    established = true;
    options.onProgress?.({ playlistId, videoCount: videoIds.length, pages });

    const next = extractContinuationTokens(response).filter((token) => !usedTokens.has(token));
    // No fresh token means the chain ended cleanly. Filtering out tokens we have
    // already spent also stops a repeated token from looping forever.
    if (next.length === 0) return finish(true, pages);
    candidates = next;
  }

  // Hit the page ceiling: keep what we have, flagged incomplete.
  log.debug('continuation cap reached');
  return finish(false, pages);
}
