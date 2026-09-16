# ADR 0004 — What `complete` means

- Status: accepted
- Date: 2026-09-16
- Supersedes one implementation rule in [ADR-0002](0002-playlist-access.md)
- Measurement: the manual QA pass of 2026-09-16, a real account, 13 playlists, one Refresh

## Context

The first end-to-end worker-driven sync indexed thirteen playlists. Every video
landed in storage, but twelve of the thirteen came back `complete:false`:

| Shape | Playlists | Videos each | `complete` |
|---|---|---|---|
| `playlistVideoRenderer` (legacy, `WL`) | 1 | 51 | `true` |
| `lockupViewModel` (new, ordinary `PL...`) | 12 | 4 – 73 | `false` |

None of the twelve is long enough to need a continuation page. The flag was
wrong on every one of them, and it is not cosmetic: `complete` decides the
layer a playlist reports (L1 rather than L2) and drives the "partly indexed,
refresh" copy — a sync that worked perfectly told the user, permanently, that
it had not.

The cause is a rule ADR-0002 wrote down and Phase 3 implemented literally:

> If none of them return anything, record the playlist at page-1 level with
> `complete:false`.

That rule was written from a measurement of *long* playlists, where a token
that returns nothing really does mean the chain broke. A lockup page carries a
continuation token whether or not there is a page behind it, so on a one-page
playlist the indexer spent its candidates, got nothing, and concluded it had
failed — when what it had actually learned was that the playlist was over.

ADR-0002 measured the answer such a token gives: HTTP 200 with a body of just
`{responseContext, trackingParams}`. An answer, carrying no videos.

## Options

1. **Trust the token's position.** Treat "no token inside the item list
   section" as the end of the playlist. Rejected: the preferred/fallback
   ranking is a heuristic over one account's measurement, and if a long
   playlist ever carries its real token under a different key we would declare
   it complete without ever asking — silently indexing 100 of 400.
2. **Compare against the playlist's stated video count.** Rejected: the page's
   own "N videos" shape is not measured, and inventing InnerTube field names is
   what spec §10 rule 2 forbids.
3. **Separate an answer from a silence.** A token that answers without videos
   has told us there is nothing behind it. A token that never answers has told
   us nothing at all.

## Decision

**Option 3.** `complete` means *we reached the end of what the playlist would
show us*, and the test is whether every continuation request was answered:

- every candidate answered, none carried a video, no chain was ever
  established → page 1 is the whole playlist → `complete: true`
- any candidate went unanswered (four attempts, the §4.3 backoff ladder spent)
  → `complete: false`
- an established chain that breaks → `complete: false`, unchanged
- the page ceiling, an abort, a missing InnerTube config → `complete: false`,
  unchanged

Where the token sits does not enter into the decision. Every candidate is still
asked, in the ADR-0002 ranking, and the first that yields videos still becomes
the chain.

## Consequences

- The twelve lockup playlists report `complete:true` and sit at L2, which is
  what they have been all along.
- Fail-open is untouched. `complete` never widens the index — it is a report
  about the index, not an input to matching, and no path here can hide a video
  that was not matched (NFR-04).
- The failure direction moves. Before, a working sync was reported as broken;
  now, if YouTube ever answers a *genuine* continuation with an empty 200, we
  would report a short index as complete. That is the quieter of the two
  errors, and `docs/spike/playlist-read.js` prints the HTTP status of every
  token probe so the difference is one paste away.
- `tests/fixtures/playlist-pages.ts` holds both shapes, reconstructed from the
  fields ADR-0002 measured; real pages carry real ids and cannot be committed
  (spec §10 rule 11). `tests/unit/indexer-complete.test.ts` pins the rule in
  both directions, and its four lockup cases fail without the change.

## Risks

- **Not directly measured.** The pass gave us the symptom — twelve lockup
  playlists flagged incomplete — and ADR-0002 gave us the empty-200 body, but
  nobody has yet watched the status code of the token on a short lockup page.
  If those probes turn out to be failing rather than answering, this change
  does not move them and the diagnostic will say so: run the spike and read the
  `token probe -> HTTP nnn` line.
- The lockup shape is still mid-migration (ADR-0002). Both shapes stay
  supported, and neither is allowed to become the assumed one.
