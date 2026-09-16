import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { indexPlaylist } from '../../src/content/indexer.js';
import { installFakeYouTube, type FakeYouTube } from '../helpers/fake-youtube.js';
import {
  EMPTY_CONTINUATION,
  legacyPage,
  lockupPage,
  pageHtml,
  videoId,
} from '../fixtures/playlist-pages.js';

/**
 * What `complete` is allowed to mean (ADR-0004).
 *
 * The 2026-09-16 pass indexed thirteen playlists. `WL`, the one still served
 * in the legacy shape, came back complete. All twelve lockup playlists came
 * back `complete:false` although every one of them fits on a single page —
 * they carry a continuation token that answers with no videos, and the
 * indexer read that answer as a failure.
 *
 * So the cases below are written around the distinction that fixes it: a
 * token that ANSWERS without videos ends the playlist, a token that does not
 * answer leaves it unknown. The counts and ids are scrubbed; the shapes are
 * the measured ones.
 */

/** 34 characters, the common length. Scrubbed — spec §10 rule 11. */
const PLAYLIST = 'PLtest0000000000000000000000000000';

let server: FakeYouTube;
let sleeps: number[];
const sleep = (ms: number): Promise<void> => {
  sleeps.push(ms);
  return Promise.resolve();
};

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => videoId(i));

beforeEach(() => {
  sleeps = [];
  server = installFakeYouTube();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a single-page playlist in the lockup shape', () => {
  // The regression itself. Before ADR-0004 this returned complete:false, and
  // it did so for every playlist on the account except WL.
  it('is complete even though the page carries a continuation token', async () => {
    server.pageHtml = pageHtml(lockupPage(ids(6), { offToken: 'panel' }));
    server.continuations.set('panel', EMPTY_CONTINUATION);

    const result = await indexPlaylist(PLAYLIST, { sleep });

    expect(result.videoIds).toHaveLength(6);
    expect(result.complete).toBe(true);
  });

  // Where the token sits is not something we can rely on: ADR-0002 measured a
  // decoy outside the item list, but a page is free to put an exhausted one
  // inside it. Either way, an answer without videos is an answer.
  it('is complete when that token sits in the item list section', async () => {
    server.pageHtml = pageHtml(lockupPage(ids(73), { itemToken: 'inlist' }));
    server.continuations.set('inlist', EMPTY_CONTINUATION);

    const result = await indexPlaylist(PLAYLIST, { sleep });

    expect(result.videoIds).toHaveLength(73);
    expect(result.complete).toBe(true);
  });

  it('is complete when several dead tokens all answer', async () => {
    server.pageHtml = pageHtml(lockupPage(ids(4), { itemToken: 'a', offToken: 'b' }));
    server.continuations.set('a', EMPTY_CONTINUATION);
    server.continuations.set('b', EMPTY_CONTINUATION);

    const result = await indexPlaylist(PLAYLIST, { sleep });

    expect(result.complete).toBe(true);
    // Both were asked before the verdict: an unanswered one would change it.
    expect(server.requests.filter((url) => url.includes('browse'))).toHaveLength(2);
  });

  it('matches what the legacy shape already reported', async () => {
    server.pageHtml = pageHtml(lockupPage(ids(51), { offToken: 'panel' }));
    server.continuations.set('panel', EMPTY_CONTINUATION);
    const lockup = await indexPlaylist(PLAYLIST, { sleep });

    // WL: same playlist length, no token on the page at all.
    server.pageHtml = pageHtml(legacyPage(ids(51)));
    const legacy = await indexPlaylist('WL', { sleep });

    expect(lockup.videoIds).toEqual(legacy.videoIds);
    expect(lockup.complete).toBe(legacy.complete);
  });
});

describe('what still counts as incomplete', () => {
  it('leaves a playlist incomplete when its only token never answers', async () => {
    // Nothing registered for 'gone', so all four attempts fail.
    server.pageHtml = pageHtml(lockupPage(ids(100), { itemToken: 'gone' }));

    const result = await indexPlaylist(PLAYLIST, { sleep });

    expect(result.videoIds).toHaveLength(100);
    expect(result.complete).toBe(false);
  });

  it('leaves it incomplete when one token answers empty and another fails', async () => {
    server.pageHtml = pageHtml(lockupPage(ids(100), { itemToken: 'gone', offToken: 'panel' }));
    server.continuations.set('panel', EMPTY_CONTINUATION);

    const result = await indexPlaylist(PLAYLIST, { sleep });

    // One silence is enough: the playlist could hold anything behind it.
    expect(result.complete).toBe(false);
  });

  it('leaves it incomplete when an established chain breaks', async () => {
    server.pageHtml = pageHtml(lockupPage(ids(2), { itemToken: 'p1' }));
    server.continuations.set('p1', lockupPage([videoId(2)], { itemToken: 'dead' }));

    const result = await indexPlaylist(PLAYLIST, { sleep });

    expect(result.videoIds).toHaveLength(3);
    expect(result.complete).toBe(false);
  });

  it('still finishes a real chain as complete', async () => {
    server.pageHtml = pageHtml(lockupPage(ids(2), { itemToken: 'p1' }));
    server.continuations.set('p1', lockupPage([videoId(2)], { offToken: 'panel' }));
    server.continuations.set('panel', EMPTY_CONTINUATION);

    const result = await indexPlaylist(PLAYLIST, { sleep });

    expect(result.videoIds).toHaveLength(3);
    expect(result.complete).toBe(true);
  });
});

describe('playlist ids are not assumed to be one length', () => {
  // Several of the lists on the 2026-09-16 pass have 13-character ids rather
  // than 34, and they index fine, so nothing may key off the length.
  const SHORT = 'PLtestShortId';

  it('indexes a 13-character id exactly as a 34-character one', async () => {
    server.pageHtml = pageHtml(lockupPage(ids(23), { offToken: 'panel' }));
    server.continuations.set('panel', EMPTY_CONTINUATION);

    const short = await indexPlaylist(SHORT, { sleep });
    const long = await indexPlaylist(PLAYLIST, { sleep });

    expect(short.playlistId).toBe(SHORT);
    expect(short.videoIds).toEqual(long.videoIds);
    expect(short.complete).toBe(long.complete);
    expect(server.requests.some((url) => url.includes(`list=${SHORT}`))).toBe(true);
  });
});
