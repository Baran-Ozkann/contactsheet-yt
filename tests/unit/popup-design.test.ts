import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Read rather than import: Vite resolves *.css?raw to an empty string under the
// node transform, and an empty string would satisfy every "forbidden" assertion
// below without testing anything. Paths are relative to the project root, which
// is vitest's working directory.
const css = readFileSync('src/popup/popup.css', 'utf8');
const html = readFileSync('src/popup/index.html', 'utf8');
const ts = readFileSync('src/popup/popup.ts', 'utf8');
const spec = readFileSync('docs/SPEC.md', 'utf8');

interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The two cross strokes, reduced to the chord between their endpoints. The
 * curve wobbles around that chord by a couple of units, so if the chords cross
 * the drawn strokes cross too.
 */
function crossStrokes(): Segment[] {
  const out: Segment[] = [];
  for (const m of ts.matchAll(/'M\s+([\d.]+)\s+([\d.]+)\s+C\s+[^']*?([\d.]+)\s+([\d.]+)'/g)) {
    out.push({ x1: Number(m[1]), y1: Number(m[2]), x2: Number(m[3]), y2: Number(m[4]) });
  }
  return out;
}

/** Standard orientation test: the segments cross iff each straddles the other. */
function straddles(a: Segment, b: Segment): boolean {
  const side = (s: Segment, x: number, y: number): number =>
    Math.sign((s.x2 - s.x1) * (y - s.y1) - (s.y2 - s.y1) * (x - s.x1));
  return (
    side(a, b.x1, b.y1) * side(a, b.x2, b.y2) < 0 && side(b, a.x1, a.y1) * side(b, a.x2, a.y2) < 0
  );
}

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

  it('contains the cross inside its own row', () => {
    // The row clips, the cross is inset from the frame edge, and the stroke
    // does not scale with the stretched viewBox — the three things that let it
    // bleed into the neighbouring row.
    expect(css).toMatch(/\.row\s*\{[^}]*overflow:\s*hidden/);
    // The left inset also clears the sprocket gutter, so the mark strikes the
    // frame's content and never the perforation beside it.
    expect(css).toMatch(/\.cross\s*\{[^}]*inset:\s*7px 14px 7px calc\(var\(--gutter\) - 2px\)/);
    expect(css).toMatch(/vector-effect:\s*non-scaling-stroke/);
  });

  it('keeps the cross thin enough to read type through (item 1)', () => {
    // Legibility comes from weight and opacity, never from routing the strokes
    // around the type — so both have to stay low.
    const width = /\.cross path\s*\{[^}]*stroke-width:\s*([\d.]+)/.exec(css)?.[1];
    expect(Number(width)).toBeLessThanOrEqual(1.25);
    const opacity = /\.cross path\s*\{[^}]*stroke-opacity:\s*([\d.]+)/.exec(css)?.[1];
    expect(Number(opacity)).toBeGreaterThan(0);
    expect(Number(opacity)).toBeLessThanOrEqual(0.6);
  });

  it('is two strokes that actually intersect over the row (item 1)', () => {
    // A mark whose strokes dodge the title is four fragments in the corners,
    // not a cross. This is the assertion that stops that regression.
    const strokes = crossStrokes();
    expect(strokes).toHaveLength(2);
    const [a, b] = strokes as [Segment, Segment];
    expect(straddles(a, b)).toBe(true);
  });

  it('spans the row rather than stopping short of the type (item 1)', () => {
    const [a, b] = crossStrokes() as [Segment, Segment];
    // viewBox is 0 0 100 44, so each stroke has to run most of that width.
    for (const s of [a, b]) {
      expect(Math.abs(s.x2 - s.x1)).toBeGreaterThanOrEqual(85);
    }
  });

  it('runs a sprocket strip down the left edge (§6.4)', () => {
    // The strip is the design's load-bearing element. If it disappears again,
    // this is the assertion that says so.
    expect(css).toMatch(/--sprocket-width:\s*16px/);
    expect(css).toMatch(/--gutter:\s*calc\(var\(--sprocket-width\) \+ 16px\)/);
    expect(css).toMatch(/^\.perf::before\s*\{/m);
    expect(html).toMatch(/id="tail"/);
    // Every band of the strip carries a hole, so it runs the full height.
    for (const band of ['head', 'message', 'add', 'transfer', 'foot']) {
      expect(html, band).toMatch(new RegExp(`class="${band} perf"`));
    }
  });

  it('aligns the perforations with the rows, not its own pitch (item 2)', () => {
    // The hole belongs to the frame it sits beside rather than to a standalone
    // column, which is what let the old 26px pitch drift against the rows.
    expect(html).not.toMatch(/id="sprocket"/);
    expect(css).toMatch(/^\.perf\s*\{[^}]*position:\s*relative/m);
    expect(css).toMatch(/^\.perf::before\s*\{[^}]*position:\s*absolute/m);
    // Frames reserve the gutter the hole is drawn in, rather than the strip
    // being laid out as its own grid column.
    expect(css).not.toMatch(/grid-template-columns:\s*var\(--sprocket-width\)/);
    expect(css).toMatch(/\.row\s*\{[^}]*padding:\s*12px 16px 12px var\(--gutter\)/);
  });

  it('marks the hole of a hidden row and leaves a visible one unexposed (item 2)', () => {
    expect(css).toMatch(
      /\.row\.perf\[aria-checked='true'\]::before\s*\{[^}]*background:\s*var\(--grease\)/,
    );
    const base = /^\.perf::before\s*\{([^}]*)\}/m.exec(css)?.[1] ?? '';
    expect(base).toMatch(/background:\s*var\(--emulsion\)/);
    expect(Number(/opacity:\s*([\d.]+)/.exec(base)?.[1])).toBeLessThanOrEqual(0.3);
  });

  it('keeps plain perforations running below the last row (item 2)', () => {
    expect(css).toMatch(/--perf-pitch:\s*\d+px/);
    expect(css).toMatch(/\.tail-cell\s*\{[^}]*height:\s*var\(--perf-pitch\)/);
    // The tail takes the space the rows leave, rather than the rows taking it.
    expect(css).toMatch(/\.rows\s*\{[^}]*flex:\s*0 1 auto/);
    // Basis 0 so a strip's worth of tail cells cannot squeeze the frames.
    expect(css).toMatch(/\.tail\s*\{[^}]*flex:\s*1 1 0/);
  });

  it('keeps the amber sync pulse, overriding the grease (§6.5, item 2)', () => {
    expect(css).toMatch(
      /body\.is-syncing \.perf::before\s*\{[^}]*animation:\s*sprocket-run 2s linear infinite/,
    );
    // The block is short and it is the only one in the sheet, so a bounded
    // span from its header stays inside it.
    const frames = /@keyframes sprocket-run[\s\S]{0,400}/.exec(css)?.[0] ?? '';
    expect(frames).toMatch(/background-color:\s*var\(--safelight\)/);
    expect(frames).toMatch(/background-color:\s*var\(--emulsion\)/);
  });

  it.each([
    ['.row-title', /\.row-title\s*\{[^}]*\}/],
    ['.row-note', /\.row-note\s*\{[^}]*\}/],
  ])('truncates %s rather than widening the row (item 5)', (_name, blockPattern) => {
    const block = blockPattern.exec(css)?.[0] ?? '';
    expect(block).not.toBe('');
    expect(block).toMatch(/text-overflow:\s*ellipsis/);
    expect(block).toMatch(/white-space:\s*nowrap/);
    expect(block).toMatch(/overflow:\s*hidden/);
  });

  it('builds the empty state from frames, not an illustration (item 7)', () => {
    expect(html).toMatch(/id="ghost-strip"/);
    expect(css).toMatch(/\.ghost\s*\{/);
    // A bar where a title would sit, and a mark already on one frame at a
    // fraction of its strength — boxes and rules only.
    expect(css).toMatch(/\.ghost-bar\s*\{/);
    expect(css).toMatch(/\.ghost \.cross path\s*\{[^}]*stroke-opacity:\s*0?\.14/);
    expect(css).not.toMatch(/\.ghost[^{]*\{[^}]*border-radius/);
  });

  it('uses palette tokens for hover rather than a stray hex', () => {
    const hovers = css.match(/:hover[^{]*\{[^}]*\}/g) ?? [];
    expect(hovers.length).toBeGreaterThan(0);
    for (const block of hovers) {
      expect(block).not.toMatch(/#[0-9a-f]{3,6}/i);
    }
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

  // Read the surfaces from the stylesheet rather than repeating them. Hardcoded
  // copies silently go stale the moment the palette changes, and then this
  // block measures a palette that no longer exists.
  const palette = cssPalette();
  const film = palette['--film'] ?? '';
  const frame = palette['--frame'] ?? '';

  it('resolves every colour it measures', () => {
    for (const name of ['--film', '--frame', '--emulsion', '--latent']) {
      expect(palette[name], name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('emulsion reaches 7:1 on both surfaces', () => {
    expect(ratio(palette['--emulsion'] ?? '', film)).toBeGreaterThanOrEqual(7);
    expect(ratio(palette['--emulsion'] ?? '', frame)).toBeGreaterThanOrEqual(7);
  });

  it('latent reaches 4.5:1 on both surfaces', () => {
    // Rows sit on --frame, which is the binding surface — it is the one that
    // fails first, and the one §6.7's "adjust the token" clause is aimed at.
    expect(ratio(palette['--latent'] ?? '', frame)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(palette['--latent'] ?? '', film)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the two surfaces far enough apart that the 2px gaps read (§6.4)', () => {
    // The gaps are the only separator between rows; too close and the strip
    // reads as one block, which is what the olive palette did. WCAG's ratio
    // compresses hard at the dark end (the old pair scored 1.167, the new one
    // 1.270 — barely distinguishable as numbers), so separation is measured as
    // a plain luminance ratio, where the step is 1.48x versus 1.97x.
    const lin = (c: number): number => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const lum = (hex: string): number => {
      const n = parseInt(hex.slice(1), 16);
      return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    };
    expect(lum(frame) / lum(film)).toBeGreaterThanOrEqual(1.8);
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
