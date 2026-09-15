import { isVideoId, type IndexEntry, type VideoId } from './types.js';

/**
 * Validators for everything that crosses a trust boundary: YouTube responses,
 * storage reads, and messages from another extension context. Spec §7.7.
 *
 * The contract is always the same — an invalid record is dropped silently and
 * the caller gets a usable value back. Nothing here throws, because a throw on
 * the hiding path would break fail-open (NFR-04).
 */

/** Spec §7.7 — a single playlist may not contribute more than this. */
export const MAX_VIDEO_IDS_PER_PLAYLIST = 50_000;
/** Display titles are cut here, wherever they enter. */
export const MAX_TITLE_LENGTH = 200;
/** Spec §7.7 — refuse to parse a body larger than this. */
export const MAX_JSON_BYTES = 8 * 1024 * 1024;
/** Spec §7.7 — bound on nesting, so a hostile payload cannot exhaust the stack. */
export const MAX_PARSE_DEPTH = 64;

/**
 * UTF-8 length without allocating a copy of an 8 MB string in the common case.
 * A UTF-16 code unit encodes to at least 1 and at most 3 UTF-8 bytes (a
 * surrogate pair is 2 units and 4 bytes, so the bound holds), which lets us
 * decide most inputs from `length` alone.
 */
function withinByteBudget(text: string, maxBytes: number): boolean {
  if (text.length > maxBytes) return false;
  if (text.length * 3 <= maxBytes) return true;
  return new TextEncoder().encode(text).length <= maxBytes;
}

/** True when `value` nests deeper than `maxDepth`. Bails at the limit. */
export function exceedsDepth(value: unknown, maxDepth: number = MAX_PARSE_DEPTH): boolean {
  function walk(node: unknown, depth: number): boolean {
    if (node === null || typeof node !== 'object') return false;
    if (depth >= maxDepth) return true;
    if (Array.isArray(node)) {
      for (const item of node) if (walk(item, depth + 1)) return true;
      return false;
    }
    for (const item of Object.values(node)) if (walk(item, depth + 1)) return true;
    return false;
  }
  return walk(value, 0);
}

/**
 * JSON.parse with the size and depth limits applied. Returns `undefined` for
 * anything rejected, so callers branch on a value rather than on an exception.
 */
export function safeJsonParse(text: unknown, maxBytes: number = MAX_JSON_BYTES): unknown {
  if (typeof text !== 'string') return undefined;
  if (!withinByteBudget(text, maxBytes)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  return exceedsDepth(parsed) ? undefined : parsed;
}

/**
 * Keeps only well-formed video ids, in first-seen order, deduplicated and
 * capped. Order matters: it mirrors playlist order, which the popup shows when
 * an index is partial.
 */
export function sanitizeVideoIds(
  raw: unknown,
  cap: number = MAX_VIDEO_IDS_PER_PLAYLIST,
): VideoId[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<VideoId>();
  for (const candidate of raw) {
    if (!isVideoId(candidate)) continue;
    seen.add(candidate);
    if (seen.size >= cap) break;
  }
  return [...seen];
}

/**
 * Coerces a stored or received index record. Returns null when the record has
 * no usable identity; an entry with zero surviving ids is still valid, since
 * "this playlist is known to be empty" is a real state.
 */
export function coerceIndexEntry(raw: unknown, playlistId: string): IndexEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Partial<IndexEntry>;
  const syncedAt = typeof input.syncedAt === 'number' && Number.isFinite(input.syncedAt) ? input.syncedAt : 0;
  const videoIds = sanitizeVideoIds(input.videoIds);
  // A truncated list cannot claim completeness, whatever the stored flag says.
  const complete = input.complete === true && videoIds.length === (Array.isArray(input.videoIds) ? input.videoIds.length : 0);
  return { playlistId, videoIds, syncedAt, complete };
}
