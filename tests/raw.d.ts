/**
 * Minimal, test-only declarations.
 *
 * Vite resolves `*.css?raw` to an empty string under the node transform, which
 * would make the design-checklist assertions pass vacuously, so that suite
 * reads the file directly. @types/node is not a dependency of this project and
 * adding one needs approval (CLAUDE.md rule 3), so the one function used is
 * declared here instead.
 */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}

declare module '*?raw' {
  const content: string;
  export default content;
}
