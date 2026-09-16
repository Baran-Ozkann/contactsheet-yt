// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '../../_locales/en/messages.json';
import {
  buildConfirm,
  buildFrame,
  buildRemove,
  classifyClick,
  type RowContext,
} from '../../src/popup/rows.js';
import type { PlaylistView } from '../../src/core/messaging.js';

const css = readFileSync('src/popup/popup.css', 'utf8');

/**
 * Removing a playlist (FR-13).
 *
 * The thing worth asserting is not that a remove button exists, it is that no
 * single click can remove anything: the control and the confirmation are
 * separate targets, and neither is inside the row that toggles. That is a
 * structural property, so it is checked structurally rather than by reading
 * the handler.
 */

interface Message {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

const CATALOGUE = en as Record<string, Message>;

/**
 * chrome.i18n.getMessage against the real English catalogue, so a missing key
 * or an unwired placeholder fails here rather than rendering as a raw key in
 * the popup.
 */
const ctx: RowContext = {
  t(key, ...subs) {
    const entry = CATALOGUE[key];
    expect(entry, `no message for ${key}`).toBeDefined();
    let out = entry!.message;
    for (const [name, spec] of Object.entries(entry!.placeholders ?? {})) {
      const index = Number(spec.content.replace('$', '')) - 1;
      // Messages spell placeholders in caps; the declarations key them lower.
      out = out.split(`$${name.toUpperCase()}$`).join(subs[index] ?? '');
    }
    return out;
  },
  num: (value) => String(value),
};

function view(over: Partial<PlaylistView> = {}): PlaylistView {
  return {
    id: 'PLtest0000000000000000000000000001',
    title: 'Morning list',
    hidden: true,
    itemCount: 49,
    indexedCount: 49,
    complete: true,
    partial: false,
    layer: 'L2',
    lastSyncedAt: 1,
    ...over,
  };
}

/** Every element inside a subtree, the root included. */
function everything(root: Element): Element[] {
  return [root, ...Array.from(root.querySelectorAll('*'))];
}

describe('the frame keeps the two actions apart', () => {
  it('puts the remove control outside the row, not inside it', () => {
    const frame = buildFrame(view(), 1, ctx);
    const row = frame.querySelector('.row');
    const remove = frame.querySelector('.remove');
    expect(row).not.toBeNull();
    expect(remove).not.toBeNull();
    // The invariant the whole design rests on: a click on the control cannot
    // reach the row's delegated toggle, because it is not within it.
    expect(row!.contains(remove!)).toBe(false);
    expect(remove!.closest('.row')).toBeNull();
  });

  it('nests no button inside a button', () => {
    const frame = buildFrame(view(), 1, ctx);
    for (const button of Array.from(frame.querySelectorAll('button'))) {
      expect(button.parentElement?.closest('button')).toBeNull();
    }
  });

  it('names the playlist in the control label', () => {
    const remove = buildRemove(view({ title: 'Morning list' }), ctx);
    expect(remove.getAttribute('aria-label')).toContain('Morning list');
  });

  it('carries no icon font or emoji (spec §6)', () => {
    const remove = buildRemove(view(), ctx);
    expect(remove.textContent).toBe('×');
    expect(remove.className).not.toMatch(/fa-|material|icon-/);
  });

  it('gives the control a target of at least 24x24 (spec §6.7)', () => {
    const block = /^\.remove \{([^}]*)\}/m.exec(css)?.[1];
    expect(block, 'no .remove rule in popup.css').toBeDefined();
    const width = /\bwidth: (\d+)px/.exec(block!)?.[1];
    const height = /\bheight: (\d+)px/.exec(block!)?.[1];
    expect(Number(width), 'width').toBeGreaterThanOrEqual(24);
    expect(Number(height), 'height').toBeGreaterThanOrEqual(24);
    // A resting opacity is what made it read as an artifact rather than a
    // control; the register is carried by the colour token instead.
    expect(block).not.toMatch(/opacity:/);
    expect(block).toMatch(/color: var\(--latent\)/);
  });
});

describe('no single click removes anything', () => {
  it('classifies the remove control as opening a confirmation, never a removal', () => {
    const frame = buildFrame(view(), 1, ctx);
    const action = classifyClick(frame.querySelector('.remove'));
    expect(action).toEqual({ kind: 'open-confirm', playlistId: view().id });
  });

  it('classifies it the same way however many times it is clicked', () => {
    // A double-click on one spot must not arm and then fire.
    const remove = buildFrame(view(), 1, ctx).querySelector('.remove');
    for (let i = 0; i < 3; i += 1) {
      expect(classifyClick(remove)?.kind).toBe('open-confirm');
    }
  });

  it('cannot produce a removal from anywhere in an unconfirmed frame', () => {
    const frame = buildFrame(view(), 1, ctx);
    for (const element of everything(frame)) {
      expect(classifyClick(element)?.kind, element.className).not.toBe('remove');
    }
  });

  it('still toggles from the row itself', () => {
    const frame = buildFrame(view(), 1, ctx);
    expect(classifyClick(frame.querySelector('.row-title'))).toEqual({
      kind: 'toggle',
      playlistId: view().id,
    });
  });
});

describe('the confirmation', () => {
  it('offers confirm and cancel as separate targets', () => {
    const panel = buildConfirm(view(), ctx);
    const yes = panel.querySelector('.confirm-yes');
    const no = panel.querySelector('.confirm-no');
    expect(yes).not.toBeNull();
    expect(no).not.toBeNull();
    expect(yes).not.toBe(no);
    expect(classifyClick(yes)).toEqual({ kind: 'remove', playlistId: view().id });
    expect(classifyClick(no)).toEqual({ kind: 'cancel' });
  });

  it('names the playlist being removed', () => {
    const panel = buildConfirm(view({ title: 'Morning list' }), ctx);
    expect(panel.querySelector('.confirm-question')?.textContent).toContain('Morning list');
    expect(panel.getAttribute('aria-label')).toContain('Morning list');
  });

  it('says how many indexed videos go with it', () => {
    const panel = buildConfirm(view({ indexedCount: 49 }), ctx);
    expect(panel.querySelector('.confirm-consequence')?.textContent).toContain('49');
  });

  it('says so plainly when nothing is indexed yet', () => {
    const panel = buildConfirm(view({ indexedCount: 0 }), ctx);
    const text = panel.querySelector('.confirm-consequence')?.textContent ?? '';
    expect(text).not.toBe('');
    expect(text).not.toContain('0');
  });

  it('carries the id on the confirming button, so it cannot remove another row', () => {
    const panel = buildConfirm(view({ id: 'PLtestother' }), ctx);
    expect(panel.querySelector<HTMLElement>('.confirm-yes')?.dataset.playlistId).toBe(
      'PLtestother',
    );
  });

  it('takes a perforation, so the strip stays continuous while confirming', () => {
    expect(buildConfirm(view(), ctx).classList.contains('perf')).toBe(true);
  });

  it('uses no button chrome for either choice (spec §6.5)', () => {
    const panel = buildConfirm(view(), ctx);
    for (const cls of ['.confirm-yes', '.confirm-no']) {
      expect(panel.querySelector(cls)?.classList.contains('link')).toBe(true);
    }
  });
});

describe('classifyClick', () => {
  it('means nothing outside the strip', () => {
    expect(classifyClick(null)).toBeNull();
    expect(classifyClick(document.createElement('div'))).toBeNull();
  });
});
