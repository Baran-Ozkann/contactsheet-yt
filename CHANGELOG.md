# Changelog

This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Phase 0: project scaffold, build script, lint rules, unit test harness.
- Fixed: `build.mjs` mangled paths on Windows (now uses `fileURLToPath`).
- `npm run zip` now works on Windows too (`Compress-Archive`).
- Dev dependencies updated: vitest 5, eslint 10, esbuild 0.28. `npm audit` clean.
- ADR-0002: the playlist read path was settled by measurement. Reading `SAPISID` and the iframe approach were dropped.
