# Manual test checklist

Walk through this end to end at the close of every phase. Tick each item and record the date.

## Setup
- [x] `npm ci && npm run build` completes without errors — 2026-09-14
- [x] `dist/` loads unpacked with no console errors — 2026-09-14
- [x] The extension icon and popup open — 2026-09-14

## Homepage (after Phase 4)
- [x] Videos from a hidden playlist are not visible — 2026-09-14
- [x] The hidden playlist's card / shelf is not visible — 2026-09-14
- [x] Still correct after 5 pages of infinite scroll — 2026-09-16, no gaps, no stuck scrolling
- [x] No gaps or broken rows in the grid — 2026-09-14
- [x] Turning off the master toggle brings content back without a page reload — 2026-09-14 (and back on hides again)
- [x] With the debug overlay on, hidden items show with a red outline — 2026-09-14

> **Still not covered by a manual pass:** signed-out behaviour, teardown
> residue after removing the extension, and a second YouTube layout variant.
> Verified in jsdom only. The first two are deliberate — each needs a separate
> profile or an uninstall — and both are carried into Phase 7.

## Popup (after Phase 5)
- [x] Refresh drives the worker path and an index lands in storage — 2026-09-14, index:WL with 49 ids
- [x] Manual add works — 2026-09-14, a private playlist indexed 32 videos
- [x] Keyboard: Tab between rows, Space toggles, amber focus ring visible — 2026-09-14
- [x] The cross stays inside its row and the title reads through it — 2026-09-16, titles read through the mark
- [x] Rows visibly separate from one another — 2026-09-16, rows separate clearly
- [x] A synced playlist shows its name, not its id — 2026-09-16, synced lists show their names
- [x] A fully indexed playlist is not labelled partial — 2026-09-16, passes by construction, not by design — the copy is unreachable while itemCount records what we indexed (BACKLOG)
- [x] A long title or id truncates instead of widening the row — 2026-09-16, long ids truncate
- [x] First open shows the explainer line and the unexposed frames — 2026-09-16, part of the popup block
- [x] Export writes contactsheet-settings-YYYYMMDD.json; import restores it — 2026-09-16, dated file written, import restored it

## Removing a playlist (FR-13)
- [x] The remove control is findable at a glance, without hunting for it — 2026-09-16, after raising it to full --latent
- [x] It still reads as secondary to the toggle, and its mark is not confused with the grease cross — 2026-09-16, the minus does not read as a second cross
- [x] Clicking it hits the control, never the toggle, anywhere in its 24x24 target — 2026-09-16, the target never hits the toggle
- [x] The confirmation names the playlist and says how many indexed videos go with it — 2026-09-16, named, with its count
- [x] Cancel leaves both the entry and the index untouched — 2026-09-16, cancel is inert
- [x] Confirm deletes the settings entry **and** the stored index — 2026-09-16, both go
- [x] Keyboard: the control is reachable by Tab, and focus lands on Cancel when the confirmation opens — 2026-09-16, Tab reaches the control

## Edge cases
- [ ] Signed out: nothing is hidden, no errors — **not walked**, needs a second browser profile; carried into Phase 7
- [x] With no playlists selected, the homepage is unchanged — 2026-09-16, homepage untouched
- [x] With a corrupt or deleted index, the homepage does not go blank (fail-open) — 2026-09-14, homepage never blanked at any point
- [x] Navigating away from the homepage and back re-runs the filter — 2026-09-16, filter keeps working
- [x] Works in a narrow window and across different YouTube layout variants — 2026-09-16, narrow window holds up; a second layout variant was not separately exercised

## Cleanup
- [ ] After the extension is removed, no leftover styles or attributes remain on YouTube — **not walked**, needs an uninstall; carried into Phase 7
- [x] No `console.debug` output in the production build — 2026-09-16, `npm run build:prod` then grep: only one `console.error` and one `console.warn` per bundle

## Performance (NFR-01)

Run `npm run test:perf`. It sweeps a 300-card grid against a 20,000-id index —
the NFR-03 ceiling — and reports each batch through `performance.measure`.

Measured 2026-09-14, jsdom 30.0.1, Node 20:

| Case | Batches | Nodes per batch | Max batch | Worst `performance.measure` | Whole sweep |
|---|---|---|---|---|---|
| 50% of cards hidden | 5 | 13, 77, 79, 90, 41 | 8.101 ms | 8.235 ms | 77.605 ms |
| Nothing hidden | 4 | 100, 100, 98, 2 | 8.077 ms | 8.100 ms | 32.145 ms |

The budget holds: a batch stops at the first check past 8 ms, so the overshoot
is bounded by one card's cost (0.24 ms worst observed), and the remainder is
deferred to the next frame. No batch approaches the 50 ms long-task threshold.

**These are pessimistic figures.** jsdom's `querySelector` and attribute writes
are far slower than Blink's — the DOM-free half of the work (URL parsing plus
the two `Set.has` lookups) measures ~4 µs per card, so jsdom's DOM operations
dominate by roughly 25×. Chrome should be comfortably faster. The real-browser
number still has to come from a manual pass on the live homepage.

**As of 2026-09-16 that number is still owed.** The 2026-09-16 pass did not take one,
so the jsdom figures above stand with their caveat.

## Notes from the 2026-09-16 pass

**The worker-driven sync chain ran for real.** One Refresh indexed 13
playlists and every one of them landed in storage: `sync:start` ->
`findYouTubeTab` -> `tabs.sendMessage` -> `acceptEntries` -> `persistEntries`
is confirmed in a browser. That closes the open item in the 2026-09-14 notes
below.

**Twelve of the thirteen reported `complete:false`, and still do.** Every
video is indexed and hiding works correctly for all of them; they report L1
instead of L2 and nothing is visible to the user. Two fix attempts have not
landed, so it is parked in `docs/BACKLOG.md` with what the spike measured —
including that the render-shape hypothesis is wrong. Not a gate on this phase.

**Playlist ids are not a fixed length.** Several lists on the account carry
13-character ids rather than 34 and index normally. `PLAYLIST_ID_RE` accepts 2
to 64 characters, and nothing downstream keys off the length.

## Notes from the 2026-09-14 pass

Two things that are not defects but will cost the next person time.

**A service worker does not receive its own message.** Calling
`chrome.runtime.sendMessage({type:'sync:start'})` from the worker's own devtools
console fails with *"Receiving end does not exist"*. That is how the API works,
not a bug in the router. To trigger a sync by hand, send it from the popup's
console or from a page context — not from the worker.

**The worker-driven sync path has not been exercised end to end.** The pass
triggered `sync:run` directly against the content script, which bypasses the
worker, so nothing was persisted and `index:WL` had to be written by hand. The
chain `sync:start` -> `findYouTubeTab` -> `tabs.sendMessage` -> `acceptEntries`
-> `persistEntries` is covered by unit tests but has never run in a real
browser. The popup's refresh button is the first thing that will exercise it,
so treat it as a real integration point.

What the pass *did* confirm end to end: `sync:run` against WL returned 48
videos with `complete:true`, matching the ADR-0002 spike figure exactly.
