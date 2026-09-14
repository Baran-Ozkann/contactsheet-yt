import type { Settings } from '../core/types.js';

/**
 * Phase 0 popup: confirms the message channel is alive. Phase 5 replaces the
 * whole view with the contact-sheet interface described in spec §6.
 *
 * No user-facing string is written here — everything comes from _locales
 * (spec §10 rule 13).
 */
const status = document.getElementById('status');

function t(key: string, ...substitutions: string[]): string {
  // Falls back to the key rather than to a hardcoded sentence: a missing
  // translation should be obvious in review, not silently papered over.
  return chrome.i18n.getMessage(key, substitutions) || key;
}

function say(key: string, ...substitutions: string[]): void {
  if (status) status.textContent = t(key, ...substitutions); // textContent only — spec §7.2
}

/** Fills every [data-i18n] node from the message catalogue. */
function localize(): void {
  document.documentElement.lang = chrome.i18n.getUILanguage();
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = node.dataset.i18n;
    if (key) node.textContent = t(key);
  }
}

async function main(): Promise<void> {
  localize();
  try {
    const res = (await chrome.runtime.sendMessage({ type: 'settings:get' })) as
      | { ok: true; settings: Settings }
      | { ok: false };

    if (!res || res.ok !== true) {
      say('popupSettingsError');
      return;
    }

    const count = Object.keys(res.settings.playlists).length;
    if (count === 0) say('popupEmpty');
    else say('popupSavedCount', String(count));
  } catch {
    say('popupBackgroundError');
  }
}

void main();
