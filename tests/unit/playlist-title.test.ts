import { describe, expect, it } from 'vitest';
import { extractPlaylistTitle, extractTitleFromHtml } from '../../src/content/innertube.js';
import {
  HTML_ENCODED_TITLE,
  HTML_ENDASH_SUFFIX,
  HTML_LITERAL_YOUTUBE,
  HTML_MULTILINE_TITLE,
  HTML_NO_JSON_TITLE,
  HTML_NO_TITLE,
  JSON_HEADER_RUNS,
  JSON_PAGE_HEADER,
} from '../fixtures/playlist-titles.js';

describe('extractTitleFromHtml — the dependable path', () => {
  it('reads the title when no JSON shape matches', () => {
    expect(extractTitleFromHtml(HTML_NO_JSON_TITLE)).toBe('Kayıt listesi');
  });

  it('decodes entities', () => {
    expect(extractTitleFromHtml(HTML_ENCODED_TITLE)).toBe('Rock & Roll "Live"');
  });

  it('strips an en-dash suffix as well as a hyphen', () => {
    expect(extractTitleFromHtml(HTML_ENDASH_SUFFIX)).toBe('Sabah listesi');
  });

  it('collapses whitespace in a multi-line title', () => {
    expect(extractTitleFromHtml(HTML_MULTILINE_TITLE)).toBe('Uzun liste adı');
  });

  it('keeps the name of a playlist genuinely called YouTube', () => {
    expect(extractTitleFromHtml(HTML_LITERAL_YOUTUBE)).toBe('YouTube');
  });

  it('returns null when there is no title element', () => {
    expect(extractTitleFromHtml(HTML_NO_TITLE)).toBeNull();
  });

  it('returns null rather than an empty string', () => {
    expect(extractTitleFromHtml('<html><head><title> - YouTube</title></head></html>')).toBeNull();
    expect(extractTitleFromHtml('<html><head><title></title></head></html>')).toBeNull();
  });

  it('bounds an absurd title', () => {
    const long = `<html><head><title>${'x'.repeat(5000)} - YouTube</title></head></html>`;
    expect(extractTitleFromHtml(long)).toHaveLength(200);
  });
});

describe('extractPlaylistTitle — the inferred JSON shapes', () => {
  it('reads the header runs shape', () => {
    expect(extractPlaylistTitle(JSON_HEADER_RUNS)).toBe('Haftalık');
  });

  it('reads the page header shape', () => {
    expect(extractPlaylistTitle(JSON_PAGE_HEADER)).toBe('Arşiv');
  });

  it('still reads the shapes it already handled', () => {
    expect(
      extractPlaylistTitle({ metadata: { playlistMetadataRenderer: { title: 'Saved' } } }),
    ).toBe('Saved');
    expect(
      extractPlaylistTitle({
        header: { playlistHeaderRenderer: { title: { simpleText: 'Music' } } },
      }),
    ).toBe('Music');
  });

  it('returns null for an unrecognised shape so the html fallback can run', () => {
    expect(extractPlaylistTitle({ contents: { items: [] } })).toBeNull();
  });
});
