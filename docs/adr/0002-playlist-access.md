# ADR 0002 — Reading playlist contents

- Status: accepted
- Date: 2026-09-14
- Measurement: `docs/spike/playlist-read.js`, against a real account, Chrome, client version `2.20260911.01.00`

## Context

To match cards on the homepage we need the set of `videoId`s in the playlists marked
as hidden. Spec §4.2 proposed four paths; Phase 3 could not be designed until we had
measured which of them actually works.

## Measurement results

| Measurement | Result |
|---|---|
| Is the session cookie readable from JS | yes |
| `playlist?list=WL` page 1, cookies only | **48 videos** |
| `playlist?list=<PL...>` page 1, cookies only | **100 videos** |
| InnerTube continuation request, **unsigned** | **HTTP 200, 25 videos** |
| InnerTube continuation request, signed | HTTP 200, 25 videos (no difference) |
| End of the chain | 125 unique videos, 2 pages, complete |
| WL toggle state on homepage cards | 0 — not present |

## Decision

**Path 1 + Path 2, unsigned.**

1. Page 1: `fetch('https://www.youtube.com/playlist?list=<ID>', {credentials:'include'})`
   → extract `ytInitialData` from the HTML.
2. Continuations: `POST /youtubei/v1/browse?key=<INNERTUBE_API_KEY>` with body
   `{context:{client:{clientName:'WEB',clientVersion:<ver>}}, continuation:<token>}`.
   **No `Authorization` header is sent.** Only `Content-Type: application/json`.

`INNERTUBE_API_KEY` and `INNERTUBE_CLIENT_VERSION` are pulled out of the homepage HTML
by regex.

### Extracting video IDs — both shapes

YouTube runs two render paths in parallel. Both have to be supported:

| Shape | Where it was seen | Field |
|---|---|---|
| New | ordinary `PL...` playlists | `lockupViewModel` · `contentType === 'LOCKUP_CONTENT_TYPE_VIDEO'` → `contentId` |
| Old | `WL` | `playlistVideoRenderer.videoId` |

**The rule: collect by shape, not by renderer name.** Walk the tree; if either of the
two patterns above matches, take the ID. Harvesting every field named `videoId` is
forbidden — fields like `addedVideoId`, `removedVideoId` and
`animationActivationTargetId` also carry an 11-character ID, and those are button
actions, not playlist contents. In the measurement, six different keys on the same
page each carried 100 IDs; collecting blindly produces the wrong set.

### Choosing the continuation token

`continuationCommand.token` appears in more than one place; the measurement found two,
and **only one** of them returned content (the other came back empty, with just
`{responseContext, trackingParams}`). The right token is the one under
`continuationItemViewModel`, in the same section as the item list.

Implementation rule: try the tokens in order, accept the first one that returns videos,
and continue the chain through it. If none of them return anything, record the playlist
at page-1 level with `complete:false`.

## Consequences

- **Reading `SAPISID` was removed entirely.** Spec §7 rule 15 is unnecessary; no cookie
  is read at all and no `crypto.subtle` signature is ever computed. The attack surface
  got smaller.
- **Layer L3 was ruled out.** Homepage cards do not carry WL membership; WL will be read
  through Path 1+2 like any other playlist.
- **Path 4 (hidden iframe) is not needed.** It was moved to `docs/BACKLOG.md`, to be
  revived only if Path 2 breaks permanently.
- Layers L0/L1/L2 stand unchanged. L2 is now verified.
- *Added later:* the "Spec §7 rule 15" referred to above is the **old** rule 15, which required signature computation to be isolated. Acting on this ADR, rule 15 was rewritten as the prohibition itself ("Cookies are never read"). The reference is kept as written for the historical record.

## Risks

- `lockupViewModel` is a new structure; YouTube's migration may still be in progress.
  That is why supporting both shapes is mandatory, not a temporary measure.
- There is no guarantee the unsigned continuation request will keep working. If a
  401/403 shows up, the behaviour is: partial index plus `complete:false` — never a
  silent failure.
- The measurement was taken on a single account. The shape may differ on another
  account, region or A/B arm; that is why extraction keys off the shape rather than the
  field name.
