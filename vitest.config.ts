import { defineConfig } from 'vitest/config';

/**
 * Most tests are pure and run in node. Only the DOM suites pay for a jsdom
 * document, so they are matched by filename rather than switching the whole
 * run over (spec §8).
 */
export default defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [['tests/unit/dom-*.test.ts', 'jsdom']],
  },
});
