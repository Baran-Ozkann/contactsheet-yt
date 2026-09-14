import { safeJsonParse } from '../core/schema.js';

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
