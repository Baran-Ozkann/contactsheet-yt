declare const __DEV__: boolean | undefined;

const prefix = '[contactsheet]';

/**
 * `__DEV__` is substituted by esbuild at build time, so it does not exist when
 * a module is loaded directly — under vitest, for instance, where a bare
 * reference throws ReferenceError and takes the caller down with it. Guarding
 * with typeof keeps the constant foldable in the bundle while making the module
 * safe to import anywhere.
 */
const isDev = typeof __DEV__ !== 'undefined' && __DEV__ === true;

/**
 * Never log video id lists or full URLs — spec §7.13.
 */
export const log = {
  debug(...args: unknown[]): void {
    if (isDev) console.debug(prefix, ...args);
  },
  warn(...args: unknown[]): void {
    console.warn(prefix, ...args);
  },
  error(...args: unknown[]): void {
    console.error(prefix, ...args);
  },
};
