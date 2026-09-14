/**
 * Anonymised playlist-page fragments (spec §7 rule 11 — no real ids, channel
 * names or account data).
 *
 * These exist because a real sync on 2026-09-14 indexed 32 videos and still
 * displayed the playlist's id: extractPlaylistTitle matched none of its
 * InnerTube shapes. The document-title case is the one that has to keep
 * working, so it is pinned here.
 */

/** A page whose ytInitialData carries no title shape we recognise. */
export const HTML_NO_JSON_TITLE = `<!doctype html><html><head>
<title>Kayıt listesi - YouTube</title>
</head><body><script>var ytInitialData = {"contents":{"items":[]}};</script></body></html>`;

/** Entity-encoded, which a title containing & or a quote will be. */
export const HTML_ENCODED_TITLE = `<html><head>
<title>Rock &amp; Roll &quot;Live&quot; - YouTube</title></head><body></body></html>`;

/** The suffix uses an en dash on some locales rather than a hyphen. */
export const HTML_ENDASH_SUFFIX = `<html><head><title>Sabah listesi – YouTube</title></head></html>`;

/** Title split across lines, as the served markup sometimes is. */
export const HTML_MULTILINE_TITLE = `<html><head><title>
    Uzun
    liste adı - YouTube
  </title></head></html>`;

/** A playlist genuinely called "YouTube" must keep its name. */
export const HTML_LITERAL_YOUTUBE = `<html><head><title>YouTube - YouTube</title></head></html>`;

/** No title element at all — signed out, or an error page. */
export const HTML_NO_TITLE = `<html><head></head><body>signed out</body></html>`;

/** The older header shape, kept so the JSON path does not silently rot. */
export const JSON_HEADER_RUNS = {
  header: { playlistHeaderRenderer: { title: { runs: [{ text: 'Haftalık' }] } } },
};

/** The newer page header shape. */
export const JSON_PAGE_HEADER = { header: { pageHeaderRenderer: { pageTitle: 'Arşiv' } } };
