# Contact Sheet — YouTube Homepage Playlist Filter
### Agent Working Document · Spec v1.0

> This file is an **implementation contract**. The agent treats it as the single source of truth.
> No feature that is not written here gets built. Nothing forbidden here gets done.
> If you find a contradiction or an ambiguity, **do not write code — ask first.**

---

## 0. Definition and Scope

**Product:** A Chrome/Edge (Manifest V3) browser extension. It hides the videos from playlists the user has selected — and those playlists themselves — **on the YouTube homepage**.

**Primary use case:** The user has dumped 400 videos into their "Watch Later" (WL) list. The homepage recommends them over and over. The user marks those playlists and the homepage is cleaned up.

**Repo name:** `contactsheet-yt`
**Display name:** Contact Sheet
**License:** MIT
**Distribution:** GitHub (source + `.zip` release). The Chrome Web Store is **out of scope for v1.**

### In scope (v1)
- The `https://www.youtube.com/` homepage feed (rich grid).
- Hiding video cards (the `videoId`s that appear in the selected playlists).
- Hiding playlist cards / shelves (the selected `playlistId`s).
- Popup interface: playlist discovery, marking, sync status.
- TR + EN localization.

### Out of scope (v1 — do not build it, do not propose it)
- Subscriptions, search, the watch page sidebar, the Shorts shelf, any surface other than the homepage.
- Any **write** operation against the YouTube account (deleting a video, removing it from a playlist, "Not interested").
- A Firefox / Safari port.
- Cloud sync, accounts, servers, telemetry.
- Ad blocking, sponsor skipping, downloading.

---

## 1. Requirements

### 1.1 Functional (FR)

| ID | Requirement | Acceptance |
|---|---|---|
| FR-01 | The user's own playlists (private + public + WL) are discovered and listed in the popup. | Playlist name and video count are shown correctly. |
| FR-02 | A "hide / do not hide" state is set per playlist and persisted. | The state survives a browser restart. |
| FR-03 | Every `videoId` in the playlists marked hidden is indexed and kept locally. | A playlist of 1000+ videos is indexed completely (following continuations). |
| FR-04 | If a video card's `videoId` on the homepage matches the index, the card is hidden from the DOM. | Holds after a page reload and during infinite scroll. |
| FR-05 | A playlist card / shelf on the homepage is hidden if it points at a `playlistId` marked hidden. | Including the shelf heading; no empty remnant is left behind. |
| FR-06 | Hiding leaves no gaps in the grid; YouTube's own layout is not broken. | No gaps at the end of a row, scrolling does not lock up. |
| FR-07 | Syncing: manual (popup button) + automatic (default 6 hours, min 30 min). | Last sync time and record count are visible in the popup. |
| FR-08 | A master toggle turns all hiding off instantly. | Turning it off brings content back without a page reload. |
| FR-09 | A "why was this hidden" debug mode: hidden cards are shown dimmed with a red outline instead of being removed. | Only enabled from settings, off by default. |
| FR-10 | Export/import of user data (JSON: settings only, not the index). | Filename `contactsheet-settings-YYYYMMDD.json`. |
| FR-11 | The user can add a playlist by hand, **by pasting a URL**, even when automatic discovery fails. | `youtube.com/playlist?list=PL...`, `watch?v=..&list=PL...` and a bare `PL...` ID are accepted. A free-text playlist **name is not accepted.** |
| FR-12 | The capability layers work independently: playlist cards keep being hidden even when their contents cannot be read. | With layer 2 failing completely, layer 0 stays functional (§4.0). |

### 1.2 Non-functional (NFR)

| ID | Requirement | Metric |
|---|---|---|
| NFR-01 | Homepage interaction latency must not measurably increase. | No long task introduced; each observer batch **< 8 ms**. |
| NFR-02 | Matching must be constant time. | `Set.has()` — O(1) per card. Linear search is forbidden. |
| NFR-03 | Memory ceiling. | The whole index < 8 MB; must keep working without degrading up to 20,000 video IDs. |
| NFR-04 | **Fail open.** If the index is missing, corrupt, or an error occurs, nothing is hidden. | Under no circumstances may the homepage end up blank. |
| NFR-05 | Zero runtime dependencies. | `dependencies` in `package.json` is empty. |
| NFR-06 | Package size < 300 KB (fonts included). | Checked in CI. |
| NFR-07 | When the extension is disabled or removed, it must leave no trace on YouTube. | Injected styles and attributes are cleaned up. |

---

## 2. System Architecture

### 2.1 The core architectural decision

> **Every YouTube network request is made from the content script, on the `www.youtube.com` origin.**

Rationale: the user's session cookies are sent automatically on same-origin requests. No credential is ever carried into the service worker, no `cookies` permission is requested, and there is no CORS to fight. The price: **syncing can only happen while a YouTube tab is open.** That is an accepted constraint and it is stated plainly in the interface.

### 2.2 Components

```
┌─────────────────────────────────────────────────────────────┐
│ POPUP (popup/)                                              │
│  Playlist selection · master toggle · sync status · settings│
└───────────────▲─────────────────────────────┬───────────────┘
                │ runtime.sendMessage         │
┌───────────────┴─────────────────────────────▼───────────────┐
│ SERVICE WORKER (background/)                                │
│  • Message router (single entry point)                      │
│  • chrome.alarms scheduler                                  │
│  • Sync orchestration: find a YT tab → hand off the job     │
│  • SOLE writer of settings + index (write serialization)    │
│  • NO network access                                        │
└───────┬──────────────────────────────────┬──────────────────┘
        │ storage.local                    │ tabs.sendMessage
┌───────▼──────────────┐   ┌───────────────▼──────────────────┐
│ STORAGE              │   │ CONTENT SCRIPT (content/)         │
│ settings · index     │   │  A) Indexer  — same-origin fetch  │
│ meta                 │   │  B) Filter   — DOM hiding engine  │
└──────────────────────┘   └───────────────────────────────────┘
```

### 2.3 Modules

| Module | File | Responsibility |
|---|---|---|
| `SettingsStore` | `src/core/settings.ts` | Schema-validated read/write, defaults, migration. |
| `IndexStore` | `src/core/index-store.ts` | Persistence of `playlistId → videoId[]`; building the merged `Set`. |
| `Messaging` | `src/core/messaging.ts` | Typed message contract, `type` allow-list, timeouts. |
| `Innertube` | `src/content/innertube.ts` | YouTube data access (see §4). Turns raw data into validated DTOs. |
| `PlaylistIndexer` | `src/content/indexer.ts` | Continuation loop, backoff, cancellation, progress reporting. |
| `SelectorRegistry` | `src/content/selectors.ts` | **All** CSS selectors live here; no selector string exists in any other file. |
| `DomScanner` | `src/content/scanner.ts` | MutationObserver, batch queue, card→ID extraction. |
| `Hider` | `src/content/hider.ts` | Attribute marking; never removes a node from the DOM. |
| `Bridge` | `src/content/bridge.ts` | (Only on the §4-C path) the MAIN world bridge. |
| `Logger` | `src/core/logger.ts` | Level-controlled; `debug` is stripped from the `production` build. |

### 2.4 Directory layout

```
contactsheet-yt/
├─ src/
│  ├─ background/service-worker.ts
│  ├─ content/{main.ts,indexer.ts,innertube.ts,scanner.ts,hider.ts,selectors.ts,bridge.ts}
│  ├─ popup/{index.html,popup.ts,popup.css,sprocket.svg}
│  ├─ core/{settings.ts,index-store.ts,messaging.ts,schema.ts,logger.ts,types.ts}
│  └─ assets/fonts/            # local .woff2, NO CDN
├─ _locales/{tr,en}/messages.json
├─ tests/{unit,fixtures}/
├─ docs/{ARCHITECTURE.md,SECURITY.md,THREAT-MODEL.md,PRIVACY.md,adr/}
├─ manifest.json
├─ build.mjs · tsconfig.json · package-lock.json
└─ README.md · CHANGELOG.md · LICENSE
```

### 2.5 Manifest (target state — adding a permission requires approval)

```json
{
  "manifest_version": 3,
  "name": "__MSG_extName__",
  "default_locale": "tr",
  "version": "0.1.0",
  "permissions": ["storage", "alarms"],
  "host_permissions": ["https://www.youtube.com/*"],
  "background": { "service_worker": "background/service-worker.js", "type": "module" },
  "content_scripts": [{
    "matches": ["https://www.youtube.com/*"],
    "js": ["content/main.js"],
    "run_at": "document_start",
    "all_frames": false
  }],
  "action": { "default_popup": "popup/index.html" },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'none'; base-uri 'none'"
  }
}
```

---

## 3. Data Model

```ts
type PlaylistId = string;   // "WL" | "LL" | "PL..."
type VideoId    = string;   // /^[A-Za-z0-9_-]{11}$/

interface Settings {
  schemaVersion: 1;
  enabled: boolean;               // master toggle, default true
  debugOverlay: boolean;          // default false
  syncIntervalMinutes: number;    // default 360, min 30
  playlists: Record<PlaylistId, {
    title: string;                // display only, rendered as textContent
    hidden: boolean;
    itemCount: number | null;
    lastSyncedAt: number | null;  // epoch ms
  }>;
}

interface IndexEntry {
  playlistId: PlaylistId;
  videoIds: VideoId[];
  syncedAt: number;
  complete: boolean;              // did the continuation chain finish
}
```

**Storage keys:** `settings`, `index:<playlistId>`, `meta`.
The index is kept **under a separate key per playlist** (writing one giant object is forbidden — separate keys prevent write contention and needless serialization).

**Derived structure:** on startup the content script merges the `videoIds` of the hidden playlists into a single `Set<VideoId>`. It is rebuilt whenever settings change.

---

## 4. YouTube Data Access

This is where the only real technical risk in the project lives. This section separates
two questions — most design mistakes come from conflating them:

1. **Which playlists?** → obtaining IDs. Easy, low risk.
2. **Which videos are in those playlists?** → reading contents. This is the hard part.

### 4.0 Capability layers

The extension is not one monolith. Four layers work **independently**; the lower ones
keep working even when the ones above them do not. This is the single most important
resilience decision in the project: when YouTube breaks one endpoint the extension does
not die outright, it loses capability.

| Layer | What it hides | What it needs | Risk |
|---|---|---|---|
| **L0** | Playlist cards and shelves | Only the `playlistId` — no network request | None |
| **L1** | Videos in playlists of ≤100 items | The playlist page HTML (§4.2 Path 1) | Low |
| **L2** | The entirety of large playlists | InnerTube + a continuation token (§4.2 Path 2) | Medium |
| **L3** | "Watch later" for free | The toggle state carried on the card (§4.2 Path 3) | Must be verified |

**Rule:** L0 must work under all circumstances, and no network error may take it down.
The popup shows which playlist is being filtered at which layer, so the user never has
to guess why a playlist is "marked hidden but its videos are still showing".

### 4.1 Obtaining playlist IDs

**Primary — automatic discovery.** The user's own playlists are read (from the playlist
library page or `browseId: "FEplaylists"`). The user types nothing. Low risk, because
failure here is not fatal.

**Always available — manual entry (FR-11).** The popup has a paste field. This path is
used when automatic discovery breaks, when a playlist has just been created, or when the
user only wants to filter a single playlist.

> **The user is never asked for a playlist *name*.** Names are not unique, they get
> renamed, they are easy to mistype, and matching needs a `playlistId` anyway. The user
> pastes a URL and the extension extracts the `list` parameter. A bare `PL...` / `WL` /
> `LL` ID is also accepted. Parsing lives in `parsePlaylistInput()` and is a pure
> function (therefore testable).

The title of a manually added playlist is filled in on the first sync; if it cannot be
filled in, the ID itself is shown. The title is for display only and is never used in
any matching.

### 4.2 Reading playlist contents

Try them in order; the first one that works wins. Verified **by measurement** in Phase 2;
proceeding on guesswork is forbidden.

> **Measured and decided — `docs/adr/0002-playlist-access.md`.**
> Paths 1 and 2 below were chosen; 3 and 4 were ruled out. This section is no longer a
> proposal, it is the design to be implemented.

**Path 1 — Playlist page HTML (page 1) ✅ chosen**
`fetch('https://www.youtube.com/playlist?list=<ID>', {credentials:'include'})`
→ extract `ytInitialData` from the HTML. Cookies alone are enough; no extra headers.
Measured: WL 48 videos, ordinary playlist 100 videos.

**Path 2 — InnerTube continuation requests, unsigned ✅ chosen**
`POST /youtubei/v1/browse?key=<INNERTUBE_API_KEY>` with body
`{context:{client:{clientName:'WEB',clientVersion:<ver>}}, continuation:<token>}`.
**No `Authorization` header is sent** — in the measurement, signed and unsigned requests
returned the same result (HTTP 200). `SAPISID` is never read.

**Path 3 — The WL toggle state on the card ❌ ruled out**
No overlay carrying `isToggled` was found in the homepage `ytInitialData` (0/0).

**Path 4 — Same-origin hidden iframe ❌ not needed**
Dropped because Path 2 works; it remains recorded in `docs/BACKLOG.md`.

### 4.2.1 Extracting video IDs — by shape, not by name

YouTube runs two render paths in parallel; both are supported:

| Shape | Where it was seen | Field |
|---|---|---|
| New | ordinary `PL...` playlists | `lockupViewModel` · `contentType === 'LOCKUP_CONTENT_TYPE_VIDEO'` → `contentId` |
| Old | `WL` | `playlistVideoRenderer.videoId` |

**Harvesting every field named `videoId` is forbidden.** On the same page, fields such as
`addedVideoId`, `removedVideoId` and `animationActivationTargetId` also carry an
11-character ID; those are button actions, not playlist contents. Collecting blindly
produces the wrong set and hides the wrong videos.

### 4.2.2 Choosing the continuation token

`continuationCommand.token` appears in more than one place, and only one of them returns
content. Try the tokens in order, accept the first one that returns videos, and continue
the chain through it. If none of them return anything, record the playlist at page-1
level with `complete:false`.

### 4.3 Mandatory behaviour on every path

- Sequential requests, concurrency 1. Parallel fetching is forbidden.
- **Minimum 400 ms** wait between requests.
- On an error or a 429, exponential backoff: 1s → 2s → 4s → 8s, max 4 attempts, then give
  up and **save the partial index with `complete:false`.** The partial index is still
  used; a missing video is not hidden, and the wrong video is not hidden.
- Hard ceiling per playlist: 200 continuation pages.
- If the tab closes or navigates away, the sync is cancelled cleanly (`AbortController`).
- No error path may ever **increase** hiding (fail open, NFR-04).

### 4.4 Decision gate

At the end of Phase 2, `docs/adr/0002-playlist-access.md` is written and must contain:
separate measurement output for WL and for an ordinary playlist, whether Path 3 exists at
all, the chosen combination, the rationale for what was ruled out, and which layers depend
on which path. **Phase 3 does not start until this ADR is approved.**

## 5. DOM Hiding Engine

### 5.1 Injection
A single `<style id="cs-style">` is injected at `document_start`:
```css
[data-cs-hidden="1"] { display: none !important; }
[data-cs-hidden="1"][data-cs-debug="1"] {
  display: block !important; opacity: .28; outline: 2px solid #D0342C;
}
```
Hiding is done **by writing an attribute and nothing else.** `element.remove()`, writing
`style.display`, and injecting classes are **forbidden** — they break YouTube's own
virtual list renderer.

### 5.2 Card → ID extraction
1. Find the first `a[href]` inside the element.
2. Parse it with `new URL(href, location.origin)`. **Parsing URLs with a regex is forbidden.**
3. `pathname === '/watch'` → `searchParams.get('v')` = videoId.
4. `pathname === '/playlist'` → `searchParams.get('list')` = playlistId.
5. If a `/watch` URL also carries a `list` parameter: the videoId **and** the playlistId are matched separately.
6. If none of these apply → leave it alone (fail open).

### 5.3 Selector strategy
`selectors.ts` holds a layered list; the first match wins:
```
container : ytd-rich-grid-renderer, ytd-two-column-browse-results-renderer
item      : ytd-rich-item-renderer, ytd-rich-grid-media, yt-lockup-view-model
section   : ytd-rich-section-renderer, ytd-rich-shelf-renderer
```
YouTube A/B tests change these names. Hence: **if no selector matches, fall back to the
generic path** — walk the grid's direct children and treat any node containing a `/watch`
link as a candidate. And the engine must never get more aggressive when it finds no items
at all.

### 5.4 Observation
- A single `MutationObserver` (`childList:true, subtree:true`) is attached to the grid container; it is **not** attached to `document.body`.
- Added nodes are queued and processed in batches inside `requestAnimationFrame`; max 100 nodes per batch, and if the 8 ms budget is exceeded the remainder carries over to the next frame.
- A processed node is stamped with `data-cs-seen="1"` and never processed again.
- SPA navigation: listen for the `yt-navigate-finish` event; when leaving the homepage the observer is detached, and reattached on return.
- Polling `document.title` or the URL is **forbidden.**

### 5.5 Flash of unhidden content (FOUC)
Because the decision is made within the same frame the card is added, flicker is
negligible. **Hiding the entire grid up front and revealing it afterwards is forbidden** —
if the index fails to load the user would be left staring at a blank homepage (a violation
of NFR-04).

---

## 6. Interface Design Specification

> This section is binding. The agent does not reinterpret the design; it implements what is written here.
> Forbidden: stacks of rounded-corner cards, soft grey shadows, gradients, glassmorphism, purple/indigo accents, icon libraries, emoji, all-caps label bands, button text with an appended "→".

### 6.1 Concept
**The contact sheet.** A photographer prints their negative strip and crosses out the frames that will not be printed, using a grease pencil. That is exactly this extension's job: choosing which frame gets seen. The interface looks like a strip from a contact sheet; a hidden playlist is struck out with a cross drawn over it.

### 6.2 Tokens
```
--film      #2B2F27   background (cool olive-grey; NOT black)
--frame     #343A31   frame background
--emulsion  #D6D2C4   primary text (silvery off-white)
--latent    #8E9184   secondary text
--grease    #D0342C   grease-pencil red — only for the cross and the hidden counter
--safelight #E8A33D   amber — only for sync status
```
The two accents are deliberate: red means a *decision*, amber means a *process*. The roles are never mixed.

### 6.3 Typography
A single family: **Archivo** (local `.woff2` in `assets/fonts/`; the Google Fonts CDN is **forbidden**).
- Playlist name: Archivo 500, 15px / 1.25, sentence case.
- Video counts and edge numbers: Archivo Condensed 400, 11px, `font-variant-numeric: tabular-nums`.
- Heading: Archivo 600, 17px, `letter-spacing: -0.01em`.
No letterspaced all-caps labels.

### 6.4 Layout (380 × 520 popup)

```
┌──┬──────────────────────────────────────────────┐
│▪ │  Hidden on the homepage           [ ●─── ]   │  heading + master
│  │  3 playlists, 1,284 videos                   │
│▪ ├──────────────────────────────────────────────┤
│  │ 01   Watch later                  412 videos │
│▪ │      ╳ diagonal grease-pencil stroke         │  ← hidden
│  ├──────────────────────────────────────────────┤
│▪ │ 02   Music                        193 videos │  ← visible
│  ├──────────────────────────────────────────────┤
│▪ │ 03   Saved                        679 videos │
│  │      ╳                                       │
│▪ ├──────────────────────────────────────────────┤
│  │  Last sync 14:32                  [Refresh]  │
└──┴──────────────────────────────────────────────┘
 ↑ 16px sprocket strip (SVG), full height
```

- The **sprocket strip** down the left edge is the design's load-bearing element; there is no decoration anywhere else.
- The row numbers (01, 02…) are film frame numbering — legitimate here because the content really is an ordered strip.
- Rows are separated not by a hairline rule but by a 2px gap in `--film`, the way frames are separated.
- Alignment: left; numbers right-aligned.

### 6.5 Interaction
- Each row is a `<button role="switch" aria-checked>`. The whole row is clickable.
- Toggling: a hand-drawn, slightly wobbly cross made of two `<path>`s inside an `<svg>`, drawn over **180 ms** via `stroke-dasharray/offset` (`cubic-bezier(.2,.7,.3,1)`), with the second stroke delayed by 60 ms. Toggling off runs the same animation in reverse.
- During a sync: the `fill` of the sprocket holes turns `--safelight` one after another (a 2s loop). There is no other spinner.
- Focus ring: 2px `--safelight` outline, `outline-offset: 2px`. Use `:focus-visible`.
- `prefers-reduced-motion: reduce` → the cross appears instantly, the sprocket animation stops, and status is announced as text.
- There is **no** staggered entrance animation on page load.

### 6.6 Copy (TR)
| State | Text |
|---|---|
| Heading | Ana sayfada gizlenenler |
| Subtitle | 3 liste, 1.284 video |
| Empty | Henüz liste okunmadı. YouTube'u aç, listelerini buradan getirelim. |
| No tab | Senkronizasyon için açık bir YouTube sekmesi gerekiyor. |
| Error | Listeler alınamadı. YouTube yanıtı beklenenden farklı. Tekrar dene. |
| Partial | Bu liste kısmen indekslendi (412/679). Yenile. |
| Button | Yenile → "Yenileniyor" while running → "Yenilendi" when done |

Error copy does not apologise; it says what happened and what to do about it.

### 6.7 Accessibility
- Contrast: `--emulsion` / `--film` ≥ 7:1; `--latent` / `--film` ≥ 4.5:1 (verify, and adjust the token if needed).
- Full keyboard navigation: Tab + Space/Enter.
- State changes are announced in an `aria-live="polite"` region.
- Colour never carries meaning on its own (the cross mark plus `aria-checked`).

---

## 7. Security Rules

### 7.1 Threat model (short form)
| Threat | Mitigation |
|---|---|
| Malicious or unexpected data from YouTube | All data is treated as **untrusted**; schema validation plus size/depth limits. |
| XSS (injecting a playlist name into the popup) | `textContent` only. `innerHTML` is forbidden. |
| Privilege escalation (the MAIN world bridge) | Nonce-bearing, `origin`-checked `postMessage` with a fixed schema; no code or functions are passed across. |
| Supply chain | Zero runtime dependencies, `npm ci`, committed lockfile, dev dependencies pinned to exact versions. |
| Data exfiltration | **No** network request outside youtube.com. |
| Permission creep | Permissions are locked; changing them requires approval. |

### 7.2 Hard rules (breaking one = the phase is rejected)

1. **No remote code.** No CDN, no `eval`, no `new Function`, no `setTimeout("string")`, no remotely downloaded script/style/font. The MV3 default CSP is not loosened.
2. **`innerHTML` / `outerHTML` / `insertAdjacentHTML` are forbidden.** Use the DOM API or `textContent`. Enforced by an ESLint rule.
3. **Minimum permissions.** Only `storage`, `alarms` + `https://www.youtube.com/*`. `tabs`, `cookies`, `webRequest`, `scripting`, `<all_urls>` and `declarativeNetRequest` are **not** requested. (`chrome.tabs.query` works with the host permission; the `tabs` permission is not needed.)
4. **No network request outside youtube.com.** Analytics, error reporting, update checks, a "donate" pixel — none of them.
5. **No credentials are stored.** Tokens, cookies, API keys and `SAPISID` are never written to disk. The InnerTube key is held in memory only, for the lifetime of the tab.
6. **Writing personal data to disk is limited.** Only `playlistId`, playlist title, the list of `videoId`s, and timestamps. Watch history, search data, recommendation data and channel lists are **not** collected.
7. **Incoming JSON is validated.** `videoId` against the regex `^[A-Za-z0-9_-]{11}$`; `playlistId` against `^[A-Za-z0-9_-]{2,64}$`; max 50,000 items per playlist; max 8 MB JSON body; parse depth is bounded. A record that fails validation is dropped silently.
8. **Messaging is an allow-list.** A message whose `sender.id !== chrome.runtime.id` is rejected. An unknown `type` is rejected. Data arriving from the content script is re-validated in the service worker.
9. **No writing to the page.** YouTube's `window` object, `fetch`, `XMLHttpRequest` and their prototypes are never patched (monkey-patching is forbidden).
10. **No endpoint that writes to the YouTube account is ever called.** Only `browse`-style reads. This rule is checked explicitly during code review.
11. **Fixtures are anonymous.** Real `videoId`s, channel names, usernames, cookies and session IDs are scrubbed from test data. A raw YouTube response is never committed to the repo.
12. **A strict `.gitignore`.** `dist/`, `node_modules/`, `*.local.json`, `fixtures/raw/`, `.env*`.
13. **Logging.** `console.debug` is stripped from the production build; at no level is a full list of `videoId`s or any URL parameter logged.
14. **Release integrity.** The release zip is built in CI from a clean checkout, and its SHA-256 digest is recorded in the release notes.
15. **Cookies are never read.** After ADR-0002 there is no need to read `SAPISID` or any
    other cookie. `document.cookie` access and signature computation do not enter the
    codebase; if that ever changes, the ADR is updated first.

---

## 8. Test Strategy

- **Unit (vitest):** URL parsing, `videoId` validation, the `ytInitialData` parser, the continuation chain, settings migration, `Set` merging. Target: **85%+ line coverage** in `core/` and in the parsers.
- **Fixtures:** anonymised JSON/HTML samples — an ordinary playlist, WL, an empty playlist, a single page, a playlist with 3 continuations, corrupt/truncated JSON, an unexpected schema.
- **DOM tests (jsdom):** scanner + hider against a saved fragment of the homepage; two different YouTube layout variants.
- **Manual checklist (every phase, `docs/QA.md`):** signed in / signed out, an empty homepage, 5 pages of infinite scroll, theme switching, a narrow window, toggling the master switch on and off, leftovers after removing the extension.
- **Performance:** batch durations measured with `performance.measure` on a 300-card grid, verifying NFR-01.
- **CI:** typecheck + lint + test + size check. A phase does not close with CI red.

---

## 9. Phases

Each phase is **its own branch and its own PR**. At the end of a phase the agent stops, summarises the output, and waits for approval.

### Phase 0 — Scaffold
**To do:** The repo, TypeScript + esbuild configuration, ESLint (including custom rules such as `no-innerHTML`), vitest, the MV3 manifest, the MIT license, a README draft, `docs/ADR-0001` (toolchain choice), and the CI workflow.
**Done when:** The extension loads unpacked with no console errors, and `npm run build && npm test` is green.

### Phase 1 — Core
**To do:** `types.ts`, `schema.ts` (the validators), `SettingsStore`, `IndexStore`, the `Messaging` contract, `Logger`. The service worker message router (not doing any work yet).
**Done when:** Unit tests pass; a settings object that is corrupt, incomplete or carries foreign fields falls back to safe defaults.

### Phase 2 — SPIKE + Playlist IDs  ⚠️ *decision gate*
**To do:** Run `docs/spike/playlist-read.js` against a real account; measure Paths 1/2/3 from §4.2. Write and test `parsePlaylistInput()` (manual entry, FR-11). Attempt automatic discovery. Write `docs/adr/0002-playlist-access.md`.
**Done when:** Measurement output is recorded for both WL and an ordinary playlist; whether Path 3 exists is settled; and the ADR states which layer depends on which path. **Phase 3 does not start until the ADR is approved.**

### Phase 3 — Indexing Engine
**To do:** `PlaylistIndexer`: page 1 via Path 1, continuation pages via Path 2, backoff, cancellation, progress events, partial saves. Signature computation in an isolated file (§7 rule 15). On the service worker side: the alarm scheduler, finding a YT tab, and handing out the job. Write serializing.
**Done when:** A playlist of 500+ videos is indexed completely; with Path 2 disabled the playlist is partially indexed at the L1 level and `complete:false` is written; a second sync produces no contention; and the signature function does not leak the cookie value (test).

### Phase 4 — Hiding Engine
**To do:** `SelectorRegistry`, `DomScanner`, `Hider`, style injection, SPA navigation handling, the batch budget, the debug overlay.
**Done when:** On the real homepage, videos from a hidden playlist and its playlist cards are not visible; this still holds after 5 pages of infinite scroll; the grid leaves no gaps; the NFR-01 measurement is documented; and turning off the master toggle brings content back.

### Phase 5 — Interface
**To do:** An exact implementation of §6. The popup, master toggle, playlist rows, the manual entry field (FR-11), the layer indicator (§4.0), sync status, the empty/error/partial states, `_locales` TR+EN, local fonts.
**Done when:** The design checklist passes (sprocket strip, cross animation, the two accent roles, focus ring, reduced motion, contrast measurements); it is fully usable by keyboard; and a screenshot has been added to `docs/`.

### Phase 6 — Resilience
**To do:** Alternative YouTube layouts, the signed-out state, zero playlists, a very large playlist (10k+), the selector fallback, settings export/import, migration tests.
**Done when:** The `docs/QA.md` checklist has been walked end to end manually and ticked off.

### Phase 7 — Security Hardening
**To do:** Auditing the items in §7 one by one, `docs/THREAT-MODEL.md` + `docs/SECURITY.md` + `docs/PRIVACY.md`, justifying the permissions, a dependency audit, and verifying that logs are stripped from the production build.
**Done when:** An evidence table has been written for the 14 security rules (rule → where it is enforced → how it was verified).

### Phase 8 — Release
**To do:** README (what it does, what it does not do, limitations, setup, a privacy summary, screenshots), CHANGELOG, the SemVer `v0.1.0` tag, a CI-built zip + SHA-256, `CONTRIBUTING.md`, issue templates.
**Done when:** Following the README instructions on a clean machine gets you from nothing to a working install.

---

## 10. Agent Working Rules

1. **Go in order.** No skipping phases. At the end of every phase, stop, summarise the changes and how the acceptance criteria were met, and ask for approval.
2. **Ask when unsure; do not invent.** Do not guess — especially about YouTube's DOM structure, InnerTube field names and authentication behaviour. Run it, look at it, then write it.
3. **No scope creep.** A feature not in this file may be proposed, but it goes into `docs/BACKLOG.md` and does not get implemented.
4. **No new dependencies.** If a new package is needed (dev included), ask for approval first, with the justification.
5. **No new permissions.** Changing `permissions`/`host_permissions` in `manifest.json` requires explicit approval.
6. **Selectors in one file.** Do not write a CSS selector string outside `selectors.ts`.
7. **Every architectural decision becomes an ADR.** `docs/adr/NNNN-title.md` — context, options, decision, consequences. At minimum: toolchain choice, playlist access path, storage schema, hiding method, sync scheduling.
8. **Commit discipline.** Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`). Small, focused commits. One PR per phase.
9. **Tests first, or alongside.** If you write a parser or a validator, its test ships in the same commit.
10. **Economical comments.** Write down *why* it is done that way, not *what* it does — especially for YouTube-specific quirks.
11. **Never commit real data.** Scrub raw responses taken from your own account, `videoId`s, and playlist names visible in screenshots.
12. **Never break fail-open.** When in doubt, show the card. "Hide it if I'm not sure" logic must never be written.
13. **Everything in this repository — docs, code, comments, commit messages, phase reports — is written in English.** User-facing interface strings go through `_locales`, never hardcoded.
14. **Do not assert, measure.** Saying "performance is fine" is not enough; produce `performance.measure` output.

---

## 11. Known Risks

| Risk | Impact | Response |
|---|---|---|
| InnerTube continuation pages start requiring a signature | Large playlists stay incomplete | `SAPISIDHASH` (§4.2 Path 2); failing that, a partial index at the L1 level + Path 4 |
| Automatic discovery breaks | Playlists cannot be found | Manual URL entry (FR-11) is always available |
| YouTube changes its DOM tags | Hiding silently stops | Layered selectors + generic fallback + the debug overlay |
| Syncing only while a YT tab is open | User expectation | A clear message in the interface, and an automatic retry when a tab opens |
| Using an internal API is a grey area under YouTube's ToS | Risk to a store release | v1 is GitHub-only; a plain warning in the README |
| Very large playlists (10k+) | Memory / time | A page ceiling, a partial index, and a `complete:false` indicator |
| A/B tested homepage layout variants | Partial functionality | Tested against at least two variants in Phase 6 |

---

## 12. Opening Command (the first message to give the agent)

> Read `SPEC.md`. Implement Phase 0. When the Phase 0 acceptance criteria are met, stop, summarise what you did and how each criterion was met as a list, and ask for approval for Phase 1. Add nothing that is not in this spec. Ask before writing code when something is unclear.
