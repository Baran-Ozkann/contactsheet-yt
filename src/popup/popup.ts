import type { Settings } from '../core/types.js';

/**
 * Phase 0 popup: confirms the message channel is alive. Phase 5 replaces the
 * whole view with the contact-sheet interface described in spec §6.
 */
const status = document.getElementById('status');

function say(text: string): void {
  if (status) status.textContent = text; // textContent only — spec §7.2
}

async function main(): Promise<void> {
  try {
    const res = (await chrome.runtime.sendMessage({ type: 'settings:get' })) as
      | { ok: true; settings: Settings }
      | { ok: false };

    if (!res || res.ok !== true) {
      say('Ayarlar okunamadı. Eklentiyi yeniden yükle.');
      return;
    }

    const count = Object.keys(res.settings.playlists).length;
    say(count === 0 ? 'Henüz liste okunmadı.' : `${count} liste kayıtlı.`);
  } catch {
    say('Arka plan servisine ulaşılamadı.');
  }
}

void main();
