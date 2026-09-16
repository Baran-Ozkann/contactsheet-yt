// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { PERF_CLASS, PERF_PITCH, buildTail, perforate } from '../../src/popup/sprocket.js';

const css = readFileSync('src/popup/popup.css', 'utf8');

/**
 * The stylesheet is loaded into the document and read back through the CSSOM,
 * so these tests check the rules that will actually paint rather than a copy of
 * them. jsdom does not compute pseudo-element styles, so "does this row take
 * grease?" is answered the way the browser answers it: by asking whether the
 * element matches the rule's subject.
 */
beforeEach(() => {
  document.head.textContent = '';
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
});

/** Every `::before` rule in the stylesheet, @media blocks included. */
function beforeRules(): CSSStyleRule[] {
  const out: CSSStyleRule[] = [];
  const walk = (rules: CSSRuleList): void => {
    for (const rule of Array.from(rules)) {
      if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules);
      const selector = (rule as CSSStyleRule).selectorText;
      if (selector?.includes('::before')) out.push(rule as CSSStyleRule);
    }
  };
  walk(document.styleSheets[0]!.cssRules);
  return out;
}

/** The rule that paints a hole grease, minus its pseudo-element. */
function greaseSubject(): string {
  const rule = beforeRules().find((r) => /--grease/.test(r.cssText));
  expect(rule, 'no rule paints a perforation with --grease').toBeDefined();
  return rule!.selectorText.replace('::before', '').trim();
}

function row(hidden: boolean, position = 0): HTMLButtonElement {
  const el = document.createElement('button');
  el.className = 'row';
  el.setAttribute('role', 'switch');
  el.setAttribute('aria-checked', String(hidden));
  perforate(el, position);
  return el;
}

describe('the strip is present at all', () => {
  it('draws a perforation from a rule the stylesheet really carries', () => {
    const base = beforeRules().find((r) => r.selectorText === `.${PERF_CLASS}::before`);
    expect(base, 'the sprocket strip has no hole rule').toBeDefined();
    expect(base!.cssText).toMatch(/--emulsion/);
  });

  it('agrees with the stylesheet about the tail pitch', () => {
    const pitch = /--perf-pitch:\s*(\d+)px/.exec(css)?.[1];
    expect(Number(pitch)).toBe(PERF_PITCH);
  });
});

describe('a hidden row marks its hole', () => {
  it('takes grease when hidden and not when visible', () => {
    const subject = greaseSubject();
    const hidden = row(true);
    const visible = row(false);
    expect(hidden.matches(subject)).toBe(true);
    expect(visible.matches(subject)).toBe(false);
  });

  it('follows the same aria-checked the cross does, with no second flag', () => {
    const subject = greaseSubject();
    const el = row(false);
    expect(el.matches(subject)).toBe(false);
    el.setAttribute('aria-checked', 'true');
    expect(el.matches(subject)).toBe(true);
    el.setAttribute('aria-checked', 'false');
    expect(el.matches(subject)).toBe(false);
  });

  it('keeps the unexposed hole under both states', () => {
    // The base rule still matches; the grease rule simply wins when it applies.
    for (const el of [row(true), row(false)]) {
      expect(el.matches(`.${PERF_CLASS}`)).toBe(true);
    }
  });

  it('marks only rows — the head and foot never take grease', () => {
    const subject = greaseSubject();
    for (const name of ['head', 'foot', 'add', 'transfer']) {
      const band = document.createElement('div');
      band.className = `${name} ${PERF_CLASS}`;
      // A band cannot be aria-checked, but assert it even so: the selector has
      // to be anchored on .row, not on the attribute alone.
      band.setAttribute('aria-checked', 'true');
      expect(band.matches(subject)).toBe(false);
    }
  });
});

describe('the tail below the last row', () => {
  it('fills the strip height with plain perforations', () => {
    const tail = document.createElement('div');
    buildTail(tail);
    expect(tail.childElementCount).toBe(Math.ceil(520 / PERF_PITCH));
    for (const cell of Array.from(tail.children)) {
      expect(cell.classList.contains(PERF_CLASS)).toBe(true);
      expect(cell.hasAttribute('aria-checked')).toBe(false);
    }
  });

  it('never takes grease — it belongs to no frame', () => {
    const tail = document.createElement('div');
    buildTail(tail);
    const subject = greaseSubject();
    for (const cell of Array.from(tail.children)) {
      expect(cell.matches(subject)).toBe(false);
    }
  });

  it('is built once, however often the popup re-renders', () => {
    const tail = document.createElement('div');
    buildTail(tail);
    const first = tail.childElementCount;
    buildTail(tail);
    expect(tail.childElementCount).toBe(first);
  });
});

describe('the amber sync pulse', () => {
  it('staggers the holes so the light runs down the strip', () => {
    const delays = [0, 1, 2, 8].map((i) => {
      const el = document.createElement('div');
      perforate(el, i);
      return el.style.getPropertyValue('--perf-delay');
    });
    expect(delays).toEqual(['0s', '0.25s', '0.5s', '0s']);
  });

  it('overrides the grease while a sync runs', () => {
    const syncing = beforeRules().find(
      (r) => r.selectorText.startsWith('body.is-syncing') && /sprocket-run/.test(r.cssText),
    );
    expect(syncing, 'the sync animation no longer drives the holes').toBeDefined();
    // An animation outranks every normal declaration, so a struck row's grease
    // yields to amber for as long as the sync runs. The selector has to reach
    // every hole, not just the unmarked ones.
    expect(syncing!.selectorText).toBe(`body.is-syncing .${PERF_CLASS}::before`);
  });
});
