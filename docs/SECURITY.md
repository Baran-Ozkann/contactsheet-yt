# Security

## Reporting a vulnerability

Please **do not open a public issue.** Use GitHub's private vulnerability
reporting on this repository (**Security → Report a vulnerability**). Include
the version, what you did and what you observed.

Only the latest release is supported. There is no bug bounty.

## What this extension promises

- It sends no request to any address outside `www.youtube.com`.
- It never reads a cookie and never sends an `Authorization` header.
- It never calls a YouTube endpoint that writes to your account.
- It asks for `storage`, `alarms` and `https://www.youtube.com/*`, and nothing
  else.

The table below shows where each promise is enforced and how it was checked.
For the reasoning behind them, see [THREAT-MODEL.md](THREAT-MODEL.md); for what
is stored, see [PRIVACY.md](PRIVACY.md).

## How the rules are enforced

One row per hard rule in spec §7.2. Audited 2026-10-02 against branch
`phase-7-security`.

**Layers.** Most rules are enforced at more than one of these:

- **Lint:** `eslint.config.js`, run by `npm run check` and CI. Every
  security rule there is proven to fire by `tests/unit/lint-rules.test.ts`.
- **Test:** a vitest suite under `tests/unit/`.
- **Bundle audit:** `scripts/audit-bundle.mjs`, run by every production
  build (`npm run build:prod`, `npm run zip`, CI). It scans the files that
  actually ship, and fails the build without producing a zip.
- **Review:** checked by reading the code. Repeated at every release.

| # | Rule | Where it is enforced | How it was verified |
|---|---|---|---|
| 1 | No remote code | **Manifest:** CSP `script-src 'self'; object-src 'none'; base-uri 'none'`, stricter than the MV3 default. **Lint:** `no-eval`, `no-new-func`, `no-implied-eval`. **Bundle audit:** eval / `Function(` patterns. Fonts are declared from `src/assets/fonts/` only. | `manifest.test.ts` › *keeps the extension-page CSP at the spec value*. `lint-rules.test.ts` › §7.1 cases (`eval`, `window.eval`, `new Function`, `Function()`, `setTimeout(string)`). Production bundle audit clean. Every absolute URL in `dist/` is `https://www.youtube.com…` or the SVG namespace. |
| 2 | No `innerHTML` / `outerHTML` / `insertAdjacentHTML` | **Lint:** `no-restricted-properties` (dotted and computed access), `no-restricted-syntax`. **Bundle audit:** HTML-sink pattern. DOM is built with `createElement` + `textContent`. | `lint-rules.test.ts` › §7.2 cases, including `el["innerHTML"]`. `npm run lint` clean. Bundle audit clean. |
| 3 | Minimum permissions | `manifest.json`. `findYouTubeTab` (`src/background/sync.ts:45`) uses `tabs.query` with a URL filter, which the host permission covers without `tabs`. | `manifest.test.ts`: exact permissions, exact host, no optional permissions, top-frame-only content script. Mutation check: adding `"tabs"` fails the suite. A real sync ran through `findYouTubeTab` without `tabs` (QA, 2026-09-16). |
| 4 | No network request outside youtube.com | Three request sites in source, all in `src/content/innertube.ts` (lines 223, 254, 417), all built on `const ORIGIN = 'https://www.youtube.com'` (line 205). **Two ship:** `discoverPlaylists` (line 417) is never called, so esbuild drops it; `feed/playlists` occurs 0 times in the production `content/main.js`. The worker and popup make no requests. **Bundle audit:** any literal URL off the allowlist fails the build. | Source sweep for `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, `importScripts`, `new Image`, `.src =`, CSS `url(` / `@import`: only the sites above plus local font paths. `innertube-fetch.test.ts` asserts each URL. `audit-bundle.test.ts` covers look-alike hosts (`www.youtube.com.example.net`). A deliberate `https://example.com` in the popup CSS failed the build with exit 1 and no zip. |
| 5 | No credentials stored | The InnerTube config is a local in `indexPlaylist` and lives for one sync. The content script's reply carries `entries` and `titles` only. Every storage write (`settings.ts:76`, `index-store.ts:39`) goes through `coerceSettings` / `coerceIndexEntry`, which rebuild the object from a fixed field list, so no other field can reach disk. | `settings.test.ts` › *drops foreign fields instead of carrying them through*. `schema.test.ts` › `coerceIndexEntry` cases. `sync.test.ts` › *acceptEntries — content script data is re-validated*. Review of all five `storage.local.set/remove` call sites. |
| 6 | Personal data on disk is limited | The same fixed-field coercers. Stored keys are `settings` and `index:<playlistId>`. Nothing reads history, search or the feed's contents. | Review of the `Settings` and `IndexEntry` types and both coercers. `settings-transfer.test.ts` › *carries settings only, never the index (FR-10)*. |
| 7 | Incoming JSON is validated | `src/core/types.ts`: `VIDEO_ID_RE`, `PLAYLIST_ID_RE`. `src/core/schema.ts`: `safeJsonParse` (8 MB, depth 64), `sanitizeVideoIds` (50,000 cap). Applied to continuation responses, the embedded `ytInitialData`, and imported settings files (fixed this phase, `5efbba2`). | `schema.test.ts` › byte budget (UTF-8, not code units), depth, cap, regex cases. `innertube-fetch.test.ts` › *parses the response through the bounded parser*. `settings-transfer.test.ts` › *applies the spec §7 size / depth limit to an imported file*; both failed before the fix. |
| 8 | Messaging is an allow-list | Both listeners start with `isTrustedSender(sender) && isMessage(raw)` (`service-worker.ts:46`, `content/main.ts:99`). There is no `onMessageExternal` and no `externally_connectable`. The worker re-validates content-script data with `acceptEntries`, `acceptTitles`, `coerceSettings` and `isPlaylistId`. | `messaging.test.ts` › `isMessage`, `isTrustedSender`. `sync.test.ts` › `acceptEntries` cases. `manifest.test.ts` › *exposes nothing to web pages*. |
| 9 | No writing to the page | **Lint:** assignments to `window` / `globalThis` / `self` properties, assignments to `*.prototype.*`, and `Object` / `Reflect` property redefinition. No main-world script exists (the §4-C bridge was never needed, per ADR-0002). The only page writes are `data-cs-*` attributes and one `<style>`. | `lint-rules.test.ts` › §7.9 cases. `dom-scanner.test.ts` › *marking never mutates structure*. Source sweep found no assignments to page globals. |
| 10 | No account writes | Shipped: `GET /playlist` and `POST /youtubei/v1/browse`. `browse` is the read endpoint YouTube's own page uses to load more of a playlist. In source but not shipped: `GET /feed/playlists` (discovery, not yet wired). | Review of all three call sites, 2026-10-02. `innertube-fetch.test.ts` › *posts the ADR-0002 body to the browse endpoint*. |
| 11 | Fixtures are anonymous | `tests/fixtures/` holds synthetic data only. | Scan of the **entire git history**, 2026-10-02. The only video IDs are synthetic (`vid0000000N`) plus `dQw4w9WgXcQ`, a public video used as a URL example. The only playlist IDs are `PLtest…` / `PLsomethingelse`. No raw response, screenshot or spike output has ever been committed. |
| 12 | Strict `.gitignore` | `.gitignore`: `dist/`, `node_modules/`, `*.local.json`, `fixtures/raw/`, `.env*`, plus `dist-zip/` and spike output. | File contents. `.env*` aligned to the spec this phase (`55f4d53`); `.env` + `.env.*` had left `.env-local` and `.envrc` trackable. |
| 13 | Logging | `src/core/logger.ts:19`: `debug` runs only under `__DEV__`, which `build.mjs` defines as `false` for production. `console.debug` is also marked pure. **Bundle audit:** `console.debug` fails the build. | Production build, 2026-10-02: `console.debug` 0 in every bundle; `console.warn` / `console.error` once each in the worker and content bundles (the logger itself), none in the popup. Review of every call site: 7 `debug` calls, none with an ID or URL; 6 `error` calls, each a fixed message plus an `Error` from storage or messaging. Request failures are swallowed where they happen, so no URL reaches a log. *Note:* the seven `log.debug` call sites survive minification as no-op calls with constant strings (`"navigation"`, `"cap reached"`). They print nothing and carry no data. |
| 14 | Release integrity | `npm run zip` writes `<zip>.sha256` next to the package. CI now runs with a read-only token and actions pinned by commit (`11d0290`). | **Not yet enforced.** A release zip built in CI from a clean checkout, with its digest in the release notes, is a Phase 8 deliverable (spec §9). |
| 15 | Cookies are never read | No `cookies` permission. **Lint:** `document.cookie`, `chrome.cookies`, `SAPISID`, and an `Authorization` property key. **Bundle audit:** the same patterns. Requests rely on the browser attaching same-origin cookies (`credentials: 'include'`). | `innertube-fetch.test.ts` › *never touches document.cookie*, *sends no Authorization header*, *sends Content-Type and nothing else*. `lint-rules.test.ts` › §7.15 cases. Source sweep: zero matches outside comments. |

### What the bundle audit cannot see

The audit reads text. A URL whose host is assembled at runtime cannot be judged
that way: `parsePlaylistInput` puts `https://` in front of pasted text before
parsing it, and the audit skips that form on purpose. Rules 4 and 10 therefore
also rest on review. The three request sites above (two of them shipped) are the complete list, and
any change to that list is a review item.

## Permissions

| Permission | What uses it | Without it |
|---|---|---|
| `storage` | Settings and the per-playlist video index in `chrome.storage.local`. | Nothing persists, and every restart starts empty. |
| `alarms` | The periodic sync (default every 6 hours, minimum 30 minutes). | Syncing is manual only. FR-07 is unmet. |
| `https://www.youtube.com/*` | The content script that filters the homepage and makes the playlist reads. It also lets the worker find a YouTube tab with `tabs.query` without the `tabs` permission. | The extension cannot run at all. |

**Not requested, and not needed:**

- `tabs`: `tabs.query({url})` and `tabs.sendMessage` work under the host
  permission.
- `cookies`: same-origin requests from the content script carry the session
  automatically.
- `downloads`: export uses a blob URL and a `download` attribute.
- `scripting`: the content script is declared statically.
- `webRequest`, `declarativeNetRequest`: nothing is intercepted or blocked.
- `<all_urls>`: only one host is ever touched.

## Dependency audit

Run 2026-10-02.

- **Runtime dependencies: none.** `dependencies` is absent from
  `package.json`, and nothing under `src/` imports a package. The bundle is this
  repository's code only.
- **Dev dependencies (9), all pinned to exact versions:**

  | Package | Version | Used for |
  |---|---|---|
  | `esbuild` | 0.28.2 | Bundling |
  | `typescript` | 5.9.3 | Typecheck |
  | `eslint` | 10.10.0 | Lint |
  | `@eslint/js` | 10.0.1 | Lint rules |
  | `typescript-eslint` | 8.70.0 | Lint rules |
  | `globals` | 17.12.0 | Lint config |
  | `vitest` | 5.0.0 | Tests |
  | `jsdom` | 30.0.1 | Tests |
  | `@types/chrome` | 0.2.9 | Types |

- **Lockfile:** `lockfileVersion` 3, 222 packages. Every package resolves from
  `registry.npmjs.org` with an integrity hash. CI installs with `npm ci`.
- **`npm audit`:** one high-severity advisory, in `brace-expansion` 5.0.9
  (eslint → minimatch): GHSA-q2hr-2g5m-vwhr, GHSA-qhr7-859c-m2p7,
  GHSA-6j4f-fj2g-mc7p, all denial of service. It is dev-only and never bundled.
  Fixed by a lockfile-only bump to 5.0.12, inside minimatch's declared range
  (`cd08f06`). **After: 0 vulnerabilities.**
- **Install scripts:** `esbuild` (`postinstall: node install.js`, which
  verifies the platform binary) and `fsevents` (optional, macOS only).
  esbuild's script is approved in `package.json` under `allowScripts`, pinned
  to `esbuild@0.28.2`: the build cannot run without its binary, and the
  version is exact and integrity-hashed in the lockfile. A version bump drops
  out of the approval and npm warns again, which is the point.
- **CI:** `actions/checkout` and `actions/setup-node` are pinned by commit
  SHA, the token is `contents: read`, and checkout does not persist
  credentials.

## Re-running the audit

```bash
npm ci
npm run check        # lint (including the §7 rules) + tests (including the rule proofs)
npm run build:prod   # production build + bundle audit
npm audit
```

Then repeat the review items (rules 4, 10 and 13) against the diff since the
last release.
