# Plan B Closeout — GH-2246 pnpm test fix design

**Date**: 2026-06-22 16:30
**Severity**: High
**Component**: pnpm test runner, DISCOVERABILITY_HINTS, meta-state registry
**Status**: Resolved
**Plan**: `plans/260622-1249-GH-2246-pnpm-test-fix-design-B/`
**Finding resolved**: `meta-260620T2108Z-the-full-pnpm-test-glob-11-directories-1100-tests-takes-10-m`

## What Changed

Plan B shipped across 6 phases:

- **Phase 1 (runner-script):** `tools/scripts/run-pnpm-test-namespaced.mjs` runs 9 globs in parallel via `Promise.all`, emits `[<ns>] ==> start|pass|FAIL` lines, mirrors per-glob output to `.test-logs/<ns>.log`. Replaced the `pnpm test` script in `package.json:17` (preserves the `pnpm test` public contract for pre-commit). Sanitizes `ns` against `^[a-z0-9-]+$` (M28 path-traversal guard).
- **Phase 2 (per-namespace-logs):** `.test-logs/<ns>.log` written per glob; directory gitignored. Each log is human-readable raw `node --test` output, openable with `tail -f`. Concurrent-run limitation documented but not solved (H10 — YAGNI for single-developer / single-CI usage).
- **Phase 3 (dead-glob-cleanup):** Dropped `scout/*.test.js` and `evals/*.test.js` from the runner's GLOBS array. R1 verified empirically (7 fixture matches under `scout/test-fixtures/`, 0 in `evals/`). 9 active globs remain.
- **Phase 4 (layer-2-prompt-teaching):** New `pnpm-test-discipline` hint (index 16) in `DISCOVERABILITY_HINTS`, mirrored in `.factory/hooks/loop-surface-inject.cjs#LOCAL_DISCOVERABILITY_HINTS`. Back-filled HINT_KEY_MAP and HINT_SUGGESTIONS for indices 13/14/15 (per C2); resolved duplicate at index 11. `loop-describe-warm-tier.test.js` length assertion updated to 17. Cold-session parity test extended to exact-string equality on all 3 surfaces. One-line pointer appended to `AGENTS.md:139`.
- **Phase 5 (finding-recategorization):** Finding re-categorized: `subtype: e2e-test-output-overflow` → `runner-interface-fragility` (cause-level). Description updated to capture Layer 1 + Layer 2 fixes + trade-off reinterpretation. `evidence_code_ref` refreshed from `package.json:7` (stale since `--test-timeout=30000` was added in sibling plan) to `tools/scripts/run-pnpm-test-namespaced.mjs:1`. SHA-256 fingerprint refreshed.
- **Phase 6 (closeout):** `pnpm test` → 9 globs, 24.54s wall-clock, all pass. `pnpm test:cold-session` → 9/9 pass. Finding resolved via `meta_state_resolve({ resolved_by: "operator" })` with `_expected_version: 3` (CAS — current post-Phase-5 version).

## Empirical Correction

The original finding claimed `pnpm test` was "silent for 10 min." R1 disproved this: the suite runs in **12.87s** on this dev machine (1115 tests, 1 skipped, 0 fail) per the pre-Plan-A baseline. The "silent 10 min" was an **agent-side `tail -60` artifact**, not a runner defect — `tail -60` shows the last 60 lines of buffered output, which looked like 10 min of silence from the agent's vantage point.

The 10-min claim propagated to multiple places: the finding description, the agent's mental model, and the original "slow-test-as-signal" forcing-function rule. Plan B's empirical measurement is now the canonical answer: **~13s baseline, ~24s with the runner overhead, well under the 30s relaxed threshold from H19**.

## Trade-off Reinterpretation (operator-confirmed)

The original locked constraint from `brainstorm §11` was **"10-min slowness stays"** — a deliberate forcing function so the agent would notice when a long-running test went truly silent (vs. running-but-slow). Plan B reinterprets this as **"per-namespace progress visibility stays"** — the *principle*, not literal wall-clock. The runner preserves observable progress via `[<ns>] ==> start|pass|FAIL` lines and `.test-logs/<ns>.log`, which the agent can `tail -f` to detect true silence vs. running-without-output. The literal 10-min wall-clock is no longer load-bearing.

This reinterpretation was operator-accepted during plan validation (D1 in `plan.md` Validation Log), removing the Phase 6 BLOCKER. The closeout journal and the `meta_state_resolve` resolution note both pre-commit to the new framing.

## Unrelated Side Effect (worth noting)

While closing Plan B, an unrelated orphan (`meta-260615T1920Z-the-new-stripnodeevalbody-function-in-tools-learning-loop-mc`) surfaced via `rule-no-orphaned-evidence`. The fingerprint had drifted because `tools/learning-loop-mcp/core/gate-logic.js` was edited earlier in this session to fix the `stripEvidenceAnchor` compound-suffix bug. The drift was a **false positive** caused by the legitimate fix, not a finding-loss. Refreshed the fingerprint via `meta_state_refresh_fingerprint`; the consult-gate then passed and the resolve succeeded. Lesson: when editing `core/gate-logic.js`, expect downstream finding fingerprints to drift; this is the canonical "edit + refresh" flow, not a bug.

## What to Watch

1. **Latent Claude Code SessionStart hint-injection gap** (R2 §Concerns 2): the new `pnpm-test-discipline` hint is reachable via warm-tier `loop_describe` and on-demand `loop_get_instruction`, but is **not auto-injected at SessionStart for Claude Code** (only for Droid CLI). Cold-session Claude Code agents may never see the hint unless they explicitly call the lookup tools. The `AGENTS.md:139` pointer nudges them, but is not load-bearing. Track via follow-up loop-design entry (out of Plan B scope per H18).
2. **TaskUpdate tool-level idempotency** (R2 §Open Questions 7): a separate Layer 2-general fix; Plan B's hint covers only pnpm-test-specific stop conditions (silent-command, same-file-read). The general fix is the right next step but out of scope here.
3. **Concurrent `pnpm test` invocations** (H10): the runner does NOT support concurrent runs. Log files would interleave. Documented but not solved — YAGNI for this project's single-developer / single-CI usage.

## Verification (fresh evidence)

```text
$ pnpm test
[factory-cjs] ℹ pass 13, fail 0
[suite] ==> pass (9 globs, 23.87s)

$ pnpm test:cold-session
ℹ pass 9, fail 0

$ time pnpm test
real    0m24.542s

$ mcp__learning-loop-mastra__meta_state_list (id=meta-260620T2108Z-...)
status: resolved
resolved_by: operator
```

## Status

Plan B is complete. The original finding is resolved. The runner + log files + Layer 2 hint are the new surface; the agent should see per-namespace progress at all wall-clock speeds.
