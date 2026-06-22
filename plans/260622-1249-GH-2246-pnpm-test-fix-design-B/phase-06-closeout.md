---
phase: 6
title: "closeout"
status: pending
priority: P1
dependencies: [phase-01-runner-script, phase-02-per-namespace-logs, phase-03-dead-glob-cleanup, phase-04-layer-2-prompt-teaching, phase-05-finding-recategorization]
effort: "S"
---

# Phase 6: closeout

## Overview

Run end-to-end verification, resolve the meta-state finding, write a journal entry capturing the 10-min→12.87s empirical correction, and present the final handoff to the operator.

## Requirements

- **Functional:**
  - Full `pnpm test` passes
  - `pnpm test:cold-session` passes
  - `meta_state_resolve` the finding with a resolution note pointing to this plan
  - Journal entry written to `docs/journals/` (operator-cited reflection)
- **Non-functional:**
  - All 5 prior phases are marked `completed` in `ck plan status`
  - The journal captures the operator-locked constraint reinterpretation (10-min → per-namespace progress visibility)
  - The `10-min forcing function` trade-off is documented for future cold-session agents

## Architecture

No code changes in this phase. Verification + meta-surface + journal only.

## Related Code Files

- **Create:** `docs/journals/260622-GH-2246-pnpm-test-fix-design-B-closeout.md` — journal entry
- **Modify:** `meta-state.jsonl:164` — `meta_state_resolve` the finding (closes the loop)

## Implementation Steps

0. **BLOCKER: confirm operator acceptance of the 10-min→per-namespace-progress-visibility trade-off reinterpretation** (per Red Team C5). Ask the operator: "The original locked constraint was '10-min slowness stays.' The plan reinterprets this as 'per-namespace progress visibility stays' because R1's empirical measurement showed the suite runs in 12.87s on this dev machine. Do you accept this reinterpretation?" If NO, STOP and re-design (probably needs a deliberate sleep in the runner to preserve the literal 10-min signal). If YES, continue.
1. **Run `pnpm test`** and capture the output. Expect:
   - 9 `[<ns>] ==> start` lines
   - 9 `[<ns>] ==> pass` lines (or `==> FAIL` if regression — STOP and fix)
   - 1 `[suite] ==> pass (9 globs, N tests)` at the end
   - Total wall-clock ≤ 30s (relaxed from 15s per Red Team H19)
   - `.test-logs/<ns>.log` files exist for all 9 namespaces
2. **Run `pnpm test:cold-session`** and capture the output. Expect:
   - Passes within 30s
   - Writes/updates `.cold-session-sentinel.json`
3. **Verify the Layer 2 hint is reachable** (corrected tool name per Red Team C3):
   ```js
   mcp__learning-loop-mastra__loop_get_instruction({ key: "pnpm-test-discipline" })
   ```
   Expect: the new hint text returned, with non-undefined `suggestion`.
4. **Verify the patched finding** via `mcp__learning-loop-mastra__meta_state_list` (corrected from the non-existent `meta_state_describe` per Red Team C3):
   ```js
   mcp__learning-loop-mastra__meta_state_list({
     id: "meta-260620T2108Z-the-full-pnpm-test-glob-11-directories-1100-tests-takes-10-m",
     entry_kind: "finding",
   })
   ```
   Expect: `subtype: "runner-interface-fragility"`, new `description`, new `evidence_code_ref`, new `code_fingerprint`. Capture the post-Phase-5 `version` for the resolve CAS.
5. **Resolve the finding** via `mcp__learning-loop-mastra__meta_state_resolve` (corrected tool name + corrected `resolved_by` enum + added `_expected_version` per Red Team C4 + M25):
   ```js
   mcp__learning-loop-mastra__meta_state_resolve({
     id: "meta-260620T2108Z-the-full-pnpm-test-glob-11-directories-1100-tests-takes-10-m",
     _expected_version: <post-Phase-5 version>,  // CAS
     resolution: "Plan B shipped: Layer 1 runner script (tools/scripts/run-pnpm-test-namespaced.mjs) emits per-namespace prefix + per-glob log files; 2 dead globs dropped. Layer 2 DISCOVERABILITY_HINTS entry `pnpm-test-discipline` teaches 2 stop conditions (silent-command, same-file-read). Subtype recategorized to `runner-interface-fragility` (cause-level). Empirically: the original 10-min claim was an agent-side `tail -60` artifact; the suite runs in ~13s on this dev machine. Operator trade-off reinterpretation accepted: 10-min slowness was the forcing function for fingerprint-drift detection; the runner preserves the *principle* (per-namespace progress visibility) without literal wall-clock. See plans/260622-1249-GH-2246-pnpm-test-fix-design-B/.",
     resolved_by: "operator",  // valid Zod enum: ["operator", "auto-resolve"]
   })
   ```
6. **Write the journal entry** at `docs/journals/260622-GH-2246-pnpm-test-fix-design-B-closeout.md`. Sections (free-form, not 5-section template per Red Team H14):
   - **What changed:** Plan B shipped (Layer 1 + Layer 2).
   - **Empirical correction:** the "10-min silent suite" was a `tail -60` artifact, not a runner defect. The suite runs in ~13s.
   - **Trade-off reinterpretation:** the 10-min slowness was the deliberate forcing function; the runner preserves the *principle* (per-namespace progress visibility) without literal wall-clock.
   - **What to watch:** the latent Claude Code SessionStart hint-injection gap (R2 §Concerns 2) — track via follow-up loop-design entry (not in Plan B scope).
7. ~~**Update `docs/registry-summary.md`** if the project's registry summary references the finding by old subtype.~~ **REMOVED per Red Team H13.** The file is gitignored (`.gitignore:28`); manual edit is invalid; `meta_state_sweep` regenerates it on the next run.
8. **Mark all 6 phases `completed`** in `ck plan status`.
9. **Present the final handoff** to the operator (boundary reminder):
   - Plan path: `plans/260622-1249-GH-2246-pnpm-test-fix-design-B/`
   - Finding resolved: `meta-260620T2108Z-the-full-pnpm-test-glob-...`
   - Open questions answered (or escalated if still open)
   - Next-step: `/ck:cook` to begin implementation? (Plan is ready for execution.)

## Success Criteria

- [ ] Operator has explicitly accepted the 10-min→per-namespace-progress-visibility trade-off reinterpretation (BLOCKER for this phase)
- [ ] `pnpm test` passes
- [ ] `pnpm test:cold-session` passes
- [ ] `mcp__learning-loop-mastra__meta_state_resolve` succeeds with valid `resolved_by: "operator"`; finding status flips to `resolved`
- [ ] Journal entry exists at `docs/journals/260622-GH-2246-pnpm-test-fix-design-B-closeout.md` (free-form, not 5-section template)
- [ ] All 6 phases marked `completed` in `ck plan status`
- [ ] No `meta_state_*` errors in the gate log

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| `pnpm test` fails on the new runner (regression) | Low | High | STOP and fix; re-run all 5 prior phases; the runner is small and isolated |
| `rule-no-orphaned-evidence` blocks resolve (stale fingerprint) | Low | Medium | Phase 5 step 7 added `meta_state_check_grounding` between refresh and resolve; if ungrounded, re-refresh |
| The journal entry's filename collides with an existing entry | Low | Low | Date-prefixed name (`260622-...`); `ls docs/journals/ | grep GH-2246` confirms no collision |
| The trade-off reinterpretation is operator-rejected (BLOCKER) | Low | High | Step 0 explicitly asks the operator before proceeding; if NO, the plan reverts |
| Cold-tier cache still references old subtype (`records/meta/.cache/loop-describe-cold.json:4632`) | Low | Low | The cache is gitignored and regenerates on next `loop_describe({tier: "cold"})` call; no action needed |
