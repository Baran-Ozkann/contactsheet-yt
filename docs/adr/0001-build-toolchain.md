# ADR 0001 — esbuild + TypeScript as the build toolchain

- Status: accepted
- Date: 2026-09-08

## Context

An MV3 extension has three separate entry points, and their module formats differ:
the service worker may be an ES module, the content script **may not** (MV3 content
scripts are loaded as classic scripts), and the popup script has to be classic too.
Most Vite-based extension templates paper over this difference with a plugin (crxjs).

## Options

1. **Vite + @crxjs/vite-plugin** — ready-made, but its behaviour is hidden, it is
   sensitive to version churn, and it adds one more dependency.
2. **Plain Vite** — the multi-entry rollup configuration still has to be tuned by
   hand because of the content script format; little is gained.
3. **esbuild + a ~90-line `build.mjs`** — three separate bundle calls, a static file
   copy, and a size check. All of it readable.

## Decision

Option 3. The reasoning: for an extension that asks the user for access to their
YouTube session, having a build step that can be read end to end in one sitting is
part of the security claim. It is also consistent with the zero-runtime-dependency
goal (NFR-05).

## Consequences

The reference to "Vite" in spec §2.4 was updated to esbuild. There is no HMR; the
development loop is `npm run build` plus reloading the extension. That is acceptable,
because the real test surface is the live YouTube page anyway.
