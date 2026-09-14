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
