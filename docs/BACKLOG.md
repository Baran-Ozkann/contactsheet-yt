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
