import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Read rather than import: Vite resolves *.css?raw to an empty string under the
// node transform, and an empty string would satisfy every "forbidden" assertion
// below without testing anything. Paths are relative to the project root, which
// is vitest's working directory.
const css = readFileSync('src/popup/popup.css', 'utf8');
const html = readFileSync('src/popup/index.html', 'utf8');
const spec = readFileSync('docs/SPEC.md', 'utf8');

/** The palette as §6.2 declares it — the binding source, not a copy of it. */
function specPalette(): Record<string, string> {
  const block = /### 6\.2 Tokens\s*```([\s\S]*?)```/.exec(spec)?.[1] ?? '';
  const out: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const found = /^(--[a-z]+)\s+(#[0-9A-Fa-f]{6})/.exec(line.trim());
    if (found?.[1] && found[2]) out[found[1]] = found[2].toLowerCase();
  }
  return out;
}

/** The palette as the stylesheet actually defines it. */
function cssPalette(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/(--(?:film|frame|emulsion|latent|grease|safelight)):\s*(#[0-9a-f]{6})/gi)) {
    if (m[1] && m[2]) out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

/**
 * Spec §6 is binding, and its "Forbidden" list is the part most likely to drift
 * back in later. Asserting it here means a gradient or a drop shadow fails the
 * build rather than surviving to review.
 */

describe('spec §6 forbidden list', () => {
  it.each([
    ['gradients', /linear-gradient|radial-gradient|conic-gradient/i],
    ['soft grey shadows', /box-shadow|text-shadow|filter:\s*drop-shadow/i],
    ['glassmorphism', /backdrop-filter/i],
    ['purple or indigo accents', /#(6|7|8|9)[0-9a-f]{2}(e|f)[0-9a-f]|indigo|purple|blueviolet/i],
    ['all-caps label bands', /text-transform:\s*uppercase/i],
  ])('has no %s', (_name, pattern) => {
    expect(css).not.toMatch(pattern);
  });

  it('has no emoji or icon-library markup', () => {
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(html).not.toMatch(/font-awesome|material-icons|<i\s+class=/i);
  });

  it('has no button text with an appended arrow', () => {
    expect(html).not.toMatch(/→/);
  });

  it('loads no remote font or stylesheet (§6.3, §7 rule 1)', () => {
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic|@import\s+url\(\s*['"]?https?:/i);
    expect(html).not.toMatch(/https?:\/\//);
  });
});

describe('spec §6 required properties', () => {
  it('declares the exact palette §6.2 specifies, with no drift', () => {
    const fromSpec = specPalette();
    // Guard the guard: if the spec block ever stops parsing, this assertion
    // would pass against an empty object and prove nothing.
    expect(Object.keys(fromSpec).sort()).toEqual([
      '--emulsion',
      '--film',
      '--frame',
      '--grease',
      '--latent',
      '--safelight',
    ]);
    expect(cssPalette()).toEqual(fromSpec);
  });

  it('is a 380 x 520 popup (§6.4)', () => {
    expect(css).toMatch(/width:\s*380px/);
    expect(css).toMatch(/height:\s*520px/);
  });

  it('draws the cross over 180ms with a 60ms second stroke (§6.5)', () => {
    expect(css).toMatch(/--stroke-ms:\s*180ms/);
    expect(css).toMatch(/cubic-bezier\(0\.2,\s*0\.7,\s*0\.3,\s*1\)/);
    expect(css).toMatch(/transition-delay:\s*60ms/);
  });

  it('uses a 2px frame gap rather than hairline rules (§6.4)', () => {
    expect(css).toMatch(/margin-bottom:\s*2px/);
    expect(css).not.toMatch(/border-bottom:\s*1px/);
  });

  it('uses tabular numerals for counts and frame numbers (§6.3)', () => {
    expect(css).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  it('has a 2px safelight focus ring on :focus-visible (§6.5)', () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--safelight\)/);
    expect(css).toMatch(/outline-offset:\s*2px/);
  });

  it('honours prefers-reduced-motion (§6.5)', () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  it('has no staggered entrance animation on load (§6.5)', () => {
    // The only animation is the sprocket sync loop.
    const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
    expect(names).toEqual(['sprocket-run']);
  });
});

describe('spec §6.7 accessibility', () => {
  function ratio(a: string, b: string): number {
    const lin = (c: number): number => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const lum = (hex: string): number => {
      const n = parseInt(hex.slice(1), 16);
      return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  }

  const film = '#2b2f27';
  const frame = '#343a31';

  const TOKEN_PATTERNS = {
    emulsion: /--emulsion:\s*(#[0-9a-f]{6})/i,
    latent: /--latent:\s*(#[0-9a-f]{6})/i,
  };

  function token(name: keyof typeof TOKEN_PATTERNS): string {
    return TOKEN_PATTERNS[name].exec(css)?.[1] ?? '';
  }

  it('emulsion reaches 7:1 on both surfaces', () => {
    expect(ratio(token('emulsion'), film)).toBeGreaterThanOrEqual(7);
    expect(ratio(token('emulsion'), frame)).toBeGreaterThanOrEqual(7);
  });

  it('latent reaches 4.5:1 on both surfaces', () => {
    // Rows sit on --frame, which is the binding surface. The spec's original
    // #8E9184 measured 3.64:1 there; §6.7 says to verify and adjust the token.
    expect(ratio(token('latent'), frame)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token('latent'), film)).toBeGreaterThanOrEqual(4.5);
  });

  it('gives every row a switch role and the master toggle a label', () => {
    expect(html).toMatch(/role="switch"/);
    expect(html).toMatch(/aria-checked/);
    expect(html).toMatch(/data-i18n-aria="popupMasterLabel"/);
  });

  it('announces state changes in a polite live region', () => {
    expect(html).toMatch(/aria-live="polite"/);
  });
});
