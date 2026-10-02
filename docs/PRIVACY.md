# Privacy

Contact Sheet runs without a server. There is no account, no sign-up, no telemetry.

## Data stored on your device

Inside `chrome.storage.local`, in your browser only:

| Data | Why |
|---|---|
| Playlist IDs (`WL`, `PL...`) | To know which playlist to hide |
| Playlist titles | To show them in the interface |
| The video IDs in those playlists | To match against cards on the homepage |
| Per playlist: hidden or not, how many videos were indexed, when it last synced | To show status and decide what to hide |
| Settings: on/off, the debug overlay, the sync interval | To remember your choices |

This storage is not encrypted. Anyone with access to your browser profile can
read it, the same as your browsing history.

## What is not stored

Watch history, search history, the contents of the recommendation feed, channel
lists, cookies, session keys, credentials. None of it is read or written.

## What is sent, and to whom

Requests go to `www.youtube.com` and nowhere else. There is no analytics, no
error reporting and no update-check service.

To read your playlists, the extension makes the same requests YouTube's own
pages make:

- `GET /playlist?list=<id>` for each playlist you added
- `POST /youtubei/v1/browse` to load the rest of a long playlist

Your browser attaches your YouTube session cookie to these requests, as it does
for any youtube.com page. The extension never reads that cookie itself. The
requests tell YouTube nothing it does not already know, since these are your
own playlists, but YouTube can see that they were made.

YouTube can also tell the extension is installed. Hiding works by marking cards
on the page with `data-cs-*` attributes and one stylesheet, and YouTube's own
scripts can see both.

## Exported settings

**Export** writes a JSON file with your settings and your playlist IDs and
titles. It never contains the video index. The file stays wherever you save
it; the extension does not send it anywhere.

## Deletion

- **One playlist:** remove it from the list in the popup. Its settings entry
  and its stored video index are both deleted.
- **Everything:** remove the extension. Chrome deletes all of its storage.

---

Security details: [SECURITY.md](SECURITY.md) · [THREAT-MODEL.md](THREAT-MODEL.md)
