# Manual test checklist

Walk through this end to end at the close of every phase. Tick each item and record the date.

## Setup
- [x] `npm ci && npm run build` completes without errors — 2026-09-14
- [x] `dist/` loads unpacked with no console errors — 2026-09-14
- [x] The extension icon and popup open — 2026-09-14

## Homepage (after Phase 4)
- [x] Videos from a hidden playlist are not visible — 2026-09-14
- [x] The hidden playlist's card / shelf is not visible — 2026-09-14
- [ ] Still correct after 5 pages of infinite scroll
- [x] No gaps or broken rows in the grid — 2026-09-14
- [x] Turning off the master toggle brings content back without a page reload — 2026-09-14 (and back on hides again)
- [x] With the debug overlay on, hidden items show with a red outline — 2026-09-14

> **Not yet covered by a manual pass:** 5-page infinite scroll on the live site,
> signed-out behaviour, the narrow-window and alternate-layout variants, and
> teardown residue after removing the extension. Verified in jsdom only.

## Popup (after Phase 5)
- [x] Refresh drives the worker path and an index lands in storage — 2026-09-14, index:WL with 49 ids
- [x] Manual add works — 2026-09-14, a private playlist indexed 32 videos
- [x] Keyboard: Tab between rows, Space toggles, amber focus ring visible — 2026-09-14
- [ ] The cross stays inside its row and the title reads through it
- [ ] Rows visibly separate from one another
- [ ] A synced playlist shows its name, not its id
- [ ] A fully indexed playlist is not labelled partial
- [ ] A long title or id truncates instead of widening the row
- [ ] First open shows the explainer line and the unexposed frames
- [ ] Export writes contactsheet-settings-YYYYMMDD.json; import restores it
- [ ] A one-page playlist in either render shape reports complete, not partly indexed (ADR-0004)

## Removing a playlist (FR-13)
- [ ] The remove control is findable at a glance, without hunting for it
- [ ] It still reads as secondary to the toggle, and its mark is not confused with the grease cross
- [ ] Clicking it hits the control, never the toggle, anywhere in its 24x24 target
- [ ] The confirmation names the playlist and says how many indexed videos go with it
- [ ] Cancel leaves both the entry and the index untouched
- [ ] Confirm deletes the settings entry **and** the stored index
- [ ] Keyboard: the control is reachable by Tab, and focus lands on Cancel when the confirmation opens

## Edge cases
- [ ] Signed out: nothing is hidden, no errors
- [ ] With no playlists selected, the homepage is unchanged
- [x] With a corrupt or deleted index, the homepage does not go blank (fail-open) — 2026-09-14, homepage never blanked at any point
- [ ] Navigating away from the homepage and back re-runs the filter
- [ ] Works in a narrow window and across different YouTube layout variants

## Cleanup
- [ ] After the extension is removed, no leftover styles or attributes remain on YouTube
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

## Notes from the 2026-09-16 pass

**The worker-driven sync chain ran for real.** One Refresh indexed 13
playlists and every one of them landed in storage: `sync:start` ->
`findYouTubeTab` -> `tabs.sendMessage` -> `acceptEntries` -> `persistEntries`
is confirmed in a browser. That closes the open item in the 2026-09-14 notes
below.

**Twelve of the thirteen reported `complete:false`.** All twelve are served in
the lockup shape and all fit on one page; `WL`, the only legacy-shaped one, was
the one that reported complete. Cause and fix: ADR-0004. If it comes back, run
`docs/spike/playlist-read.js` over the affected ids and read the
`token probe -> HTTP nnn` line — an empty 200 is the end of the playlist, no
answer at all is a failure, and only the second one means incomplete.

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
