# CLAUDE.md

This file is read at the start of every session. It is deliberately short; the detail lives in `docs/SPEC.md`.

## The project

A Chrome/Edge MV3 extension. It hides the videos from playlists the user has selected — and the cards for those playlists — **on the YouTube homepage**. No server, no account, no telemetry.

Single source of truth: **`docs/SPEC.md`**. If this file and the spec disagree, the spec wins. Anything not in the spec does not get built.

## Commands

```bash
npm ci            # dependencies (not npm install)
npm run check     # typecheck + lint + test + build — mandatory before every commit
npm run build     # produces dist/, loaded unpacked into Chrome
npm test          # unit tests
npm run zip       # release package + SHA-256
```

Testing in Chrome: `chrome://extensions` → Developer mode → Load unpacked → `dist/`.

## Architecture — in three sentences

1. The service worker is the **sole writer** to storage and **never** touches the network.
2. Every YouTube request is made from the content script, on the `www.youtube.com` origin (cookies are sent automatically, so no `cookies` permission is needed). The price: syncing only works while a YouTube tab is open.
3. The popup does no work of its own; it asks the service worker for everything by message.

Capability layers (spec §4.0): L0 playlist cards (no network) · L1 first page · L2 continuation pages. The lower layers keep working even when the ones above them fail. L3 (WL toggle signal) was ruled out by ADR-0002 — homepage cards carry no WL membership, so WL is covered by L1/L2 like any other playlist.

## Immutable rules

These are not preferences, they are a contract. Breaking one means the phase is rejected.

1. **Fail open.** When in doubt, show the card. If the index is missing, corrupt, or a request fails, nothing gets hidden. "Hide it if I'm not sure" logic must never be written.
2. **No new permissions.** Going beyond `storage`, `alarms` and `https://www.youtube.com/*` requires explicit approval. `tabs`, `cookies`, `webRequest` and `<all_urls>` are never requested.
3. **No new dependencies.** Even a dev dependency has to be proposed with its justification first. `dependencies` stays empty.
4. **No `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `eval` / `new Function`.** Lint already fails on these; do not try to work around it.
5. **CSS selector strings live only in `src/content/selectors.ts`.** If you see a selector in any other file, move it.
6. **No requests outside youtube.com.** Analytics, error reporting, update checks, font CDNs — none of them.
7. **No endpoint that writes to the YouTube account is ever called.** Reads only.
8. **Cookies are never read.** ADR-0002 measured that the signature is unnecessary. `document.cookie` access and `SAPISIDHASH` computation do not enter the codebase.
9. **Real data is never committed.** Raw responses from your own account, video IDs and playlist names visible in screenshots must be scrubbed.
10. **Production logs contain no video IDs and no URL parameters.**

## How we work

- **Phases in order.** No skipping. You do not move to the next phase until the acceptance criteria in spec §9 are met.
- **Ask when unsure.** Do not guess — especially about YouTube's DOM structure, InnerTube field names and authentication behaviour. Run it, look at it, then write it. Phase 3 is not designed without spike output.
- **No scope creep.** A good idea goes in `docs/BACKLOG.md`; it does not get implemented.
- **Every architectural decision becomes an ADR:** `docs/adr/NNNN-title.md` — context, options, decision, consequences.
- **Tests in the same commit.** If you write a parser or a validator, its test ships alongside it.
- **Economical comments.** Write down *why* it is done that way, not *what* it does — especially for YouTube-specific quirks.
- Everything in this repository — docs, code, comments, commit messages, phase reports — is written in English. User-facing interface strings go through `_locales`.

## Phase protocol

For each phase, in order:

1. `git checkout -b phase-N-short-name`
2. Implement the phase.
3. `npm run check` — nothing proceeds until it is green.
4. Verify by hand in Chrome (spec §8 / `docs/QA.md`).
5. `git add -A && git commit` (Conventional Commits).
6. **Do not push.** Write the report and stop.

I do the pushing. You report and wait for approval.

### Phase report format

```markdown
## Phase N report — <name>

**What was done**
- <item> (`path/to/file.ts`)

**Acceptance criteria**
| Criterion | Status | Evidence |
|---|---|---|
| <criterion, verbatim from the spec> | ✅ / ❌ | <test name, measurement, manual verification> |

**Measurements**
- Tests: N passed · Build: N KB · <phase-specific measurement>

**Deviations from the spec**
- <deviation + rationale + which ADR records it> — or "none"

**Known gaps**
- <what is being carried into the next phase>

**Proposed commit**
`feat: ...`

**Awaiting approval:** may I move on to Phase N+1?
```

Keep the report short. If there is a ❌ anywhere in the acceptance criteria table the phase is not closed; do not ask for approval, finish what is missing.

## Commit granularity

One logical change per commit. A phase produces several commits, not one.

- A security fix never rides inside a feature commit. It gets its own `fix:`
  commit so it stays findable in `git log --oneline`.
- Separate modules are separate commits, even when written in one sitting.
- Tests land in the same commit as the code they cover.
- Refactors and renames are their own commits, never mixed with behaviour.
- Each commit must build and pass `npm run check` on its own. Verify by
  checking out each commit in turn and running it — do not assume.
- Commit messages carry no co-author or attribution trailers.

Phase 1 is the counter-example: schema validators, the index store, the
messaging timeout and two security fixes landed as one commit. That should
have been five. History before phase-3-indexer predates this rule and is
left as written.

## Current status

- **Phases 0, 1 and 2 complete.** Scaffold and toolchain; core storage, schema validators and the messaging contract; the ADR-0002 decision gate.
- **Phase 3 in progress on `phase-3-indexer`.** InnerTube read path, the playlist indexer, automatic discovery, and sync orchestration are written and tested. Manual Chrome verification is still outstanding.
- Automatic discovery was folded in from Phase 2 because it shares the request layer with the indexer. Its renderer shapes are **inferred, not measured** — confirm against a real account before the popup depends on it.
- **Next up: Phase 4** (the hiding engine — scanner, hider, selector fallback).
