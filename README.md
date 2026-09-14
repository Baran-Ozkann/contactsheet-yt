# Contact Sheet

Hides videos from the playlists you choose on the YouTube homepage.

When 400 videos have piled up in your "Watch later" list, the homepage keeps recommending them back to you. This extension lets you mark a playlist, and both the videos in it and the playlist itself disappear from the homepage.

> **Status: under development (v0.1.0, Phase 0).** It does not hide anything yet. See `docs/SPEC.md` for the roadmap.

## What it does

- Hides videos from the selected playlists in the homepage feed.
- Hides the cards and shelves belonging to the selected playlists.
- Runs entirely on your machine: no server, no account, no telemetry.

## What it does not do

- It never changes anything in your YouTube account. It does not delete videos or remove them from playlists.
- It does not touch any page other than the homepage (subscriptions, search, watch page).
- It does not block ads or download videos.
- It sends no request to any address outside youtube.com.

## Limitations

- Reading playlists relies on YouTube's own internal endpoints. These are not a documented API, so if YouTube changes them the extension will need an update.
- Syncing works **only while a YouTube tab is open**. This is a deliberate trade-off: it means the extension never has to store cookies or session data.
- Chrome / Edge only (Manifest V3). There is no Firefox port.

## Setup (development)

```bash
npm ci
npm run build
```

Then, in Chrome:

1. Open `chrome://extensions`.
2. Turn on **Developer mode** in the top right.
3. **Load unpacked** → select the `dist/` folder inside this directory.

After changing code, run `npm run build` and hit the reload icon on the extensions page.

## Commands

| Command | What it does |
|---|---|
| `npm run build` | Development build → `dist/` |
| `npm run build:prod` | Minified build, debug logs stripped |
| `npm run zip` | Release package + SHA-256 → `dist-zip/` |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint (including the security rules) |
| `npm test` | Unit tests |
| `npm run check` | All of the above |

## Privacy

The extension stores the following **locally**: playlist IDs, playlist titles, the video IDs in those playlists, and sync timestamps. Nothing else is stored, and no data ever leaves your device. Details: `docs/PRIVACY.md`.

Permissions requested:

| Permission | Why |
|---|---|
| `storage` | Settings and the video ID index |
| `alarms` | Periodic syncing |
| `https://www.youtube.com/*` | Filtering the homepage and reading playlists |

The `tabs`, `cookies`, `webRequest` and `<all_urls>` permissions are **not** requested.

## License

MIT
