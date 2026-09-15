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

/**
 * A whole playlist page as one arrives from a real sync: ytcfg config,
 * ytInitialData carrying videos in the lockup shape, no continuation, and the
 * playlist's name present only in <title>.
 *
 * This is the case the 2026-09-14 report describes — videos indexed, name not —
 * and it exists to be run through the entire chain, content script to popup,
 * rather than through extractPlaylistTitle alone. The extractor was never the
 * broken part: the title was resolved correctly and then dropped at the message
 * boundary, which no test on either side of that boundary could see.
 */
export const PAGE_TITLE_ONLY_IN_HEAD = `<!doctype html><html><head>
<title>Kayıt listesi - YouTube</title>
</head><body>
<script>var ytcfg = {"INNERTUBE_API_KEY":"AIzaSyAO_Fake_Key_For_Tests_123","INNERTUBE_CLIENT_VERSION":"2.20260911.01.00"};</script>
<script>var ytInitialData = ${JSON.stringify({
  contents: {
    items: [
      { lockupViewModel: { contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: 'vid00000001' } },
      { lockupViewModel: { contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: 'vid00000002' } },
      { lockupViewModel: { contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: 'vid00000003' } },
    ],
  },
  // Deliberately none of the shapes extractPlaylistTitle knows.
  header: { someUnknownHeaderRenderer: { heading: 'Kayıt listesi' } },
})};</script>
</body></html>`;

/** The anonymised id the page above stands for. */
export const PAGE_PLAYLIST_ID = 'PLtest0000000000000000000000000001';
