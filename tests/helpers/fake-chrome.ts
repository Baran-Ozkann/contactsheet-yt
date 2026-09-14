import { vi } from 'vitest';

/**
 * Just enough of chrome.storage.local to exercise the stores. Mirrors the real
 * API's shapes: get(null) returns everything, get(string) and get(string[])
 * return only the keys that exist, and a missing key is simply absent.
 */
export interface FakeStorage {
  data: Record<string, unknown>;
  /** Set to make every call reject, for the fail-open paths. */
  failing: boolean;
  /** Tabs chrome.tabs.query will report. */
  tabs: { id?: number; url?: string }[];
  /** Replies chrome.tabs.sendMessage gives; throws when null. */
  tabResponse: unknown;
  /** Messages sent to tabs, in order. */
  sentToTabs: { tabId: number; message: unknown }[];
}

export function installFakeChrome(): FakeStorage {
  const state: FakeStorage = {
    data: {},
    failing: false,
    tabs: [],
    tabResponse: null,
    sentToTabs: [],
  };

  const guard = async (): Promise<void> => {
    if (state.failing) throw new Error('storage unavailable');
  };

  const local = {
    async get(keys?: string | string[] | null): Promise<Record<string, unknown>> {
      await guard();
      if (keys === null || keys === undefined) return { ...state.data };
      const wanted = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const key of wanted) {
        if (Object.prototype.hasOwnProperty.call(state.data, key)) out[key] = state.data[key];
      }
      return out;
    },
    async set(items: Record<string, unknown>): Promise<void> {
      await guard();
      Object.assign(state.data, items);
    },
    async remove(keys: string | string[]): Promise<void> {
      await guard();
      for (const key of Array.isArray(keys) ? keys : [keys]) delete state.data[key];
    },
  };

  const tabs = {
    async query(): Promise<{ id?: number; url?: string }[]> {
      return state.tabs;
    },
    async sendMessage(tabId: number, message: unknown): Promise<unknown> {
      state.sentToTabs.push({ tabId, message });
      if (state.tabResponse === null) throw new Error('no receiving end');
      return state.tabResponse;
    },
  };

  vi.stubGlobal('chrome', {
    runtime: { id: 'test-extension-id' },
    storage: { local },
    tabs,
  });

  return state;
}
