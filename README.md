# Contact Sheet

Hides videos from the playlists you choose on the YouTube homepage.

When 400 videos have piled up in your "Watch later" list, the homepage keeps recommending them back to you. This extension lets you mark a playlist, and both the videos in it and the playlist itself disappear from the homepage.

> **Status: pre-release (v0.1.0).** It works, but has not been tagged or packaged for release yet. See [docs/SPEC.md](docs/SPEC.md) for the roadmap.

## What it does

- Hides videos from the selected playlists in the homepage feed.
- Hides the cards and shelves belonging to the selected playlists.
- Runs entirely on your machine: no server, no account, no telemetry.

## What it does not do

- It never changes anything in your YouTube account. It does not delete videos or remove them from playlists. It only reads.
- It hides nothing outside the homepage (subscriptions, search, watch page). Its script does load on every youtube.com page, because it has to notice when you navigate to the homepage, and a sync runs in whichever YouTube tab is open.
- It never reads your cookies. Your browser attaches them to youtube.com requests, as it does for YouTube's own pages.
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
| `npm run build:prod` | Minified build, debug logs stripped, shipped files audited against spec §7 |
| `npm run zip` | Release package + SHA-256 → `dist-zip/` |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint (including the security rules) |
| `npm test` | Unit tests |
| `npm run check` | All of the above |

## Privacy

The extension stores the following **locally**: playlist IDs, playlist titles, the video IDs in those playlists, sync status and timestamps, and your settings. Nothing else is stored.

The only requests it makes go to youtube.com, to read the playlists you added. They are the same requests YouTube's own playlist page makes, so YouTube learns nothing it does not already know. Nothing is sent anywhere else: no analytics, no error reporting, no update checks.

Details: [docs/PRIVACY.md](docs/PRIVACY.md). How each of these promises is enforced and checked: [docs/SECURITY.md](docs/SECURITY.md) and [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

Permissions requested:

| Permission | Why |
|---|---|
| `storage` | Settings and the video ID index |
| `alarms` | Periodic syncing |
| `https://www.youtube.com/*` | Filtering the homepage and reading playlists |

The `tabs`, `cookies`, `scripting`, `webRequest`, `declarativeNetRequest` and `<all_urls>` permissions are **not** requested.

To report a security problem, see [docs/SECURITY.md](docs/SECURITY.md).

## License

MIT
