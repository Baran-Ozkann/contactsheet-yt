/**
 * Audits what ships, not what was written.
 *
 * Lint proves the source is clean; this proves the package is. They are not
 * the same claim — a bundler can inline a dependency, a define can resurrect a
 * branch, a stray asset can carry a URL — and the README's promises are about
 * the package. Run by build.mjs on every production build, so CI and
 * `npm run zip` both refuse an artifact that breaks one.
 */

/** Spec §7: the patterns that must never appear in a shipped file. */
export const FORBIDDEN = [
  { rule: '§7.13', what: 'console.debug', pattern: /console\.debug\b/ },
  { rule: '§7.1', what: 'eval', pattern: /\beval\s*\(/ },
  { rule: '§7.1', what: 'Function constructor', pattern: /\bFunction\s*\(/ },
  { rule: '§7.2', what: 'HTML sink', pattern: /\b(innerHTML|outerHTML|insertAdjacentHTML)\b/ },
  { rule: '§7.15', what: 'cookie access', pattern: /document\.cookie|chrome\.cookies|\bSAPISID/i },
  { rule: '§7.15', what: 'Authorization header', pattern: /["']?authorization["']?\s*:/i },
];

/**
 * The only absolute URLs allowed to appear. The SVG namespace is an
 * identifier passed to createElementNS, never fetched.
 */
export const ALLOWED_ORIGINS = ['https://www.youtube.com', 'http://www.w3.org/2000/svg'];

/**
 * Literal hosts only. A URL whose host is interpolated (`https://${input}`, as
 * parsePlaylistInput does to pasted text before parsing it) cannot be judged
 * from text; request sites are covered by review instead — there are three
 * fetch calls, all built on a fixed origin.
 */
const URL_PATTERN = /\b(?:https?|wss?):\/\/[A-Za-z0-9][^\s"'`)<>\\$]*/gi;

/**
 * A URL passes only if it is an allowed origin exactly, or continues with a
 * path. A bare prefix match would let `https://www.youtube.com.example.net`
 * through.
 */
export function isAllowedUrl(url) {
  return ALLOWED_ORIGINS.some((origin) => url === origin || url.startsWith(`${origin}/`));
}

/**
 * Findings for one file's text. Empty means clean.
 * @param {string} source
 * @returns {{ rule: string, what: string, match: string }[]}
 */
export function auditSource(source) {
  const findings = [];
  for (const { rule, what, pattern } of FORBIDDEN) {
    const hit = pattern.exec(source);
    if (hit) findings.push({ rule, what, match: hit[0] });
  }
  for (const [url] of source.matchAll(URL_PATTERN)) {
    if (!isAllowedUrl(url)) findings.push({ rule: '§7.4', what: 'URL outside youtube.com', match: url });
  }
  return findings;
}
