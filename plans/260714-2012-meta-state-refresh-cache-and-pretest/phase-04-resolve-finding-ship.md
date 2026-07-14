---
phase: 4
title: "Resolve Finding + Ship"
status: completed
priority: P2
dependencies: [1, 2, 3]
---

# Phase 4: Resolve Finding + Ship

## Overview

Resolve finding `meta-260714T1704Z-the-meta-state-refresh-workflow-forces-n-trial-and-error-mcp` against the shipped plan, ship the loop-design `loop-design-meta-state-batch-refresh-and-reground-drift` as superseded by this plan's reuse-existing-primitive decision, run final verification (lint + targeted scripts + lifecycle), and write the PR body enumerating the meta-state deltas per `rule-pr-body-registry-deltas`.

## Requirements

- **Functional:** finding is closed via `meta_state_resolve` with a resolution note describing which 3 changes address which of the 4 tiers in the finding.
- **Loop-design lifecycle:** `loop-design-meta-state-batch-refresh-and-reground-drift` is flipped to inactive via `meta_state_ship_loop_design` (`shipped_in_plan = "260714-2012-meta-state-refresh-cache-and-pretest"`). This is the explicit supersession — Tier 4 is shipped as Phase 1, Tier 1 is shipped as Phase 2, and Tiers 2/3 are explicitly YAGNI per the brainstorm §"Batch MCP — pros/cons".
- **PR body:** enumerates registry deltas per `rule-pr-body-registry-deltas`.

## Architecture

Standard closeout flow:
1. `meta_state_ship_loop_design({id: "loop-design-meta-state-batch-refresh-and-reground-drift", shipped_in_plan: "260714-2012-meta-state-refresh-cache-and-pretest"})`
2. `meta_state_resolve({id: "meta-260714T1704Z-the-meta-state-refresh-workflow-forces-n-trial-and-error-mcp", resolution: "<3-tier resume note>", resolved_by: "operator"})`
3. Build PR body; commit on a branch; push; open PR with the body file.

## Related Code Files

- (No code edits in this phase — verification + meta-state calls + git/PR only.)
- Create (PR body): `plans/260714-2012-meta-state-refresh-cache-and-pretest/reports/pr-body.md`

## Implementation Steps

1. **Final verification sweep.** Run, in order:
   - `pnpm test` — expect green, idempotent seed log.
   - `pnpm exec vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/loop-describe-cold-cache.test.js` — expect 7/7 tests (6 existing + 1 new file-index SHA invalidation).
   - `pnpm exec vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js` — expect green (no-regression check).
   - `pnpm exec vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs` — expect green (drift-prevention parity test + new HINT_KEY_MAP_PROCESS sibling test).
   - `pnpm exec vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-fallow-brief.test.js` — expect green (length-9 assertion updated).
   - `pnpm test:cold-session` — expect green (no seed step).
   - `pnpm test:debug` — expect green (no drift dependency).
   - `pnpm check:freshness` — expect green (sentinel-based, untouched).
2. **Pre-check meta-state status** (Red Team F13 — `meta_state_resolve` is NOT idempotent; resolves on already-terminal entries error). Use the MCP tools, NOT direct file writes (the inbound gate blocks direct registry writes):
   ```
   meta_state_list({id: ["meta-260714T1704Z-the-meta-state-refresh-workflow-forces-n-trial-and-error-mcp", "loop-design-meta-state-batch-refresh-and-reground-drift"]})
   ```
   Expect: finding status `open` (proceed to resolve) or `resolved` (already done by a prior session — skip); loop-design status `active` (proceed to ship) or `inactive` with `shipped_in_plan` set (already shipped — skip). Idempotency noted in tool docstrings: `meta_state_ship_loop_design` re-shipping returns `already_shipped`; `meta_state_resolve` re-resolving returns an error.
3. **Issue the meta-state calls** (only after step 2 confirms preconditions):
   ```
   meta_state_ship_loop_design({id: "loop-design-meta-state-batch-refresh-and-reground-drift", shipped_in_plan: "260714-2012-meta-state-refresh-cache-and-pretest"})
   meta_state_resolve({id: "meta-260714T1704Z-the-meta-state-refresh-workflow-forces-n-trial-and-error-mcp", resolution: "Closed by plan 260714-2012: Tier 4 (cold-tier cache-key fix on file-index.jsonl SHA) shipped in phase 1; Tier 1 (pretest seed via reuse of committed seed-file-index.mjs) shipped in phase 2; PROCESS_HINTS row + 4-file mirror (incl. HINT_KEY_MAP_PROCESS) closed the agent-discoverability gap in phase 3. Tiers 2/3 (batch MCP tools) YAGNI per brainstorm §Batch MCP: pretest seed eliminates the operator mid-session pain those tools were scoped to address. meta_state_refresh_file_index keeps per-path audit semantics for deliberate individual regrounding."})
   ```
4. **Verify the registry landed.** Use `meta_state_list({id: ["meta-260714T1704Z-…"]})` and `meta_state_list({id: ["loop-design-meta-state-batch-refresh-and-reground-drift"]})` to confirm the resolve and ship calls landed. Expect: finding status `resolved`, loop-design status `inactive` with `shipped_in_plan` stamped.
4. **Build the PR body.** Per `rule-pr-body-registry-deltas`, write `plans/260714-2012-meta-state-refresh-cache-and-pretest/reports/pr-body.md` enumerating:
   - **Resolved:** `meta-260714T1704Z-the-meta-state-refresh-workflow-forces-n-trial-and-error-mcp` — closed (3-tier reuse-of-existing-primitive decision).
   - **Shipped loop-design:** `loop-design-meta-state-batch-refresh-and-reground-drift` → inactive, `shipped_in_plan: "260714-2012-meta-state-refresh-cache-and-pretest"`.
   - **Code delta:** 6 files modified — `tools/learning-loop-mastra/core/loop-introspect-cache.js` (cache key + atomic paired SHAs), `package.json` (test script), `tools/learning-loop-mastra/core/loop-introspect.js#PROCESS_HINTS` (row append), `.factory/hooks/loop-surface-inject.cjs#LOCAL_PROCESS_HINTS` (mirror), `tools/learning-loop-mastra/tools/handlers/loop-get-instruction-tool.js` (`HINT_KEY_MAP_PROCESS` + `HINT_SUGGESTIONS_PROCESS`), `tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs` (`SKIP_PRESEED=1` escape hatch). 2 test files modified — `loop-describe-cold-cache.test.js` (new describe block + 1 test), `cold-session-discoverability.test.cjs` (new sibling test for `HINT_KEY_MAP_PROCESS` coverage), `gate-logic-consult-checklist-fallow-brief.test.js` (length assertion 8 → 9).
   - **No new entries, no promotions, no archivings beyond the resolve+ship above.**
5. **Commit + PR.** Use conventional commits (no AI ref). Suggested commit subject: `fix(meta-state): invalidates cold-tier cache on file-index drift; pretest seeds file-index` (or split into two commits if the project convention prefers finer granularity — confirm via `git log --oneline -20` before deciding).
6. **Pass the agent-browser / verify gate if available.** Per project CLAUDE.md and the runtime contract, the loop's preferred verification path for non-test changes is `verify` skill. For this fix, the targeted vitest runs in step 1 are sufficient verification — no UI/CLI smoke required (no product-surface change).

## Success Criteria

- [ ] All 7 verification commands in step 1 are green.
- [ ] `meta_state_ship_loop_design` and `meta_state_resolve` calls succeeded; `meta_state_list` confirms status flips.
- [ ] PR body file exists at `plans/260714-2012-meta-state-refresh-cache-and-pretest/reports/pr-body.md`.
- [ ] PR is opened against `main`, branch name matches `260714-2012-meta-state-refresh-cache-and-pretest` (or operator-supplied override), no AI references in body or commit messages.

## Risk Assessment

- **`meta_state_ship_loop_design` vs `meta_state_resolve` retry semantics (Red Team F13).** `meta_state_ship_loop_design` is documented idempotent — re-shipping returns `already_shipped`, no-op. `meta_state_resolve` is NOT idempotent in the terminal-retry direction — calling it on an already-`resolved` entry errors (the patch in `meta-state-resolve-tool.js:148-186` is an unconditional `status: "resolved"` write with no early-return guard). Mitigation: step 2 pre-checks `meta_state_list` to confirm preconditions; skip if already-done.
- **Resolve cascade.** The finding has no `reopens` field (verified during Phase 1 codebase analysis), so no cascade-resolve path triggers. Single-step resolve is safe.
- **PR-body advisory CI.** Per the existing PROCESS_HINTS row for "PR-body registry deltas", the CI workflow `meta-state-pr-body-advisory.yml` surfaces the deltas in the Checks tab. If the workflow is missing or deleted, the body still serves the operator-review purpose; no functional blocker.
- **Operator-only meta-state write.** All meta-state calls in this phase are operator-gated (resolve, ship). If `LOOP_SESSION_MODE !== "live"`, the calls error with a gate message — defer to operator or hand them the specific call invocations.
- **Pre-commit dependency on test script.** Since Phase 2 wires `seed-file-index.mjs` into the pre-commit chain via `pnpm test`, any commit before this phase lands may already trigger the pretest seed. Confirm the seed script's `SKIP_PRESEED` env-var works locally before committing; if the pre-commit hook trips on a missing-file drift in a developer environment, `SKIP_PRESEED=1 pnpm test` is the per-commit bypass.
