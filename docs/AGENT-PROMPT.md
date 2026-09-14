# The prompt to give the agent

This file is in the repo on purpose: so the prompt does not get lost in chat history.

---

## Opening prompt (copy–paste)

```
This repo is a Chrome MV3 extension. Read these three files first, then begin:

1. CLAUDE.md          — the immutable rules and the phase protocol
2. docs/SPEC.md       — the single source of truth (architecture, requirements,
                        security rules, phases)
3. docs/adr/0001-build-toolchain.md — the build toolchain decision

Then review the existing code: read every file under src/, run
`npm ci && npm run check`, and confirm everything is green.

Phase 0 is complete. You are implementing Phase 1.

Rules:
- The 10 immutable rules in CLAUDE.md and the phase protocol apply.
- Add nothing that is not in the spec. Good ideas go in docs/BACKLOG.md.
- Do not add dependencies and do not touch the manifest permissions — both
  require asking first.
- Ask before writing code when something is unclear. Do not guess about
  YouTube's DOM structure or InnerTube field names.
- STOP once the Phase 1 acceptance criteria (spec §9) are met. Do not push.
  Write your report in the format from CLAUDE.md and ask for approval for Phase 2.

Begin.
```

---

## For subsequent phases

```
I approve the Phase <N> report and I have pushed it. Move on to Phase <N+1>.
Same protocol: meet the acceptance criteria, stop, report, ask for approval.
```

## When handing over spike results

```
Output of docs/spike/playlist-read.js:

<paste the console output here>

Based on this result, write docs/adr/0002-playlist-access.md: which path was
chosen, why the others were ruled out, and which capability layer depends on
which path. Stop after writing the ADR and ask for approval. Do not start
Phase 3 before the ADR is approved.
```

## When something goes wrong

```
Here is the behaviour I am seeing: <observation>
Here is what I expected: <expectation>

Find the root cause. Before fixing it, tell me what the cause is and which file
you are going to change. Do not propose a fix that just suppresses the symptom.
```

## When scope starts to drift

```
That is not in the spec. Add it to docs/BACKLOG.md and get back to the current phase.
```
