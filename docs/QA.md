# Manual test checklist

Walk through this end to end at the close of every phase. Tick each item and record the date.

## Setup
- [ ] `npm ci && npm run build` completes without errors
- [ ] `dist/` loads unpacked with no console errors
- [ ] The extension icon and popup open

## Homepage (after Phase 4)
- [ ] Videos from a hidden playlist are not visible
- [ ] The hidden playlist's card / shelf is not visible
- [ ] Still correct after 5 pages of infinite scroll
- [ ] No gaps or broken rows in the grid
- [ ] Turning off the master toggle brings content back without a page reload
- [ ] With the debug overlay on, hidden items show with a red outline

## Edge cases
- [ ] Signed out: nothing is hidden, no errors
- [ ] With no playlists selected, the homepage is unchanged
- [ ] With a corrupt or deleted index, the homepage does not go blank (fail-open)
- [ ] Navigating away from the homepage and back re-runs the filter
- [ ] Works in a narrow window and across different YouTube layout variants

## Cleanup
- [ ] After the extension is removed, no leftover styles or attributes remain on YouTube
- [ ] No `console.debug` output in the production build

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
