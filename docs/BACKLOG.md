# Backlog

## Out of scope

Ideas that fall outside the scope of the spec and will not be implemented. They get written down here, not built.

- Filtering subscriptions / search results / the watch page sidebar
- Hiding by channel
- Firefox port (MV3 differences)
- Chrome Web Store release
- A counter for how many videos were hidden
- Path 4: reading playlists through a same-origin hidden iframe. Ruled out by ADR-0002; only to be revived if unsigned InnerTube continuation requests break permanently.

## Owed to the spec

These are **not** rejected ideas. They are required by the spec and are not done
yet, tracked here so they stay visible.

- **Obtain and subset the Archivo `.woff2` files** (spec §6.3). The popup
  declares `@font-face` for `Archivo-Medium`, `Archivo-SemiBold` and
  `ArchivoCondensed-Regular`, but the binaries are absent, so it currently
  renders in the system sans stack. **§6.3 is unmet until these land.** Steps and
  exact filenames: `src/assets/fonts/README.md`. The Google Fonts CDN is
  forbidden (§6.3 and §7 rule 1), so they must be vendored locally. Budget
  roughly 30–50 KB subset against the 300 KB NFR-06 ceiling.
- **A popup screenshot in `docs/`** (spec §9, Phase 5 acceptance).

## Noticed, not built

Real weaknesses found during a pass that no spec item covers. Written down so
they are not rediscovered from scratch.

- **`itemCount` records what we indexed, not what the playlist holds.**
  `persistEntries` stamps `itemCount = entry.videoIds.length`, so the popup's
  shortfall test (`indexedCount < itemCount`) can essentially never fire and
  the "partly indexed (N/M)" copy has no way to reach the user. Reading the
  playlist's stated total would mean a new InnerTube shape, which spec §10
  rule 2 forbids without a measurement — so it needs a spike first, not a
  guess. Noticed 2026-09-16, during the ADR-0004 investigation.

- **`complete` is still recorded as false for twelve of thirteen playlists.**
  Open after two fix attempts. Parked 2026-09-16 by the user's call: not worth
  a third attempt from theory.

  What the spike measured, against the real account:

  - A continuation token that answers **HTTP 200 with no items means the
    playlist ended.** That part is settled.
  - The extension **still records `complete:false`** for those lists after
    ADR-0004, so whatever the indexer does on the real path is not what the
    fixture tests reproduce.
  - **Both lists probed are the old `playlistVideoRenderer` shape** — two of
    the 13-character-id lists, not the 34-character ones. The
    render-shape hypothesis — lockup pages carry a token, legacy ones do not —
    is therefore wrong, or at least is not what separates `WL` from the rest.
    ADR-0004 still holds as a rule; it simply was not this bug.

  Impact today: those twelve sit at L1 instead of L2. **Hiding works correctly
  for all of them** and there is no user-visible symptom — the "partly indexed"
  copy is unreachable for the separate `itemCount` reason above.

  The next attempt instruments the real path — log the candidate count, each
  probe's status, and which branch of `indexPlaylist` returns, from a real
  sync — rather than reasoning from shapes. Two attempts have now been argued
  from theory and neither landed.
