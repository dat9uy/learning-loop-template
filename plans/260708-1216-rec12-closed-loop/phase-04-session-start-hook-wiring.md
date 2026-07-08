---
phase: 4
title: "Session-start hook wiring"
status: pending
priority: P2
dependencies: [3]
---

# Phase 4: Session-start hook wiring

## Overview

Wire `buildChangeLogGapHints` into the SessionStart hook (`session-start-inject-discoverability.cjs`) so the gap set is injected into `.claude/session-context.json` at every session start. Additive `change_log_gap_hints` key, added to BOTH the happy-path write and the fatal-catch write so the read-only exit-0 invariant and the "downstream readers never see a missing file/key" invariant both hold.

## Requirements

- Functional:
  - The hook reads `readBranchTouchedPaths(projectRoot)` (phase 2) + `readRegistry(projectRoot)` and calls `buildChangeLogGapHints(entries, touchedPaths)`; the result populates a new top-level `change_log_gap_hints` key in `.claude/session-context.json`.
  - The key is present in BOTH the happy-path write (`session-start-inject-discoverability.cjs:63-68`) AND the fatal-catch write (`:82`) — the fatal-catch shape sets `change_log_gap_hints: { gap_candidates: [], gap_protocol_prompt: "" }`.
  - The git-diff read + builder call are wrapped in their own try/catch (mirroring the `buildStaleDispatchHints` block at L38-58); on failure, fall through with the empty shape (no crash, exit 0).
  - The stderr log line (`:71`) includes the gap count.
- Non-functional: exit 0 on success AND on fatal catch (smoke test asserts `code === 0`); read-only (no `buildColdTierCache`/`writeColdTierCache`); `spawnSync` git bounded by phase 2's timeout.

## Architecture

Extend the existing hook's try/catch ladder. The hook is CJS (`.cjs`); it already `require`s ESM core modules (`buildStaleDispatchHints`, `readRegistry`, `readRuntimeStateRows`) — `core/git-diff.js` is required the same way: `const { readBranchTouchedPaths } = require("../../core/git-diff.js")`. (The existing `buildStaleDispatchHints` require proves the CJS→ESM interop works in this repo's node setup.)

New block (after the stale-dispatch block, ~L58):
```
let change_log_gap_hints = { gap_candidates: [], gap_protocol_prompt: "" };
try {
  const { buildChangeLogGapHints } = require("../../core/loop-introspect.js");
  const { readBranchTouchedPaths } = require("../../core/git-diff.js");
  const touched = readBranchTouchedPaths(projectRoot);
  change_log_gap_hints = buildChangeLogGapHints(entries, touched);
} catch (err) {
  console.error(`[session-start] buildChangeLogGapHints failed: ${err.message}`);
}
```
`entries` is already read by the stale-dispatch block (`readRegistry(projectRoot)` at L42) — reuse it; do not read the registry twice. Add `change_log_gap_hints` to the happy-path JSON (`:63-68`) and to the fatal-catch JSON (`:82`).

## Related Code Files

- Modify: `tools/learning-loop-mastra/hooks/legacy/session-start-inject-discoverability.cjs` — add the block + both write-site keys + stderr count.
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/session-start-inject-discoverability.test.cjs` — one additive smoke assertion.
- Reference: `tools/learning-loop-mastra/core/loop-introspect.js:195-261` — the builder wired in phase 3.

## Implementation Steps (TDD)

1. **Test first.** Extend `session-start-inject-discoverability.test.cjs`:
   - Existing: asserts exit 0 + `discoverability_hints` non-empty + `process_hints` ≥1 + `injected_at` string.
   - Add: `assert.ok(Array.isArray(context.change_log_gap_hints?.gap_candidates))` + `assert.ok(typeof context.change_log_gap_hints?.gap_protocol_prompt === "string")`. (Additive — does not assert absence of unknown keys; mirrors the stale-dispatch additive precedent but DOES assert the new key, per plan decision.)
   - Add a fatal-catch-shape test: stub `buildDiscoverabilityHints` to throw → assert the file still contains `change_log_gap_hints: { gap_candidates: [] }` (the fatal-catch write site carries the key).
2. **Implement** the block + both write-site keys + stderr count in the hook.
3. **Run the smoke test** (`pnpm test:cold-session` is NOT this — run the `session-start-inject-discoverability.test.cjs` namespace); confirm exit 0 + new key present.
4. **Run** `pnpm test` legacy-mcp namespace; confirm green.

## Success Criteria

- [ ] `change_log_gap_hints` present in `.claude/session-context.json` on the happy path (smoke test green).
- [ ] `change_log_gap_hints` present (empty shape) on the fatal-catch path.
- [ ] Hook exits 0 on success AND on fatal catch; read-only invariant preserved (no `buildColdTierCache`/`writeColdTierCache`).
- [ ] git-diff failure → empty `gap_candidates`, no crash (try/catch).
- [ ] stderr log line includes the gap count.
- [ ] Registry read once (reused from the stale-dispatch block, not re-read).
- [ ] `session-start-inject-discoverability.test.cjs` green; no existing suite regresses.

## Risk Assessment

Medium — session-start hot path; the load-bearing invariant is the BOTH-write-sites rule (a missing fatal-catch key would make a downstream reader see a missing key on a failure path). Mitigation: the fatal-catch-shape test in step 1 pins this; the additive smoke assertion is low-risk (no consumer asserts strict shape — researcher B confirmed only this one test reads the file). Latency: phase 2's `timeout` bounds the git cost; the whole block is in try/catch. Rollback: revert the hook diff; session-context.json loses the key with no downstream breakage (additive).