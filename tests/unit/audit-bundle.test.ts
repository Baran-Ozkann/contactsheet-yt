import { describe, expect, it } from 'vitest';
import { auditSource, isAllowedUrl } from '../../scripts/audit-bundle.mjs';

/**
 * The bundle audit is the last gate before a package exists, so it is tested
 * both ways: every forbidden form is caught, and the forms the real bundle
 * legitimately contains are not.
 */

describe('auditSource', () => {
  it.each([
    ['§7.13', 'console.debug("[contactsheet]", x)'],
    ['§7.1', 'eval("1")'],
    ['§7.1', 'new Function("return 1")'],
    ['§7.1', 'a=Function("return 1")'],
    ['§7.2', 'e.innerHTML=t'],
    ['§7.2', 'e.insertAdjacentHTML("beforeend",t)'],
    ['§7.15', 'const c=document.cookie'],
    ['§7.15', 'chrome.cookies.getAll({})'],
    ['§7.15', '"SAPISIDHASH "+h'],
    ['§7.15', '{headers:{Authorization:a}}'],
    ['§7.4', 'fetch("https://example.com/collect")'],
    ['§7.4', 'new WebSocket("wss://www.youtube.com/x")'],
    ['§7.4', 'fetch("http://www.youtube.com/playlist")'],
  ])('flags %s in %s', (rule, source) => {
    expect(auditSource(source).map((f) => f.rule)).toContain(rule);
  });

  it('passes what the production bundle legitimately contains', () => {
    const source = [
      'const O="https://www.youtube.com";',
      'chrome.tabs.query({url:"https://www.youtube.com/*"});',
      'document.createElementNS("http://www.w3.org/2000/svg","svg");',
      'console.warn("[contactsheet]",e);console.error("[contactsheet]",e);',
      'e.textContent=t;',
      'fetch(u,{credentials:"include",headers:{"Content-Type":"application/json"}});',
      'src: url("../assets/fonts/Archivo-Medium.woff2")',
      // parsePlaylistInput: a scheme put in front of pasted text, never fetched.
      'const w=/^https?:\\/\\//i.test(e)?e:`https://${e}`;',
    ].join('\n');
    expect(auditSource(source)).toEqual([]);
  });
});

describe('isAllowedUrl', () => {
  it('accepts the origin and its paths', () => {
    expect(isAllowedUrl('https://www.youtube.com')).toBe(true);
    expect(isAllowedUrl('https://www.youtube.com/youtubei/v1/browse')).toBe(true);
  });

  it('rejects look-alike hosts that share the prefix', () => {
    expect(isAllowedUrl('https://www.youtube.com.example.net/x')).toBe(false);
    expect(isAllowedUrl('https://www.youtube.comx')).toBe(false);
    expect(isAllowedUrl('https://youtube.com/')).toBe(false);
  });
});
