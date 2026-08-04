---
phase: 3
title: "Verify, audit, resolve source finding"
status: completed
priority: P1
effort: "~45m"
dependencies: [2]
---

# Phase 3: Verify, audit, resolve source finding

## Overview

Run the full suite to confirm no regression outside `gate-recurrence.test.js`, re-measure the SessionStart latency tripwire (Red-team Finding 11), audit runtime-agnosticism, verify the motivating episode against the live decision log (Red-team Finding 12), log the change, and resolve the source finding `meta-260804T1420Z-cross-session-slow-burn-toolchain-failures-are-mechanically` via the loop CLI with a citation to the shipped change-log.

## Requirements

- Functional: `pnpm test` (full suite) green or no new failures vs. the Channel B baseline (2882/2890; pre-existing flakes only — sync-skills EACCES in `/tmp`, transient pre-push flake).
- Functional: `recurrence-check-on-start.js` elapsed time re-measured on the largest realistic log; p50 stays under the 500ms tripwire despite the second O(n) pass.
- Functional: `entries_scanned` clarified or doubled so the tripwire's "scan cost scales with this" claim stays true (the cross-session pass roughly doubles scan work).
- Functional: `check_runtime_agnostic` clean — the change adds no new surface shim; the `gate-check-recurrence-tool.js` edit is a string update.
- Functional: the motivating episode's real decision-log entries (with their real `session_id` population) now cross the cross-session threshold — verified via a dry-run `checkAndEmit` (or `gate_check_recurrence`) against the live repo root before resolving.
- Functional: source finding resolved with a `meta_state_resolve` citation to a `meta_state_log_change` row that records the `recurrence-tracker.js` semantic change.
- Non-functional: no docs churn (internal core-logic change; the change-log covers the loop's self-model).

## Architecture

### Verify

`pnpm test` runs the prepended `seed-file-index.mjs` step before `vitest run`, so the Phase 2 edits to `recurrence-tracker.js` and `gate-check-recurrence-tool.js` are absorbed at test time. If a `file-index.jsonl` drift error appears before the full run, seed once: `node tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs`. Read the parsed summary from `.test-logs/vitest-results.json` — do not grep raw vitest stdout (rule-no-raw-stdout-vitest).

### Latency re-measure (Red-team Finding 11)

`recurrence-check-on-start.js:39` pins a p50 < 500ms budget on the ~28.4K-line cross-surface union. The cross-session pass adds a second O(n) scan. Re-measure: run the SessionStart hook wrapper against the repo root (or a synthetic ~30K-line decision log) and capture the elapsed time from stderr. If p50 exceeds 500ms, either (a) reduce the cross-session pass cost (e.g. compute the windowed set once), or (b) raise the tripwire with a documented justification. Then clarify `entries_scanned`: either double it to `2 * allEntries.length` or rename/clarify its docstring so the "scan cost scales with this" claim reflects the two passes.

### Audit

`check_runtime_agnostic` against `tools/learning-loop-mastra/core/recurrence-tracker.js` and `tools/learning-loop-mastra/tools/handlers/gate-check-recurrence-tool.js`. Expect a pass on all 6 items: core-logic extension + a tool-description string update, not a feature with a new surface shim. If the long-lived MCP server returns a stale result (the Channel B "Honest Limit" — the MCP process caches `runtime-agnostic-checklist.js` at startup), re-evaluate the same `verify` function locally against the updated source; the next session restart picks up the change. Note any stale-cache artifact honestly.

### Live-log verification (Red-team Finding 12)

Before resolving, confirm the motivating episode's real entries now group. Run a dry-run against the live repo root:
```bash
LOOP_SURFACE=.claude GATE_RECURSION_DRY_RUN=1 node tools/learning-loop-mastra/hooks/universal/recurrence-check-on-start.js < <(echo '{}')
# or: LOOP_SURFACE=.claude node tools/learning-loop-mastra/bin/loop.mjs gate_check_recurrence '{}'
```
Inspect `recurrent` for the historical `toolchain-failure` prefix(es) that motivated the finding. If the real entries lack a real-tier `session_id` (e.g. Channel C did not stamp one at the time), the gap persists for those entries and the resolution must note the residual (do NOT mark resolved if the live log shows the gap is still open for the motivating case). The synthetic tests prove the code path; the live-log check proves the historical entries are actually picked up.

### Change-log + resolve

1. `meta_state_log_change` — record the semantic change:
   - `change_dimension: "semantic"`
   - `change_target: "tools/learning-loop-mastra/core/recurrence-tracker.js"`
   - `change_diff: { added: ["cross-session slow-burn grouping pass (>=5 occurrences across >=2 distinct REAL-tier sessions in a trailing 7-day window; within-window firedKeys guard; null-rule_id guard; real-tier distinct-session requirement)"], removed: [], changed: ["findRecurrentGroups: second grouping pass keyed (rule_id, normalized_prefix) ignoring session_id; buildFinding: slow-burn description suffix"] }`
   - `reason: "Close the cross-session slow-burn gap; sub-threshold-per-session failures that accumulate across sessions are no longer mechanically invisible."`
   - Also log the `gate-check-recurrence-tool.js` description-string update (separate `change_target`).
2. `meta_state_derive_status({ id: "meta-260804T1420Z-cross-session-slow-burn-toolchain-failures-are-mechanically" })` before resolving (re-ground per derive-refresh rule).
3. `meta_state_resolve({ id: "meta-260804T1420Z-...", resolution: "Shipped in <plan-path>: added cross-session slow-burn grouping pass to findRecurrentGroups (within-window firedKeys, real-tier distinct sessions, null-rule_id guard). Closes the mechanical-invisibility gap; recurrence_key dedup is uniform across per-session and cross-session findings.", resolved_by: "operator" })` with `source_refs` citing `local:meta-state:<change-log-id>`.
4. `meta_state_refresh_file_index({ path: "tools/learning-loop-mastra/core/recurrence-tracker.js", reason: "re-ground after cross-session pass implementation" })` and likewise for `gate-check-recurrence-tool.js`.

## Related Code Files

- **Read-only:** `tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js` (regression test for the 6-item checklist — no change needed; no new surface).

## Implementation Steps

1. Run `pnpm test` (full suite). Record the pass/fail count. Triage any new failure against the Channel B baseline; do not weaken tests.
2. Re-measure `recurrence-check-on-start.js` elapsed time on the largest realistic decision log; confirm p50 < 500ms. Clarify or double `entries_scanned` in `recurrence-tracker.js`.
3. Run `check_runtime_agnostic` (MCP) against both modified files. If stale-cache, verify locally and note it.
4. Dry-run `checkAndEmit` against the live repo root; confirm the motivating episode's real entries now group (or document the residual).
5. `meta_state_log_change` the semantic change to `recurrence-tracker.js` and the description-string change to `gate-check-recurrence-tool.js`.
6. `meta_state_derive_status` the source finding, then `meta_state_resolve` it citing the change-log id.
7. `meta_state_refresh_file_index` for both cited paths.
8. Confirm the source finding is `resolved` via `meta_state_list({ id: [...] })`.

## Success Criteria

- [ ] `pnpm test` green or no new failures vs. Channel B baseline (2882/2890; pre-existing flakes only).
- [ ] `recurrence-check-on-start.js` p50 < 500ms re-measured on the largest realistic log; `entries_scanned` clarified/doubled.
- [ ] `check_runtime_agnostic` clean (local direct evaluation; note any MCP stale-cache artifact).
- [ ] Live-log dry-run confirms the motivating episode's real entries now cross the cross-session threshold (or the residual is documented and the finding is NOT marked resolved if the gap is still open for the motivating case).
- [ ] Change-log rows written; source finding `status: resolved` with a `local:meta-state:<change-log-id>` citation.
- [ ] `meta_state_refresh_file_index` re-grounds both cited paths.
- [ ] `meta_state_derive_status` on the source finding no longer reports the gap as live.

## Risk Assessment

- **Risk:** A pre-existing flake is mistaken for a regression. **Mitigation:** compare against the Channel B baseline counts; only a failure in `gate-recurrence.test.js` or a directly-imported module counts as this plan's regression.
- **Risk:** `check_runtime_agnostic` MCP returns stale "fail." **Mitigation:** re-evaluate locally; the Channel B cook report established this is a known stale-cache artifact. State it honestly.
- **Risk:** Resolving the source finding before the change actually ships (tests not green, or live-log check fails). **Mitigation:** resolve is the last step, gated on full-suite green + audit clean + live-log confirmation; the `meta_state_derive_status` re-ground is the final check. If the live-log check shows the motivating case is still open (e.g. its entries lack real-tier session_ids), do NOT resolve — report the residual and leave the finding open.
- **Risk:** The latency re-measure shows p50 > 500ms. **Mitigation:** reduce the cross-session pass cost (compute the windowed set once, avoid re-parsing `ts` per comparison) or raise the tripwire with justification.