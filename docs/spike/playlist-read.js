/**
 * Playlist read check — the measurement behind ADR-0002.
 *
 * Kept as a regression tool: if indexing ever stops working, run this first to
 * see whether YouTube changed the shape, the token, or the auth requirement.
 *
 * Usage: open https://www.youtube.com signed in, DevTools -> Console,
 * type "allow pasting" if asked, paste this file, press Enter.
 *
 * Reads only. Sends nothing anywhere. Prints counts, never ids or cookies.
 */
(async () => {
  // Put your own ids here: WL plus one ordinary PL... list is enough to see
  // both render shapes. Add a 200+ video list to exercise real continuations.
  const LISTS = ['WL', 'LL'];

  const log = (c, ...a) => console.log('%c[read]', `color:${c};font-weight:600`, ...a);
  const ok = (...a) => log('#7FB069', ...a);
  const bad = (...a) => log('#D0342C', ...a);
  const out = (...a) => log('#E8A33D', ...a);

  function extractJson(html, marker) {
    let i = html.indexOf(marker);
    while (i !== -1) {
      const b = html.indexOf('{', i);
      if (b === -1) return null;
      if (b - i < 40) {
        let d = 0, s = false, e = false;
        for (let j = b; j < html.length; j++) {
          const c = html[j];
          if (s) { if (e) e = false; else if (c === '\\') e = true; else if (c === '"') s = false; }
          else if (c === '"') s = true;
          else if (c === '{') d++;
          else if (c === '}' && --d === 0) {
            try { return JSON.parse(html.slice(b, j + 1)); } catch { return null; }
          }
        }
      }
      i = html.indexOf(marker, i + marker.length);
    }
    return null;
  }

  /**
   * ADR-0002: collect by SHAPE, not by field name. Both render paths are live.
   * Never harvest every "videoId" key — addedVideoId / removedVideoId /
   * animationActivationTargetId also hold 11-char ids and are button actions.
   */
  function videoIds(n, acc = new Set(), d = 0) {
    if (d > 60 || n === null || typeof n !== 'object') return acc;
    for (const [k, v] of Object.entries(n)) {
      if (k === 'lockupViewModel' && v && v.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO'
          && typeof v.contentId === 'string') acc.add(v.contentId);
      else if (k === 'playlistVideoRenderer' && v && typeof v.videoId === 'string') acc.add(v.videoId);
      else if (typeof v === 'object') videoIds(v, acc, d + 1);
    }
    return acc;
  }

  /**
   * Which render path served this page (ADR-0002). The two behave differently
   * at the end of a playlist: the legacy one stops carrying a continuation
   * token, the lockup one carries one whether or not there is a page behind it
   * (ADR-0004).
   */
  function shape(n, acc = { lockup: 0, legacy: 0 }, d = 0) {
    if (d > 60 || n === null || typeof n !== 'object') return acc;
    for (const [k, v] of Object.entries(n)) {
      if (k === 'lockupViewModel' && v && v.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') acc.lockup++;
      else if (k === 'playlistVideoRenderer' && v && typeof v.videoId === 'string') acc.legacy++;
      else if (typeof v === 'object') shape(v, acc, d + 1);
    }
    return acc;
  }

  function tokens(n, acc = [], d = 0) {
    if (d > 60 || n === null || typeof n !== 'object') return acc;
    for (const [k, v] of Object.entries(n)) {
      if (k === 'continuationCommand' && v && typeof v.token === 'string') acc.push(v.token);
      else if (typeof v === 'object') tokens(v, acc, d + 1);
    }
    return acc;
  }

  const home = await (await fetch('https://www.youtube.com/', { credentials: 'include' })).text();
  const key = home.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
  const ver = home.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] ?? '2.20260911.01.00';
  out('api key:', Boolean(key), '· client version:', ver);
  if (!key) return bad('no api key in homepage html');

  const ask = async (token) => {
    const r = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${key}&prettyPrint=false`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, // no Authorization — ADR-0002
      body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: ver } }, continuation: token }),
    });
    return { status: r.status, json: await r.json() };
  };

  for (const id of LISTS) {
    const res = await fetch(`https://www.youtube.com/playlist?list=${id}`, { credentials: 'include' });
    const data = extractJson(await res.text(), 'ytInitialData');
    if (!data) { bad(`${id}: HTTP ${res.status}, no ytInitialData`); continue; }

    const all = videoIds(data);
    const first = all.size;
    const counts = shape(data);
    let candidates = [...new Set(tokens(data))];
    const rendered = counts.lockup >= counts.legacy ? 'lockup (new)' : 'playlistVideoRenderer (old)';
    out(`${id}: page 1 = ${first} video · ${rendered} · ${candidates.length} token candidate(s)`);

    // ADR-0004: a token that ANSWERS with no videos ends the playlist; a token
    // that does not answer leaves it unknown. This is the line that decides
    // whether a one-page playlist is reported complete, so print both.
    let answeredAll = true;
    let token = null;
    for (const t of candidates) {
      const { status, json } = await ask(t);
      const ids = videoIds(json);
      if (status !== 200) answeredAll = false;
      out(`${id}: token probe -> HTTP ${status} · ${ids.size} video`);
      await new Promise((r) => setTimeout(r, 500));
      if (ids.size) { for (const v of ids) all.add(v); token = tokens(json)[0] ?? null; break; }
    }
    if (candidates.length && !token) {
      out(`${id}: no token carried videos · every probe answered: ${answeredAll}`);
      out(`${id}: the extension records complete:${answeredAll} (ADR-0004)`);
    }

    let pages = token || first ? 1 : 0;
    while (token && pages < 200) {
      const { status, json } = await ask(token);
      const ids = videoIds(json);
      if (!ids.size) { out(`${id}: chain ended at HTTP ${status}`); break; }
      for (const v of ids) all.add(v);
      token = tokens(json)[0] ?? null;
      pages++;
      await new Promise((r) => setTimeout(r, 500));
    }

    (all.size ? ok : bad)(`${id}: TOTAL ${all.size} unique video · ${pages} continuation page(s) · unsigned`);
  }

  ok('done');
})();
