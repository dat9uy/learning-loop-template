# SP2 Gap-Closure Cook Journal

**Date:** 2026-06-03
**Mode:** `/ck:cook --tdd plans/260603-sp2-discoverability-and-manifest-backfill/`
**Plan:** `plans/260603-sp2-discoverability-and-manifest-backfill/plan.md` (2 phases, 1 new test, target total 557)
**Brainstorm:** `plans/reports/brainstorm-260603-sp2-discoverability-and-manifest-backfill.md` (status: locked)
**Verification (SP2):** `plans/reports/verification-260603-sp2-design.md` (I-12 + I-13 mitigations)
**Cooked follow-up plan:** the SP2 verification report flagged 2 deferrals. This cook closes them in a single session.

## What This Session Did

Cooked the 2 deferred patches from SP2: a discoverability test that locks the manifest-registration contract for future SPs, and a backfill of 3 missing `meta_state` tool names in `agent-manifest.json`. Then ran the 2 SP1 post-cook follow-ups that the SP1 journal listed as "Next Steps" (operational first use of `meta_state_derive_status` + a self-modification change-log entry for SP1).

The session executed the locked design via TDD, preserving all 556 pre-existing tests, and shipped **1 new test** (matching the 1-test plan target). Final total: **557 tests pass, 0 fail**. The session also produced 1 new `meta-state.jsonl` change-log entry (the 20th line, mirroring SP0's self-log pattern at line 18).

### Steps taken

1. **Inbound state gate verification.** No new operator state-change messages. SP2's cook is the most recent; its observations are still relevant (this plan closes 2 SP2 deferrals).

2. **Cross-plan scan.** SP0 (`260602-sp0-log-change`) and SP1 (`260602-sp1-derive-status`) and SP2 (`260602-sp2-check-grounding`) are all `completed`. This plan closes 2 SP2 deferrals (I-12 + I-13 from the SP2 verification report) and 2 SP1 post-cook follow-ups (derive_status first use + change-log entry).

3. **Plan load + approval.** Loaded the plan + 2 phase files (35KB total). The locked design is unambiguous: 1 new test in the existing `__tests__/loop-describe.test.js`, 3 added lines to `agent-manifest.json` `meta_state.tools` array, 1 `derive_status` call, 1 `log_change` call, 1 journal entry. No clarifying questions needed.

4. **Phase 0 (TDD: discoverability test + manifest backfill).** Wrote the new test first (RED step):
   - Test name: `SP2: warm tier surfaces check_grounding + refresh_fingerprint`
   - Placement: inside the existing `describe("loop_describe new behavior")` block, right after the warm-tier test
   - Assertion: `names.includes("meta_state_check_grounding")` and `names.includes("meta_state_refresh_fingerprint")` — assertion by name (not count) per the locked design
   - Reuses the existing `tempDir = mkdtempSync(...)` + `process.env.GATE_ROOT = tempDir` pattern (declared in the `describe` block's outer scope, restored in the `finally` block)

   Confirmed the test passes on first run (the flat `manifest.json` is already correct — the test locks the contract for future regressions, not for the current state). This is the documented TDD intent per the plan.

   Then patched `tools/learning-loop-mcp/agent-manifest.json`:
   - Located the `meta_state` group (was 7 entries)
   - Inserted 3 lines between `"meta_state_promote_rule"` and `"meta_state_check_grounding"` in the chronological order: `sweep`, `log_change`, `derive_status`
   - Reformatted the array to one-entry-per-line for readability
   - Final array: 10 entries in the order: `report, list, ack, resolve, promote_rule, sweep, log_change, derive_status, check_grounding, refresh_fingerprint`

   Verified JSON syntax with `node -e "JSON.parse(require('fs').readFileSync('.../agent-manifest.json'))"`. Result: `JSON_VALID`.

5. **Phase 0 verification.** Ran the loop-describe test file alone: 22 tests pass, 0 fail. Ran the full test suite: 557 tests pass, 0 fail. Manual verification via direct handler invocation confirmed all 10 `meta_state_*` tool names appear in `loop_describe({ tier: "warm" }).tools` in the expected order. Validators pass: `pnpm validate:records` (183 records) + `pnpm validate:plan-loop` (74 plans, 0 violations).

6. **Phase 1 (TDD: operational first use + SP1 self-log).** Phase 1 has no new tests — it is operational first use of existing tools, validated by inspecting the gate log and `meta-state.jsonl`.

   **Step 1.1: `meta_state_derive_status` on the SP1-flagged stale `reported` finding.**
   - Target: `meta-260601T1353Z-bash-gate-constraint-matcher-does-not-distinguish-heredoc-co` (the only entry from the SP1 journal's "4 stale `reported` findings" set that is still in `reported` status as of 2026-06-03).
   - Tool call (no temp dir — this is the actual production first use, not a test): `meta_state_derive_status({ id: "..." })`.
   - Result:
     ```json
     {
       "id": "meta-260601T1353Z-bash-gate-constraint-matcher-does-not-distinguish-heredoc-co",
       "raw_status": "reported",
       "derived_status": "resolved-by-mechanism",
       "derivation": {
         "kind": "mechanism-shipped",
         "signals": {
           "code_ref_exists": true,
           "code_ref_path": "tools/learning-loop-mcp/hooks/bash-gate.js",
           "test_passed": null
         },
         "checked_at": "2026-06-03T08:48:52.062Z",
         "duration_ms": 1
       },
       "drift": true,
       "recommendation": "resolve"
     }
     ```
   - Matches the locked design's expected output exactly. Confirms: (a) the legacy `evidence.code_ref` fallback works (C-1 mitigation end-to-end on a real production entry), (b) the file-existence check is functional, (c) the drift detection logic is correct (`raw_status: reported` + `derived_status: resolved-by-mechanism` → `drift: true`), (d) the recommendation is meaningful.
   - Operational decision (out of scope for this phase): the recommendation is `resolve` — the agent can use this in a future `meta_state_resolve` call (separate plan).

   **Step 1.2: `meta_state_log_change` for SP1 self-modification.**
   - Tool call (mirroring SP0's self-log pattern at `meta-260602T1705Z-tools-learning-loop-mcp-tools-meta-state-log-change-tool-js`):
     ```json
     {
       "change_dimension": "surface",
       "change_target": "tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js",
       "change_diff": { "added": ["meta_state_derive_status"], "removed": [], "changed": [] },
       "reason": "SP1 derivation query shipped. ...",
       "applies_to": { "tools": ["meta_state_derive_status"], "schemas": ["core/meta-state.js"] },
       "evidence_code_ref": "tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js",
       "evidence_journal": "plans/reports/brainstorm-260602-sp1-derive-status.md"
     }
     ```
   - Result:
     ```json
     {
       "logged": true,
       "id": "meta-260603T1548Z-tools-learning-loop-mcp-tools-meta-state-derive-status-tool",
       "entry_kind": "change-log",
       "change_dimension": "surface",
       "change_target": "tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js",
       "created_at": "2026-06-03T08:48:52.063Z"
     }
     ```
   - `meta-state.jsonl` grew from 19 to 20 lines. The new entry is at line 20, immediately after the G8 5th-recurrence finding (line 19).
   - No id collision: the slug `tools-learning-loop-mcp-tools-meta-state-derive-status-tool` is distinct from SP0's slug (`tools-learning-loop-mcp-tools-meta-state-log-change-tool`).

7. **Phase 1 verification.** `meta-state.jsonl` line count: 19 → 20 (+1). Gate log line count: 1898 → 1900 (+2 — one for `meta_state_derive_status`, one for `meta_state_log_change`). The `meta_state_derive_status` gate log entry shows: `derived_status: resolved-by-mechanism`, `drift: true`, `recommendation: resolve`. The `meta_state_log_change` gate log entry shows: `change_dimension: surface`, `change_target: tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js`. All matches the plan's expected output.

8. **Test re-run.** Full suite: 557 tests pass, 0 fail. No regression in any of the 556 pre-existing tests. Validators still pass.

## Test Count Reconciliation

| Source | Tests |
|---|---|
| Plan target (Phase 0) | 1 |
| Phase 0 actual | 1 |
| Phase 1 actual | 0 (operational, no new tests) |
| **Total new** | **1** |
| Pre-existing | 556 |
| **Grand total** | **557** |

Plan target was 557 (556 + 1). We have 557 (exact match). No extras, no shortfalls.

## Key Decisions

1. **Test placement in the existing `describe` block** (per the locked design): the new test slots in right after the warm-tier test (line 137 in the original file). Rationale: reuses the existing temp-dir + env-restoration pattern, and the warm-tier test is the natural neighbor (both test the warm response).

2. **Assertion by name, not count** (per the locked design): the test reads `text.tools.map((t) => t.name)` and calls `assert.ok(names.includes(...))`. Rationale: if a future regression removes a tool from the manifest, the test fails with a clear message naming the missing tool. If a future SP renames a tool, the test fails (intentional coupling — renames require a brainstorm anyway).

3. **JSON patch order preserves chronological insertion order from `manifest.json`** (per the locked design): the 3 missing tools (`sweep`, `log_change`, `derive_status`) are inserted between `promote_rule` and `check_grounding` to mirror the order in which they shipped in `tools/manifest.json`. The SP2 cook journal's "agent-manifest drift" observation is now closed.

4. **Phase 1 production call, not temp-dir test** (per the plan's risk mitigation): the `meta_state_derive_status` call uses the real production registry (no temp dir) because the plan explicitly says this is the "operational first use" — a real production invocation, not a test. The result is captured in the gate log and the journal entry serves as the audit trail.

5. **No bulk derive_status on the other 3 stale findings** (per the plan's "What This Plan Does NOT Do"): the SP1 journal's "4 stale `reported` findings" set has 3 remaining entries. Calling `derive_status` on each is out of scope — the plan is a single-call demonstration, not a bulk sweep. SP3 (drift aggregation) is the right place for bulk operations.

## Deviations from Plan

None. The plan was unambiguous and the implementation matched it exactly. The 1 test was added in the right place, the JSON patch was applied in the right order, the `derive_status` call returned the expected output, the `log_change` call produced the expected id, and the gate log has the expected 2 new entries.

## Post-Cook Experiment Record (deferred to a follow-up)

Tried to draft an experiment record for this cook via `record_create_experiment` MCP tool. The tool exposes `assertion_refs` in its schema and passes it to `createExperiment`, but the writer (`core/experiment-writer.js#buildExperimentYaml`) only spreads `assertion_refs` to the **top-level** `assertion_refs` field — not `verification.assertion_refs`. The validator (`validate:records`) requires `verification.assertion_refs` AND `verification.proves` (with at least one dimension entry). The `record_update_experiment` tool's `verification` block does not expose `assertion_refs` either. This is the documented gap in `assertion-meta-static-mcp-experiment-verification-block` (status: active).

**Resolution:** soft-deleted the broken record via `record_delete` (status: draft, so allowed). Audit trail in `records/meta/experiments/.deleted/`. The validator is now green (183 records, 0 errors). The fix is a separate plan: extend the experiment writer to populate `verification.assertion_refs` from the top-level `assertion_refs`, and extend the update tool's `verification` block to expose `assertion_refs`.

## Success Metrics Met

- 557 tests pass (target 557)
- 0 regressions in pre-existing tests
- `pnpm validate:records` passes (183 records)
- `pnpm validate:plan-loop` passes (74 plans, 0 violations)
- `agent-manifest.json` validates as JSON
- `agent-manifest.json` `meta_state.tools` array has 10 entries (was 7)
- Insertion order preserved: `report, list, ack, resolve, promote_rule, sweep, log_change, derive_status, check_grounding, refresh_fingerprint`
- All 10 `meta_state_*` tool names appear in `loop_describe({ tier: "warm" }).tools`
- New test `SP2: warm tier surfaces check_grounding + refresh_fingerprint` passes
- `meta_state_derive_status` called on `meta-260601T1353Z-bash-gate-constraint-matcher-...`; gate log entry shows `derived_status: resolved-by-mechanism`, `drift: true`, `recommendation: resolve`
- `meta-state.jsonl` has 20 entries (was 19); the new entry is `entry_kind: "change-log"` with `change_target: "tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js"`, `id: meta-260603T1548Z-tools-learning-loop-mcp-tools-meta-state-derive-status-tool`
- Gate log has 2 new entries (one for `derive_status`, one for `log_change`)
- This journal entry documents the result and follows the SP0/SP1/SP2 cook journal pattern
- 5th G8 recurrence (entry `meta-260603T1435Z-g8-subcommand-class-false-positive-5th-recurrence-hit-ck-pla`) is on the books from SP2 cook; this plan did not hit it (the G8 5th-recurrence was recorded by SP2's cook during plan scaffolding)

## References

- `plans/260603-sp2-discoverability-and-manifest-backfill/plan.md` — plan
- `plans/260603-sp2-discoverability-and-manifest-backfill/phase-00-discoverability-and-backfill.md` — Phase 0 spec
- `plans/260603-sp2-discoverability-and-manifest-backfill/phase-01-sp1-followups.md` — Phase 1 spec
- `plans/reports/brainstorm-260603-sp2-discoverability-and-manifest-backfill.md` — locked design
- `plans/reports/verification-260603-sp2-design.md` — SP2 verification (I-12 + I-13)
- `docs/journals/260602-sp2-check-grounding-cook.md` — pattern reference
- `docs/journals/260602-sp1-derive-status-planning.md` — the source of the Phase 1 follow-ups
- `tools/learning-loop-mcp/__tests__/loop-describe.test.js` — patch target (1 new test)
- `tools/learning-loop-mcp/agent-manifest.json` — patch target (3 new lines)
- `meta-state.jsonl` line 20 — the new change-log entry
- `.claude/coordination/gate-log.jsonl` lines 1899-1900 — the new tool-call entries
