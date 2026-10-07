# Threat model

This is the long form of spec §7.1. It covers v0.1.0 as built from this
repository. For each rule's enforcement and evidence, see
[SECURITY.md](SECURITY.md#how-the-rules-are-enforced).

## What is worth protecting

| Asset | Why it matters |
|---|---|
| **The user's YouTube session** | The extension holds host access to `www.youtube.com`, and requests from its content script carry the session cookie. Code running there can act as the user. This is the asset that matters most. |
| **The video index** | A list of video IDs the user has saved. It says what they mean to watch, so it is personal data even though it holds no names. |
| **An intact homepage** | A filter that hides the wrong thing, or everything, is a failure the user cannot see. NFR-04 (fail open) exists because of this. |
| **The permission grant** | Users accept the manifest once. Any capability added later is one they never agreed to. |

## The capability, stated plainly

With `https://www.youtube.com/*` host access, a malicious build of this
extension *could* call any YouTube endpoint as the user, including the ones that
write to the account. The design does not rely on that never happening by
accident. It makes the honest build's behaviour checkable:

- The source contains exactly three request sites, and two of them ship
  (automatic discovery is not wired up yet, so the bundler drops it). All of
  them read (spec §7 rule 10), and all of them use a fixed origin.
- Lint rejects the patterns a write path or a credential grab would need. The
  production build then re-checks the shipped bundle for them.
- The permission set is locked by a test. Widening it means editing an
  assertion in the same diff.

What the design **cannot** defend against is a malicious build. That defence is
reproducibility: anyone can build the package from this repo and compare its
SHA-256 with the released zip (spec §7 rule 14, Phase 8).

## Trust boundaries

```
  YouTube servers ──(1)──▶ content script ◀──(2)── youtube.com page (main world)
                                │  ▲
                            (3) │  │ storage reads (4)
                                ▼  │
  popup ──(3)──▶ service worker ──▶ chrome.storage.local
    ▲
   (5) a settings file the user picks
```

1. **YouTube responses → content script.** Untrusted. The data is parsed by shape
   with size, depth and item caps, and every ID is regex-checked.
2. **The page → content script.** Untrusted. The content script runs in an
   isolated world: page JavaScript cannot see its variables, and the `fetch`
   it calls is its own, not the page's. The page *does* control the DOM the
   scanner reads, and can fire `yt-navigate-finish`.
3. **Extension contexts → service worker.** Partly trusted. Messages are taken
   only from this extension's own ID and only for an allow-listed `type`. Data
   from the content script is re-validated before it is written.
4. **Storage → every reader.** Untrusted on read. Content scripts can write to
   `storage.local` on Chrome, so "the worker is the sole writer" is a
   convention, not something the platform enforces. Every read goes through a
   coercer that rebuilds the object from a fixed field list.
5. **An imported settings file → popup.** Untrusted. It is size-checked before
   being read, parsed with the same bounds as a YouTube response, and coerced.
   The index is never imported.

## Threats

| # | Threat | Mitigation | Residual risk |
|---|---|---|---|
| T1 | **Malformed or hostile YouTube data.** A changed shape, a huge body or deep nesting. | Fixed shapes instead of a blind `videoId` harvest (ADR-0002). JSON over 8 MB or nested past 64 levels is rejected. At most 50,000 IDs per playlist. ID regexes. Any failure produces a smaller index, never a larger one. | The `/playlist` HTML is read whole before its embedded JSON is extracted and bounded. Memory use follows YouTube's page size. |
| T2 | **XSS in the popup** via a playlist title. | Titles are written with `textContent` only. `innerHTML`, `outerHTML` and `insertAdjacentHTML` are lint errors. Titles are capped at 200 characters. | None known. |
| T3 | **A hostile script on youtube.com** (an ad, a compromised YouTube script) manipulates what the content script sees. | The isolated world keeps the extension's state and `fetch` out of reach. Cards are identified with the URL parser, and only on `www.youtube.com` / `youtube.com` hosts. | The page can forge card hrefs to get its own cards hidden or shown. That is a power it already has over its own DOM, so nothing is escalated. |
| T4 | **The page detects the extension.** | Nothing is exposed: no `web_accessible_resources`, no `externally_connectable`. | The `data-cs-*` attributes and the `cs-style` element are visible to YouTube's own scripts. YouTube can tell the extension is installed and which cards it hid. Unavoidable for DOM-based hiding. Stated in PRIVACY.md. |
| T5 | **Another extension or a web page messages ours.** | No `externally_connectable`, so pages cannot connect. `onMessage` only fires for this extension, and both listeners also check `sender.id === chrome.runtime.id`. | None known. |
| T6 | **A compromised content script** (a renderer exploit) feeds the worker bad data or writes storage directly. | `acceptEntries`, `acceptTitles` and `coerceSettings` re-validate on the worker side. Every storage read is coerced again. | It could make the filter hide arbitrary video IDs, or rename playlists in the popup. It gains nothing it could not already do to the page it lives in. |
| T7 | **Credential theft or leakage.** | Cookies are never read: no `cookies` permission, and lint bans `document.cookie`, `chrome.cookies` and `SAPISID`. No `Authorization` header is sent. The InnerTube key is the page's public web-client key, held in a local variable for one sync. Nothing outside a fixed field list can reach storage. | None known. |
| T8 | **Data exfiltration.** | There are no request sites other than the ones to `www.youtube.com`: two shipped, one more in source. The production build fails if the shipped files contain any literal URL off the allowlist. No analytics, no error reporting, no update URL. | A URL whose host is built at runtime cannot be judged from text. That is covered by review: there are three `fetch` calls in source, all on a constant origin. |
| T9 | **Writes to the YouTube account.** | Only `GET /playlist` and `POST /youtubei/v1/browse` are called. `GET /feed/playlists` is in source for discovery but is not called yet. `browse` is the read endpoint YouTube's own page uses to load more of a playlist. | A future change could add one. Review is the gate (spec §7 rule 10), and the evidence table re-checks it each release. |
| T10 | **The homepage goes blank.** A bad index, a selector that matches the grid container, an exception. | Fail open everywhere: an empty Set on error, unidentifiable cards are shown, the grid container is structurally excluded from judgement, and hiding is attribute-only and reversible. | A selector change on YouTube's side can make hiding *stop*. That is the safe direction. |
| T11 | **A supply-chain compromise at build time.** A malicious dev dependency injects code into the bundle. | Zero runtime dependencies, and `src/` imports no package. Dev dependencies are pinned to exact versions. `npm ci` uses the committed lockfile (222 packages, all with integrity hashes, all from registry.npmjs.org). CI runs with a read-only token and actions pinned by commit. The bundle audit catches the obvious forms of injected exfiltration. | A careful attacker in the toolchain could produce code the text audit does not recognise. The reproducible-build comparison (Phase 8) is the backstop. |
| T12 | **Permission creep.** | `manifest.test.ts` asserts the exact permission set, host, content-script reach and CSP, and the absence of optional permissions. | None, as long as a reviewer reads assertion changes. |
| T13 | **Local access to the browser profile.** | Out of scope. | `chrome.storage.local` is unencrypted on disk. Anyone with access to the profile can read the playlist IDs, titles and video index. |

## Out of scope

- A malicious or compromised browser, OS or user profile.
- YouTube itself acting against the user beyond what is noted in T3 and T4.
- Rate-limiting or Terms of Service enforcement against the user's account for
  automated reads. This is a product risk, not a security one, and is noted in
  spec §11 and the README.
