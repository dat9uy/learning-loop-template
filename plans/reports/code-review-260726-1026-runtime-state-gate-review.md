# Code Review: runtime-state write-gate preflight delegation (4 commits, 9c7c65a..8745ec6)

**Verdict: REQUEST CHANGES — 1 Critical (verified gate bypass), 2 Important, 2 Minor.**

Stage 1 spec compliance: PASS (all plan success criteria met; full suite 2542 passed / 1 skipped; `gate:self-verify` exit 0). Critical finding below survives despite green tests — it is a test-gap bug.

## Critical

### C1. Compound-command bypass of the records/** bash hard-block
`tools/learning-loop-mastra/core/evaluate-bash-gate.js:117-133`

The new `if (commandWritesToRuntimeState) {…} else if (commandWritesToRecords) {…}` chain means that when a command matches the runtime-state patterns, the records check is never evaluated. With an active `.loop-preflight-runtime-state` marker, a compound command bypasses the records/** hard block:

```
echo ok > runtime-state.jsonl && echo evil > records/meta/pwn.json   →  {"decision":"ok"}
```

Verified empirically against the shipped code (temp root + fresh marker). Pre-change this was a hard block (runtime-state patterns were part of the records union). The marker authorizes row maintenance on runtime-state.jsonl — it must not silently extend to records/**, meta-state.jsonl, or runtime-tracking.json reached via `&&`/`;` chaining. The inline comment "Other path-write checks below still run" is false — they are inside the `else if`.

Fix: make the records check independent of the runtime-state branch — split records-specific patterns out of the shared union (or evaluate both checks non-exclusively) so a compound command can produce a records block regardless of the runtime-state exemption. Add a compound-command regression test; the current "no exemption bleed" tests only exercise single-target commands, which is exactly why this slipped through.

## Important

### I1. Marker blast-radius widened by coupling (design trade-off — flag, don't revert)
`runtime_state_record` requires the `.loop-preflight-runtime-state` marker for routine appends. That same marker now also unlocks direct Write/Edit/bash writes to runtime-state.jsonl for 30 min — so normal loop operation keeps the direct-write gate warm most of the time (and, via C1, records/** as well). Marker reuse was an explicit plan decision ("Key enabling fact"), so per verified-decision rule this is not a defect to reverse — but the authorization-scope widening deserves a recorded trade-off. Follow-up candidate: a distinct edit marker (e.g. `.loop-preflight-runtime-state-edit`) so routine appends don't hold the direct-write gate open.

### I2. Test isolation: handler test writes a real gate log
`runtime-state-write-gate.test.js` isolates the marker via `GATE_COORD_DIR` (good), but `gateMarkPreflightTool.handler` also calls `appendGateLog(resolveRoot(), …)` against the real repo root. Test runs append entries to the live gate log. Low harm, but tests should not mutate operator state.

## Minor

- **M1.** New test file `runtime-state-write-gate.test.js` lacks a trailing newline.
- **M2.** Smoke test in `bound-artifacts.test.js` asserts `surface === "runtime-state" || decision === "ok"` against `process.cwd()` — tautological (passes in both marker states). Acceptable as a documented smoke test, but it can never fail.

## What was done well

- Faithful mirror of the established schemas pattern; rule order and pinned-order tests updated correctly.
- Block reasons now name the canonical workflow on both gates; stale/missing/malformed markers correctly count as absent (TTL verified: stale marker → block).
- No MCP-surface changes; both transports inherit via shared core, as planned.
- Single-target exemption-bleed tests for records/meta-state/runtime-tracking are the right idea — just incomplete (see C1).

## Verification evidence

- `pnpm vitest run` (4 touched test files): 81/81 pass.
- `pnpm test`: 279 files, 2542 passed / 1 skipped, exit 0.
- `pnpm gate:self-verify`: exit 0.
- Bypass probe (C1): compound command + fresh marker → `{"decision":"ok"}`; single records write + marker → block; stale marker + runtime-state write → block.

## Unresolved questions

- Should the C1 fix ship in this branch (recommended — it is a regression introduced here) or as a follow-up finding?
