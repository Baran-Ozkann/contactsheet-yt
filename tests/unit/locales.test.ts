import { describe, expect, it } from 'vitest';
import en from '../../_locales/en/messages.json';
import tr from '../../_locales/tr/messages.json';

/**
 * The popup reads every string through chrome.i18n (spec §10 rule 13), so a key
 * present in one catalogue but not the other silently renders as the raw key
 * for those users. Cheaper to catch here than in review.
 */

interface Message {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

const CATALOGUES: Record<string, Record<string, Message>> = {
  en: en as Record<string, Message>,
  tr: tr as Record<string, Message>,
};

const LOCALES = Object.keys(CATALOGUES);

describe('message catalogues', () => {
  it('define exactly the same keys', () => {
    expect(Object.keys(CATALOGUES.tr ?? {}).sort()).toEqual(Object.keys(CATALOGUES.en ?? {}).sort());
  });

  it.each(LOCALES)('%s has a non-empty message for every key', (locale) => {
    for (const [key, entry] of Object.entries(CATALOGUES[locale] ?? {})) {
      expect(typeof entry.message, key).toBe('string');
      expect(entry.message.trim().length, key).toBeGreaterThan(0);
    }
  });

  it.each(LOCALES)('%s declares every placeholder it interpolates', (locale) => {
    for (const [key, entry] of Object.entries(CATALOGUES[locale] ?? {})) {
      const used = [...entry.message.matchAll(/\$([A-Za-z0-9_]+)\$/g)].map((m) =>
        (m[1] ?? '').toLowerCase(),
      );
      const declared = Object.keys(entry.placeholders ?? {}).map((name) => name.toLowerCase());
      for (const name of used) expect(declared, `${key} -> $${name}$`).toContain(name);
    }
  });

  it('agrees across locales on which keys take substitutions', () => {
    for (const key of Object.keys(CATALOGUES.en ?? {})) {
      const enCount = Object.keys(CATALOGUES.en?.[key]?.placeholders ?? {}).length;
      const trCount = Object.keys(CATALOGUES.tr?.[key]?.placeholders ?? {}).length;
      expect(trCount, key).toBe(enCount);
    }
  });
});
