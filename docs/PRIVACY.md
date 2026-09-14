# Privacy

Contact Sheet runs without a server. There is no account, no sign-up, no telemetry.

## Data stored on your device

Inside `chrome.storage.local`, in your browser only:

| Data | Why |
|---|---|
| Playlist IDs (`WL`, `PL...`) | To know which playlist to hide |
| Playlist titles | To show them in the interface |
| The video IDs in those playlists | To match against cards on the homepage |
| Sync timestamps and settings | To show status and schedule the next sync |

## What is not stored

Watch history, search history, the contents of the recommendation feed, channel
lists, cookies, session keys, credentials. None of it is read or written.

## Network

No request is sent to any address outside youtube.com. There is no analytics,
error reporting or update-check service.

## Deletion

Removing the extension deletes all of its data from your device. To reset your
settings by hand, use the reset option in the popup (Phase 5).
