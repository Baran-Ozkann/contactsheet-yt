declare const __DEV__: boolean;

const prefix = '[contactsheet]';

/**
 * Never log video id lists or full URLs — spec §7.13.
 */
export const log = {
  debug(...args: unknown[]): void {
    if (__DEV__) console.debug(prefix, ...args);
  },
  warn(...args: unknown[]): void {
    console.warn(prefix, ...args);
  },
  error(...args: unknown[]): void {
    console.error(prefix, ...args);
  },
};
