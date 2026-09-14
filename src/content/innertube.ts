import { MAX_PARSE_DEPTH, MAX_VIDEO_IDS_PER_PLAYLIST, safeJsonParse } from '../core/schema.js';
import { isVideoId, type VideoId } from '../core/types.js';

/**
 * YouTube data access (spec §4, ADR-0002).
 *
 * Everything here runs in the content script on www.youtube.com, so session
 * cookies ride along on same-origin requests and no credential ever reaches
 * the service worker. No cookie is read and no request is signed — ADR-0002
 * measured that unsigned continuation requests return identical results.
 */

export interface ClientConfig {
  apiKey: string;
  clientVersion: string;
}

/** Bounded so a hostile page cannot feed us an arbitrarily long "key". */
const API_KEY_RE = /"INNERTUBE_API_KEY":"([A-Za-z0-9_-]{20,60})"/;
const CLIENT_VERSION_RE = /"INNERTUBE_CLIENT_VERSION":"([0-9][0-9.]{3,31})"/;

/**
 * The markers YouTube has used to embed the initial payload. Order matters
 * only in that the first hit wins; all three have been seen in the wild.
 */
const YT_INITIAL_DATA_MARKERS = [
  'var ytInitialData =',
  'window["ytInitialData"] =',
  'ytInitialData =',
];

/**
 * Returns the balanced `{...}` run starting at `start`, or null if it never
 * closes. A regex cannot do this: the payload contains braces inside string
 * literals, so matching has to track string state and escapes.
 */
export function matchBalancedObject(source: string, start: number): string | null {
  if (source[start] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

/** Pulls the first balanced object that follows `marker`. */
export function extractJsonAfter(source: string, marker: string): unknown {
  const markerAt = source.indexOf(marker);
  if (markerAt === -1) return undefined;
  const braceAt = source.indexOf('{', markerAt + marker.length);
  if (braceAt === -1) return undefined;
  const raw = matchBalancedObject(source, braceAt);
  return raw === null ? undefined : safeJsonParse(raw);
}

/**
 * The `ytInitialData` payload embedded in a YouTube HTML document. Returns
 * undefined when absent or unparseable — callers then index nothing, which
 * hides nothing (NFR-04).
 */
export function extractYtInitialData(html: string): unknown {
  for (const marker of YT_INITIAL_DATA_MARKERS) {
    const data = extractJsonAfter(html, marker);
    if (data !== undefined) return data;
  }
  return undefined;
}

/**
 * The InnerTube key and client version, read out of page HTML (ADR-0002).
 * Held in memory for the lifetime of the tab only — never written to storage
 * (spec §7 rule 5).
 */
export function extractClientConfig(html: string): ClientConfig | null {
  const apiKey = API_KEY_RE.exec(html)?.[1];
  const clientVersion = CLIENT_VERSION_RE.exec(html)?.[1];
  if (!apiKey || !clientVersion) return null;
  return { apiKey, clientVersion };
}

/**
 * Collects the video ids in a playlist payload.
 *
 * ADR-0002: collect by SHAPE, never by field name. YouTube runs two render
 * paths in parallel and both must be supported:
 *
 *   new — an object carrying contentType LOCKUP_CONTENT_TYPE_VIDEO + contentId
 *   old — an object under a `playlistVideoRenderer` key, carrying videoId
 *
 * Harvesting every field named `videoId` is forbidden and actively wrong:
 * `addedVideoId`, `removedVideoId` and `animationActivationTargetId` all hold
 * 11-character ids on the very same page, and they describe button actions
 * rather than playlist contents. In the ADR measurement six different keys each
 * carried 100 ids; collecting blindly produces a set that hides wrong videos.
 *
 * Order is playlist order, which is what a partial index should truncate.
 */
export function extractVideoIds(data: unknown, cap: number = MAX_VIDEO_IDS_PER_PLAYLIST): VideoId[] {
  const found: VideoId[] = [];
  const seen = new Set<VideoId>();

  const take = (candidate: unknown): void => {
    if (!isVideoId(candidate) || seen.has(candidate)) return;
    seen.add(candidate);
    found.push(candidate);
  };

  const walk = (node: unknown, depth: number): void => {
    if (found.length >= cap) return;
    if (node === null || typeof node !== 'object') return;
    if (depth >= MAX_PARSE_DEPTH) return;

    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }

    const record = node as Record<string, unknown>;

    // New shape. Keyed on the marker field, so it matches wherever the lockup
    // sits rather than depending on the parent property name.
    if (record.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') take(record.contentId);

    // Old shape. Here the renderer name IS the discriminator — a bare object
    // carrying `videoId` is exactly the blind harvest the ADR forbids.
    const legacy = record.playlistVideoRenderer;
    if (legacy !== null && typeof legacy === 'object') {
      take((legacy as Record<string, unknown>).videoId);
    }

    for (const value of Object.values(record)) walk(value, depth + 1);
  };

  walk(data, 0);
  return found;
}

/** Tokens are opaque, but bounded — a page should not hand us a megabyte. */
const MAX_TOKEN_LENGTH = 4096;

/**
 * Ordered continuation-token candidates, best first.
 *
 * ADR-0002: `continuationCommand.token` occurs in more than one place and only
 * one of them returns content — in the measurement the other came back with
 * just {responseContext, trackingParams}. The one that works sits under
 * `continuationItemViewModel`, in the same section as the item list, so those
 * are ranked first.
 *
 * The caller tries them in order and keeps the first that yields videos; there
 * is no way to tell them apart without asking.
 */
export function extractContinuationTokens(data: unknown): string[] {
  const preferred: string[] = [];
  const fallback: string[] = [];
  const seen = new Set<string>();

  const take = (candidate: unknown, isPreferred: boolean): void => {
    if (typeof candidate !== 'string') return;
    if (candidate.length === 0 || candidate.length > MAX_TOKEN_LENGTH) return;
    if (seen.has(candidate)) return;
    seen.add(candidate);
    (isPreferred ? preferred : fallback).push(candidate);
  };

  const walk = (node: unknown, depth: number, inPreferredSubtree: boolean): void => {
    if (node === null || typeof node !== 'object') return;
    if (depth >= MAX_PARSE_DEPTH) return;

    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1, inPreferredSubtree);
      return;
    }

    const record = node as Record<string, unknown>;
    const command = record.continuationCommand;
    if (command !== null && typeof command === 'object') {
      take((command as Record<string, unknown>).token, inPreferredSubtree);
    }

    for (const [key, value] of Object.entries(record)) {
      walk(value, depth + 1, inPreferredSubtree || key === 'continuationItemViewModel');
    }
  };

  walk(data, 0, false);
  return [...preferred, ...fallback];
}
