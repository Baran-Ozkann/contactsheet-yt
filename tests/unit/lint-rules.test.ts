import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

/**
 * The §7 lint rules are only evidence if they actually fire. A selector typo
 * in eslint.config.js fails silently — the rule matches nothing and lint stays
 * green — so each one is proven here against a snippet that must trip it.
 */

const eslint = new ESLint();

/** Lints `code` as if it were a file under src/, where the §7 rules apply. */
async function ruleIdsFor(code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: 'src/lint-probe.ts' });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'parse-error');
}

const FORBIDDEN: ReadonlyArray<[string, string, string]> = [
  ['§7.2 innerHTML', 'document.body.innerHTML = "x";', 'no-restricted-properties'],
  ['§7.2 outerHTML', 'document.body.outerHTML = "x";', 'no-restricted-properties'],
  ['§7.2 innerHTML, computed', 'document.body["innerHTML"] = "x";', 'no-restricted-properties'],
  ['§7.2 insertAdjacentHTML', 'document.body.insertAdjacentHTML("beforeend", "x");', 'no-restricted-syntax'],
  ['§7.1 eval', 'eval("1");', 'no-eval'],
  ['§7.1 window.eval', 'window.eval("1");', 'no-eval'],
  ['§7.1 new Function', 'new Function("return 1");', 'no-new-func'],
  ['§7.1 Function()', 'Function("return 1");', 'no-new-func'],
  ['§7.1 setTimeout(string)', 'setTimeout("alert(1)", 0);', 'no-implied-eval'],
  ['§7.15 document.cookie', 'export const c = document.cookie;', 'no-restricted-properties'],
  ['§7.15 chrome.cookies', 'void chrome.cookies.getAll({});', 'no-restricted-properties'],
  ['§7.15 SAPISID', 'export const name = "SAPISID";', 'no-restricted-syntax'],
  ['§7.15 Authorization header', 'void fetch("/x", { headers: { Authorization: "a" } });', 'no-restricted-syntax'],
  ['§7.15 Authorization header, quoted', 'void fetch("/x", { headers: { "authorization": "a" } });', 'no-restricted-syntax'],
  ['§7.9 window.fetch', 'window.fetch = () => Promise.reject();', 'no-restricted-syntax'],
  ['§7.9 globalThis global', 'globalThis.XMLHttpRequest = class {} as never;', 'no-restricted-syntax'],
  ['§7.9 prototype patch', 'XMLHttpRequest.prototype.open = () => undefined;', 'no-restricted-syntax'],
  ['§7.9 defineProperty', 'Object.defineProperty(window, "fetch", { value: 1 });', 'no-restricted-syntax'],
];

describe('§7 lint rules', () => {
  it.each(FORBIDDEN)('%s is rejected', async (_name, code, ruleId) => {
    expect(await ruleIdsFor(code)).toContain(ruleId);
  });

  it('lets the approved forms through', async () => {
    const clean = [
      'const el = document.createElement("p");',
      'el.textContent = "x";',
      'void fetch("/playlist", { credentials: "include", headers: { "Content-Type": "application/json" } });',
      'setTimeout(() => undefined, 0);',
      'export { el };',
    ].join('\n');
    expect(await ruleIdsFor(clean)).toEqual([]);
  });
});
