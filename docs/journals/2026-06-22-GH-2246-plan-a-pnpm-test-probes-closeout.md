# Plan A Closeout — GH-2246 pnpm test probes data-gathering

**Date**: 2026-06-22 00:44
**Severity**: Medium
**Component**: pnpm test runner, meta-state registry, Mastra/Claude Code runtime parity
**Status**: Resolved

## What Happened

Closed Plan A (GH-2246 pnpm test probes data-gathering) with three concrete answers that constrain Plan B's design space. The probes were read-only: no code changes, no meta-state mutations, pure source inspection across 8+ files and 4 namespaces.

**Probe 1 (Runtime Parity):** The Mastra Agent never invokes `pnpm test`. Only Claude Code's native `Bash` tool does. Evidence: `agent-manifest.json:5-31` has no shell tool; `server.js` has no `child_process`; `.claude/settings.local.json:6` allowlists `Bash(pnpm test *)`.

**Probe 4 (Consumers):** Every executable `pnpm test` consumer is exit-code-only. No output parser exists. The `[ns] ==> start/pass/FAIL` prefix is safe. Evidence: `package.json:36` (pre-commit), `meta-state-derive-status-tool.js:23`, `meta-state-check-grounding-tool.js:22-27`, `verification-runner.js:48`.

**Probe 7 (Fingerprint drift):** Drift detection needs only one test file (`cold-tier-regression.test.js`) plus a populated `meta-state.jsonl`. The 10-minute full E2E is not a hard dependency. Evidence: `meta-state.jsonl:165`, `cold-tier-regression.test.js:66-118`, `check-grounding.js:67-74`.

## The Brutal Truth

This was the rare investigation that went better than expected. Three probes, three clean answers, no surprises. The real frustration is realizing how much of the operator's "slow test is the signal" claim was cargo-culted — the 10-minute suite is just the current way to populate `meta-state.jsonl`, not an intrinsic requirement of the drift mechanism. We could have split the suite weeks ago if someone had traced the dependency chain. The cross-link to the brainstorm report (`plans/reports/brainstorm-260621-1355-GH-2246-pnpm-test-glob-problem-report.md` §12) is there so the next person doesn't re-derive this.

## Technical Details

- Deliverable: `plans/260622-0044-GH-2246-pnpm-test-probes-A/pnpm-test-probes-data-gathering-report.md` (103 lines)
- Commit: `ec6f2b59d2daae792a2954f5155a218cad7a8952` on branch `260619-2246-phase-d-plan-2-storage`
- 3 probes closed; 0 open questions remain
- Class B consumers (output parsers): 0 found across the entire codebase
- Stale `evidence_code_ref` identified: `meta-260620T2108Z-the-full-pnpm-test-glob-...` drifted from `package.json:7` to `:17` when `--test-timeout=30000` was added

## What We Tried

- Source-scoped inspection across `tools/learning-loop-mastra/`, `tools/learning-loop-mcp/`, `.claude/`, and root `package.json`
- Classified consumers into A (exit-code-only executable), B (output parsed), C (documentation), D (script/config), E (fixture/comment)
- Traced `checkGrounding()` call chain from test file through to SHA-256 hash computation to confirm no test-runner dependency

## Root Cause Analysis

Not a failure — a boundary-clarification exercise. The near-mistake would have been designing a Mastra-facing stdout signal without first proving Mastra ever sees stdout. Probe 1 killed that path before it wasted implementation time. The operator's framing of "slow test is the signal" conflated two things: (1) the drift-detection mechanism, and (2) the side effect of running the full suite. Probe 7 separated them.

## Lessons Learned

- **Prove the invocation path before designing the signal.** If we had assumed Mastra sees `pnpm test` stdout, Plan B would have shipped a useless feature.
- **Trace dependency chains to the leaf.** "The full suite is required" is a claim that should be verified by reading the test file, not accepted from memory.
- **Prefix safety is a structural property, not a hope.** Having zero Class B consumers is a stronger guarantee than "probably fine." Document the classification so future consumers can be audited.
- **Stale `evidence_code_ref` is a silent liability.** The `package.json:7` → `:17` drift happened because the test script changed and the finding was not refreshed. Plan B must include a refresh step.

## Next Steps

- **Plan B (fix design + implementation):** Use the 6 constraints listed in the report. Layer 1 stdout signal is Claude Code only; Mastra visibility goes through `meta_state_*` / `runtime_state_*` sidecars; prefix lines are safe; drift detection can run in isolation; `meta-state.jsonl` population is the real dependency; stale `evidence_code_ref` needs refresh.
- **Stale ref refresh:** Call `meta_state_refresh_fingerprint` or `meta_state_patch` on `meta-260620T2108Z-the-full-pnpm-test-glob-...` as part of Plan B closeout.
- **Suite split feasibility:** If Plan B splits the suite per-namespace, identify which tests/write paths populate `meta-state.jsonl` and run them first (or treat the file as a fixture).
