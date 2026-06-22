---
phase: 5
title: "finding-recategorization"
status: pending
priority: P1
dependencies: [phase-01-runner-script, phase-04-layer-2-prompt-teaching]
effort: "S"
---

# Phase 5: finding-recategorization

## Overview

Re-categorize `meta-260620T2108Z-the-full-pnpm-test-glob-...` from the symptom-level subtype `e2e-test-output-overflow` to the cause-level subtype `runner-interface-fragility` (R2 §Re-categorization wording). Update the `description` to capture both Layer 1 and Layer 2 fixes. Refresh the stale `evidence_code_ref` (Plan A constraint #6: `package.json:7` → `tools/scripts/run-pnpm-test-namespaced.mjs:1`).

## Why re-categorize (R2 §Re-categorization)

- `e2e-test-output-overflow` describes the *symptom* (test output overflows the agent's input contract). Cold-session agents pattern-match on the subtype when they read the finding; matching on a symptom leads them to the wrong fix shape.
- `runner-interface-fragility` describes the *cause* (the agent-runner interface is fragile). Cold-session agents can correctly identify the fix shape (per-namespace prefix + per-namespace log files + agent teaching).
- All other `loop-anti-pattern` subtypes in the registry are cause-level: `test-deadlock` (cause: deadlock), `mcp-tool-silent-persistence-fail` (cause: silent fail), `escape-hatch-abuse` (cause: bypass). `e2e-test-output-overflow` is the only symptom-level outlier.

## Why refresh `evidence_code_ref`

- The original finding's `evidence_code_ref: package.json:7` pointed at the `imports` field (line 7), not the test script. This was always fragile (R2 §Re-categorization wording).
- After the `--test-timeout=30000` was added in plan `260621-2223-GH-2246-mcp-stdio-sdk-conversion/`, the `test` script moved from line 7 to line 17. The reference drifted.
- Plan B moves the `test` script to invoke the runner at `tools/scripts/run-pnpm-test-namespaced.mjs:1`. The new `evidence_code_ref` should point at the runner script, not the `package.json:17` line.

## Requirements

- **Functional:**
  - `meta_state_patch` to update `subtype`, `description`, and `evidence_code_ref` on the finding
  - Run `meta_state_refresh_fingerprint` after the patch to record the new SHA-256
  - Verify the patch via `meta_state_list({id: 'meta-260620T2108Z-...', entry_kind: 'finding'})`
- **Non-functional:**
  - Use `meta_state_patch` with CAS via `_expected_version: 1` (current version)
  - Do not modify `created_at`, `acked_at`, or any other immutable field
  - Do not change `status` (stays `active` until Phase 6 closeout resolves it)

## Related Code Files

- **Modify:** `meta-state.jsonl:164` via `meta_state_patch` MCP tool (not direct file write)

## Implementation Steps

1. **Pre-check the subtype enum** (per Red Team C6): verify `runner-interface-fragility` is a valid subtype value before patching:
   ```bash
   grep -rn "subtype" tools/learning-loop-mcp/core/meta-state.js | head -20
   ```
   If the schema's subtype enum (if any) does NOT include `runner-interface-fragility`, file a separate `meta_state_log_change` to extend the schema FIRST, then return to this phase. (The plan's "Risk Assessment" covers only the string-length cap, not the enum constraint.)
2. **Read the current finding** to capture the exact `version`:
   ```js
   mcp__learning-loop-mastra__meta_state_list({
     id: "meta-260620T2108Z-the-full-pnpm-test-glob-11-directories-1100-tests-takes-10-m",
     entry_kind: "finding",
   })
   ```
3. **Verify the runner script exists** (per Red Team M28 + 2):
   ```bash
   test -f tools/scripts/run-pnpm-test-namespaced.mjs && echo "EXISTS" || echo "MISSING — STOP, Phase 1 has not committed"
   ```
4. **Patch the finding** with the new `subtype`, `description`, and `evidence_code_ref` (corrected tool name per Red Team C3):
   ```js
   mcp__learning-loop-mastra__meta_state_patch({
     id: "meta-260620T2108Z-the-full-pnpm-test-glob-11-directories-1100-tests-takes-10-m",
     entry_kind: "finding",
     _expected_version: <current_version>,  // CAS — must match current
     patch: {
       subtype: "runner-interface-fragility",
       description: "The `pnpm test` glob (9 namespaces, 1100+ tests, ~13s on this dev machine) was claimed to take 10 min and buffer spec-reporter output until completion. Empirically (R1): the wall-clock is ~13s; the 'silent 10 min' symptom was an agent-side `tail -60` artifact, not a runner defect. **Layer 1 (runner → agent interface) fix:** per-namespace runner script (`tools/scripts/run-pnpm-test-namespaced.mjs`) emits `[<ns>] ==> start|pass|FAIL` lines and writes per-namespace log files to `.test-logs/<ns>.log`. Drops 2 dead globs. **Layer 2 (agent itself) fix:** `pnpm-test-discipline` hint in `DISCOVERABILITY_HINTS` teaches the agent to NOT re-read files on silent commands and to stop on >5 reads/60s (see `tools/learning-loop-mcp/core/loop-introspect.js#DISCOVERABILITY_HINTS`). **Operator trade-off reinterpreted:** the 10-min slowness was the deliberate forcing function for fingerprint-drift detection; the runner preserves the *principle* (per-namespace progress visibility) without literal wall-clock. Pre-commit stays on `pnpm test`. TaskUpdate tool-level idempotency is a separate Layer 2-general fix (out of Plan B scope).",
       evidence_code_ref: "tools/scripts/run-pnpm-test-namespaced.mjs:1",
     },
   })
   ```
5. **Refresh the fingerprint** so the SHA-256 matches the new runner script (corrected tool name):
   ```js
   mcp__learning-loop-mastra__meta_state_refresh_fingerprint({
     id: "meta-260620T2108Z-the-full-pnpm-test-glob-11-directories-1100-tests-takes-10-m",
   })
   ```
6. **Verify the patch** by re-reading the finding; assert the new `subtype`, `description`, and `evidence_code_ref` are present, AND capture the new `version` for Phase 6's CAS.
7. **Run `meta_state_check_grounding`** (per Red Team H15) immediately before Phase 6's resolve, to confirm the fingerprint matches the live file:
   ```js
   mcp__learning-loop-mastra__meta_state_check_grounding({
     id: "meta-260620T2108Z-the-full-pnpm-test-glob-11-directories-1100-tests-takes-10-m",
   })
   ```
   If status is not `grounded`, STOP and re-refresh; the runner script may have been edited between Phase 5 and Phase 6.
8. **Verify the parity assertion** that no test depends on the literal string `e2e-test-output-overflow` (broadened per Red Team M24):
   ```bash
   grep -r "e2e-test-output-overflow" . --include="*.jsonl" --include="*.md" --include="*.js" 2>/dev/null
   ```
   Expected: only the meta-state.jsonl:164 line being patched (and possibly the change-log reference, if any). No test depends on the literal subtype name.

## Success Criteria

- [ ] Finding's `subtype` is `runner-interface-fragility` (not `e2e-test-output-overflow`)
- [ ] Finding's `description` reflects Layer 1 + Layer 2 + operator trade-off reinterpretation
- [ ] Finding's `evidence_code_ref` is `tools/scripts/run-pnpm-test-namespaced.mjs:1` (not `package.json:7`)
- [ ] `code_fingerprint` is refreshed to the new SHA-256
- [ ] No test depends on the literal string `e2e-test-output-overflow`
- [ ] Finding's `status` is still `active` (Phase 6 will resolve)

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| `meta_state_patch` fails on CAS mismatch (version drifted between read and write) | Low | Medium | Re-read `version` immediately before write; use the new version as `_expected_version` |
| The new `description` exceeds the zod string length cap | Low | Low | The new description is ~1.5KB; well under the 64KB cap (check schema) |
| A future grep-based tool depends on the literal subtype string | Low | Low | `grep` audit (step 5) catches it before closeout |
| The SHA-256 fingerprint refresh fails (file not found at `evidence_code_ref`) | None | None | The runner script will exist after Phase 1 commits |
| The patch touches an immutable field (e.g., `id`, `created_at`, `acked_at`) | None | None | `meta_state_patch` deny-lists identity fields; verified by the handler |
