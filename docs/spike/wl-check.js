/**
 * SPIKE — how do we read playlist contents? (spec §4.2)
 *
 * Answers four questions in one run:
 *   1. Does the playlist page HTML give us the first page with cookies alone?
 *   2. Does InnerTube need the SAPISIDHASH signature — and can we compute it?
 *   3. Do homepage cards already tell us which videos are in Watch Later?
 *   4. How many videos does each list actually return?
 *
 * Run this BEFORE writing Phase 3. It takes about a minute.
 *
 * How to run:
 *   1. Open https://www.youtube.com (the homepage, signed in).
 *   2. DevTools → Console. Chrome asks you to type "allow pasting" once.
 *   3. Paste this whole file, press Enter.
 *
 * It only reads. Nothing is sent anywhere. It prints counts, not video ids,
 * and never prints your cookie.
 */
(async () => {
  // Add one of your own "PL..." ids here to compare against the system lists.
  const PLAYLISTS = ['WL', 'LL'];

  const out = (...a) => console.log('%c[spike]', 'color:#E8A33D;font-weight:600', ...a);
  const ok = (...a) => console.log('%c[spike]', 'color:#7FB069;font-weight:600', ...a);
  const bad = (...a) => console.log('%c[spike]', 'color:#D0342C;font-weight:600', ...a);

  // ── helpers ───────────────────────────────────────────────────────────────

  /** Pull a JSON object out of page HTML by brace matching. */
  function extractJson(html, marker) {
    let i = html.indexOf(marker);
    while (i !== -1) {
      const brace = html.indexOf('{', i);
      if (brace === -1) return null;
      if (brace - i < 40) {
        let depth = 0, inStr = false, esc = false;
        for (let j = brace; j < html.length; j++) {
          const c = html[j];
          if (inStr) {
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
          } else if (c === '"') inStr = true;
          else if (c === '{') depth++;
          else if (c === '}' && --depth === 0) {
            try { return JSON.parse(html.slice(brace, j + 1)); } catch { return null; }
          }
        }
      }
      i = html.indexOf(marker, i + marker.length);
    }
    return null;
  }

  /** Collect every value stored under `key`, anywhere in the tree. */
  function collect(node, key, sink = [], depth = 0) {
    if (depth > 60 || node === null || typeof node !== 'object') return sink;
    for (const [k, v] of Object.entries(node)) {
      if (k === key) sink.push(v);
      else collect(v, key, sink, depth + 1);
    }
    return sink;
  }

  function cookie(name) {
    const hit = document.cookie.split('; ').find((c) => c.startsWith(name + '='));
    return hit ? hit.slice(name.length + 1) : undefined;
  }

  /** The signature YouTube's own client sends. The cookie is never logged. */
  async function sapisidHash() {
    const sapisid = cookie('SAPISID') || cookie('__Secure-3PAPISID');
    if (!sapisid) return null;
    const ts = Math.floor(Date.now() / 1000);
    const data = new TextEncoder().encode(ts + ' ' + sapisid + ' https://www.youtube.com');
    const digest = await crypto.subtle.digest('SHA-1', data);
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `SAPISIDHASH ${ts}_${hex}`;
  }

  // ── 0. session ────────────────────────────────────────────────────────────
  const signedIn = Boolean(cookie('SAPISID') || cookie('__Secure-3PAPISID'));
  (signedIn ? ok : bad)('0 · session cookie readable from JS:', signedIn);
  if (!signedIn) {
    bad('sign in to youtube.com first, then run again');
    return;
  }

  // ── 1. playlist page HTML, cookies only ───────────────────────────────────
  const firstPage = {};
  for (const id of PLAYLISTS) {
    try {
      const res = await fetch(`https://www.youtube.com/playlist?list=${id}`, { credentials: 'include' });
      const html = await res.text();
      const data = extractJson(html, 'ytInitialData');
      if (!data) {
        bad(`1 · ${id}: HTTP ${res.status}, no ytInitialData (${html.length} bytes)`);
        continue;
      }

      const items = collect(data, 'playlistVideoRenderer');
      const tokens = collect(data, 'continuationCommand').map((c) => c && c.token).filter(Boolean);
      firstPage[id] = { count: items.length, token: tokens[0] || null };

      (items.length ? ok : bad)(
        `1 · ${id}: HTTP ${res.status} · ${items.length} video on page 1 · continuation token: ${tokens[0] ? 'yes' : 'no'}`,
      );
    } catch (err) {
      bad(`1 · ${id}: request failed`, err);
    }
  }

  // ── 2. InnerTube continuation, with and without the signature ─────────────
  const home = await (await fetch('https://www.youtube.com/', { credentials: 'include' })).text();
  const keyMatch = home.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  const verMatch = home.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);
  const key = keyMatch ? keyMatch[1] : null;
  const ver = verMatch ? verMatch[1] : '2.20240101.00.00';
  out('2 · api key found:', Boolean(key), '· client version:', ver);

  const target = Object.entries(firstPage).find(([, v]) => v.token);
  if (!key) {
    bad('2 · no api key in homepage html — path 2 unavailable');
  } else if (!target) {
    out('2 · no continuation token to test (lists are short) — retest with a list of 100+ videos');
  } else {
    const id = target[0];
    const token = target[1].token;
    const body = JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion: ver } },
      continuation: token,
    });

    for (const signed of [false, true]) {
      const auth = signed ? await sapisidHash() : null;
      if (signed && !auth) {
        bad('2 · could not compute signature');
        break;
      }
      try {
        const headers = { 'Content-Type': 'application/json', 'X-Goog-AuthUser': '0' };
        if (auth) headers.Authorization = auth;

        const res = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${key}&prettyPrint=false`, {
          method: 'POST',
          credentials: 'include',
          headers,
          body,
        });
        const json = await res.json();
        const items = collect(json, 'playlistVideoRenderer');
        const label = signed ? 'with signature' : 'cookies only  ';
        (items.length ? ok : bad)(`2 · ${id} continuation, ${label}: HTTP ${res.status} · ${items.length} video`);
      } catch (err) {
        bad(`2 · continuation ${signed ? 'signed' : 'unsigned'} failed`, err);
      }
    }
  }

  // ── 3. does the homepage already know what's in Watch Later? ──────────────
  const homeData = extractJson(home, 'ytInitialData');
  if (!homeData) {
    bad('3 · no ytInitialData on the homepage');
  } else {
    const toggles = collect(homeData, 'thumbnailOverlayToggleButtonRenderer');
    const withState = toggles.filter((t) => t && typeof t.isToggled === 'boolean');
    const alreadySaved = withState.filter((t) => t.isToggled === true);
    (withState.length ? ok : out)(
      `3 · toggle overlays in initial data: ${toggles.length} · carrying isToggled: ${withState.length} · already saved: ${alreadySaved.length}`,
    );
    if (!withState.length) {
      out('3 · no saved-state in the initial payload — path 3 is out, use paths 1+2 for Watch Later too');
    }

    const live = document.querySelectorAll(
      'ytd-thumbnail-overlay-toggle-button-renderer[is-toggled],ytd-thumbnail-overlay-toggle-button-renderer[toggled]',
    );
    out(`3 · toggled overlay elements currently in the live DOM: ${live.length}`);
  }

  ok('done — write these numbers into docs/adr/0002-playlist-erisimi.md');
})();
