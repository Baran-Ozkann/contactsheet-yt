import { isMessage, isTrustedSender, type Message } from '../core/messaging.js';
import { readSettings, writeSettings } from '../core/settings.js';
import {
  addPlaylist,
  buildPopupState,
  isSyncing,
  removePlaylist,
  setPlaylistHidden,
  startSync,
} from './sync.js';
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
  // Fire and forget: a failed scheduled sync writes nothing and hides nothing.
  void startSync();
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

    // Entry point for a sync. Note a service worker does not receive its own
    // runtime messages: sending this from the worker's own devtools console
    // fails with "Receiving end does not exist". Send it from the popup or a
    // page context instead.
    case 'sync:start':
      return startSync(message.playlistIds);

    case 'sync:status':
      return { ok: true, syncing: isSyncing() };

    case 'popup:state':
      return { ok: true, state: await buildPopupState() };

    case 'playlists:add':
      return { ok: await addPlaylist(message.playlistId) };

    case 'playlists:remove':
      await removePlaylist(message.playlistId);
      return { ok: true };

    case 'playlists:toggle':
      await setPlaylistHidden(message.playlistId, message.hidden);
      return { ok: true };

    default:
      // Known type, not implemented in this phase.
      return { ok: false, reason: 'not-implemented' };
  }
}

