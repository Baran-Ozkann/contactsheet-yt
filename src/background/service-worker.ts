import { isMessage, isTrustedSender, type Message } from '../core/messaging.js';
import { readSettings, writeSettings } from '../core/settings.js';
import { log } from '../core/logger.js';

const SYNC_ALARM = 'contactsheet:sync';

/**
 * This worker owns every write to storage and never touches the network.
 * All YouTube requests happen in the content script, on youtube.com's own
 * origin, so no credentials ever reach this context (spec §2.1).
 */

chrome.runtime.onInstalled.addListener(() => {
  void scheduleSync();
});

chrome.runtime.onStartup.addListener(() => {
  void scheduleSync();
});

async function scheduleSync(): Promise<void> {
  const settings = await readSettings();
  await chrome.alarms.clear(SYNC_ALARM);
  await chrome.alarms.create(SYNC_ALARM, {
    periodInMinutes: settings.syncIntervalMinutes,
    delayInMinutes: 1,
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== SYNC_ALARM) return;
  log.debug('sync alarm fired');
  // Phase 3 wires this to findYouTubeTab() + tabs.sendMessage.
});

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  if (!isTrustedSender(sender) || !isMessage(raw)) return false;
  handle(raw).then(sendResponse, (err: unknown) => {
    log.error('message handler failed', err);
    sendResponse({ ok: false });
  });
  return true; // async response
});

async function handle(message: Message): Promise<unknown> {
  switch (message.type) {
    case 'ping':
      return { ok: true };

    case 'settings:get':
      return { ok: true, settings: await readSettings() };

    case 'settings:set': {
      const next = { ...(await readSettings()), ...message.patch };
      await writeSettings(next);
      await scheduleSync();
      return { ok: true, settings: next };
    }

    default:
      // Known type, not implemented in this phase.
      return { ok: false, reason: 'not-implemented' };
  }
}

/**
 * Works with host_permissions alone — the "tabs" permission is deliberately
 * not requested (spec §7.3).
 */
export async function findYouTubeTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
  return tabs.find((tab) => typeof tab.id === 'number');
}
