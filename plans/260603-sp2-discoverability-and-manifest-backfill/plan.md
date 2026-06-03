---
title: "SP2 Gap Closure: Discoverability Test + agent-manifest.json Backfill"
description: "Closes 2 gaps from the SP2 review: (1) add a unit test asserting both SP2 tools surface in loop_describe warm response (I-12 from SP2 verification), (2) backfill agent-manifest.json meta_state group with the 3 missing tools (meta_state_sweep, meta_state_log_change, meta_state_derive_status) that shipped in SP0/SP1 but were never added to the grouped structure. 1 phase, 2 patches, 1 new test. Preserves all 556 existing tests; new total 557."
status: completed
priority: P3
branch: "main"
tags: [sp2, gap-closure, agent-manifest, discoverability, loop-describe, tdd, meta-state]
related:
  - plans/reports/brainstorm-260603-sp2-discoverability-and-manifest-backfill.md (locked design)
  - plans/260602-sp2-check-grounding/plan.md (SP2 — completed, parent)
  - plans/260602-sp2-check-grounding/phase-03-manifest-registration.md (SP2 manifest phase — I-13 mitigation)
  - plans/reports/verification-260603-sp2-design.md (SP2 verification — I-12 + I-13 mitigations)
  - tools/learning-loop-mcp/agent-manifest.json (the drift target — patch target)
  - tools/learning-loop-mcp/__tests__/loop-describe.test.js (the test surface — patch target)
  - tools/learning-loop-mcp/core/loop-introspect.js (listAllTools — manifest reader)
  - tools/learning-loop-mcp/tools/manifest.json (the source of truth, in sync — not patched)
created: "2026-06-03T15:30:00Z"
createdBy: "ck:brainstorm → ck:plan handoff (design locked in brainstorm summary)"
source: skill
---

# SP2 Gap Closure: Discoverability Test + `agent-manifest.json` Backfill

## Overview

The SP2 review (journal: `docs/journals/260602-sp2-check-grounding-cook.md`) identified 2 gaps in the shipped work that should close before SP3 starts. This plan closes them in a single TDD phase:

1. **Missing discoverability test (verification report I-12):** the plan's `I-12` required a unit test asserting both new tool names appear in `loop_describe({ tier: "warm" })`. It was never written. The plan's own success metric list cites this as a contract: "loop_describe shows both new tools in the MCP tool list." Without this test, an agent in a fresh session has no automated guarantee that `meta_state_check_grounding` and `meta_state_refresh_fingerprint` are surfaced by the discovery tool.

2. **`agent-manifest.json` drift (verification report I-13):** the cook chose Option A (add SP2 tools, leave SP0/SP1 for a separate cleanup). The current `meta_state.tools` array has 7 entries; SP0's `meta_state_sweep` + `meta_state_log_change` and SP1's `meta_state_derive_status` are missing. The grouped structure that `loop_introspect` and any future SP3 drift consumer reads from is out of sync with the flat `manifest.json` (which has all 10).

Both gaps are 5-10 minute fixes. They were intentionally deferred in the SP2 cook to keep that session focused, but they need to close before SP3 starts:

- SP3's `meta_state_query_drift` will read from `agent-manifest.json` to enumerate meta-state tools. The drift will misroute SP3's tool lists.
- The discoverability test is the smallest possible safety net for the manifest registration pattern. SP3 will add 1 more tool to the same group; without a test, the drift recurs.

**Why TDD:** the test is a regression-safety contract. Writing it first ensures both the manifest-flat source-of-truth AND the grouped structure stay in sync. Even though the test will pass on the first run (the flat manifest is correct), the test locks the contract for future manifests.

**Surface:** `meta` (changes to the loop's own machinery, not `product/**`).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 0 | [Discoverability Test + `agent-manifest.json` Backfill (TDD, 1 new test + 1 JSON patch)](./phase-00-discoverability-and-backfill.md) | completed |
| 1 | [SP1 Operational Follow-ups (`derive_status` first use + SP1 change-log entry)](./phase-01-sp1-followups.md) | completed |

## Cross-Plan Dependencies

| Relationship | Plan | Status | Note |
|---|---|---|---|
| Builds on | `260602-sp2-check-grounding` | **completed** | The 2 SP2 tools exist; `manifest.json` registers them; the JSONL has the 5th G8 recurrence entry. |
| Builds on | `260602-sp1-derive-status` | **completed** | Provides `meta_state_derive_status` (the SP1 tool missing from `agent-manifest.json` `meta_state` group). Phase 1 of this plan closes 2 of SP1's post-cook follow-ups. |
| Builds on | `260602-sp0-log-change` | **completed** | Provides `meta_state_log_change` and `meta_state_sweep` (the SP0 tools missing from `agent-manifest.json` `meta_state` group). Phase 1 mirrors SP0's "self-log" pattern. |
| Required for (future) | SP3 drift aggregation | not started | SP3's `meta_state_query_drift` will read from `agent-manifest.json` `meta_state` group. This plan ensures the group is complete. |

## Resolved Decisions (from brainstorm + design)

1. **Scope:** 2 phases. Phase 0 = 2 patches (1 new test + 1 JSON patch). Phase 1 = 2 operational follow-ups (1 `derive_status` call + 1 change-log entry). No new files. No schema changes.
2. **Test placement:** extend the existing `__tests__/loop-describe.test.js` inside the `describe("loop_describe new behavior")` block (per the brainstorm's recommended option). Rationale: reuses the existing temp-dir + env-restoration pattern; the warm-tier test at line 110 is the natural neighbor.
3. **Test assertion shape:** assert by name (not count). The test reads `text.tools.map((t) => t.name)` and calls `assert.ok(names.includes(...))` for each SP2 tool. If a future regression removes a tool from the manifest, the test fails with a clear message. If a future SP renames a tool, the test fails (intentional coupling).
4. **JSON patch order:** preserve chronological insertion order from `tools/manifest.json`. The current `meta_state.tools` array is `report, list, ack, resolve, promote_rule, check_grounding, refresh_fingerprint`. The 3 missing tools (`sweep`, `log_change`, `derive_status`) belong between `promote_rule` and `check_grounding` because they shipped in that order in `manifest.json` (lines 47-49 sit between the original 5 and SP2's 2).
5. **Phase 1 first-use target:** `meta-260601T1353Z-bash-gate-constraint-matcher-does-not-distinguish-heredoc-co` (the original SP1-flagged finding). It is the only entry from the SP1 journal's "4 stale `reported` findings" set that is still in `reported` status (the other 2 from that family are `resolved` or `active`). Its `evidence.code_ref: "tools/learning-loop-mcp/hooks/bash-gate.js"` makes the derivation meaningful.
6. **Phase 1 change-log target:** mirror SP0's self-log pattern (`meta-260602T1705Z-...`). The change target is `tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js` (the entry point); `change_diff.added: ["meta_state_derive_status"]`; `applies_to.tools: ["meta_state_derive_status"]`; `applies_to.schemas: ["core/meta-state.js"]`; `reason: "SP1 derivation query shipped..."`.
7. **Not touching other groups:** `agent-manifest.json` may have drift in other groups (`gate`, `workflow`, `index`, etc.). Out of scope. If audit becomes necessary, that's a separate plan.
8. **Not refactoring:** `agent-manifest.json` is hand-written JSON; `manifest.json` is also hand-written. The cleanest future is a single source of truth (auto-generation), but that's a separate refactor plan. For now, the 2 files mirror each other manually.
9. **Not refactoring `loop-describe.test.js`:** the test file's existing structure (describe blocks, temp-dir pattern, env restoration) is preserved. The new test slots in alongside the warm-tier test at line 137.

## Architecture

### Patch A: `__tests__/loop-describe.test.js`

Add a new test inside the existing `describe("loop_describe new behavior")` block. Reuses the sibling test's `mkdtempSync` + `process.env.GATE_ROOT` pattern. Reads from the real `MCP_ROOT/tools/manifest.json` (the source of truth) via `loop_introspect.listAllTools` (the manifest reader).

```js
test("SP2: warm tier surfaces check_grounding + refresh_fingerprint", async () => {
  tempDir = mkdtempSync(join(tmpdir(), "loop-describe-sp2-"));
  process.env.GATE_ROOT = tempDir;
  try {
    const result = await loopDescribeTool.handler({ tier: "warm" });
    const text = JSON.parse(result.content[0].text);
    const names = text.tools.map((t) => t.name);
    assert.ok(names.includes("meta_state_check_grounding"),
      "SP2 check tool must appear in warm response");
    assert.ok(names.includes("meta_state_refresh_fingerprint"),
      "SP2 refresh tool must appear in warm response");
  } finally {
    process.env.GATE_ROOT = originalEnv;
  }
});
```

### Patch B: `tools/learning-loop-mcp/agent-manifest.json`

Append 3 missing tool names to the `meta_state.tools` array, preserving chronological insertion order from `tools/manifest.json`:

```diff
   "meta_state": {
     "description": "Meta-state registry for loop self-awareness findings",
     "tools": [
       "meta_state_report",
       "meta_state_list",
       "meta_state_ack",
       "meta_state_resolve",
       "meta_state_promote_rule",
+      "meta_state_sweep",
+      "meta_state_log_change",
+      "meta_state_derive_status",
       "meta_state_check_grounding",
       "meta_state_refresh_fingerprint"
     ],
     "ordering": "any"
   }
```

## Test Plan

| File | New | Total after |
|---|---|---|
| `__tests__/loop-describe.test.js` (existing, extended) | 1 | (was 16) → 17 |
| **Total new tests** | | **1** |
| **Existing tests (regression-safety floor)** | | 556 (preserved unchanged) |
| **Project total after plan** | | **557** |

The new test is a regression-safety contract, not new functionality. It reads the existing `manifest.json` and asserts the SP2 tools are in the warm response. The flat `manifest.json` is already correct (the cook verified this in Phase 3); the new test locks that in.

Phase 1 has no new tests — it is operational first use of existing tools, not new code. The 1 derive_status call and 1 change-log entry are validated by inspecting the gate log and `meta-state.jsonl`, not by tests.

## What This Plan Does NOT Do (Out of Scope)

- No other `agent-manifest.json` group fixes (drift in `gate`, `workflow`, `index`, etc. is a separate audit)
- No auto-generation of `agent-manifest.json` from `manifest.json` (would be a single-source-of-truth refactor)
- No backfill of `loop_describe` test for SP0/SP1 entries (the existing tests cover the warm response for those tools indirectly via the tool count assertion)
- No renames of SP2 tool names (locked in `brainstorm-260602-sp2-check-grounding.md`)
- No schema changes (the 2 new fields from SP2 — `mechanism_check`, `code_fingerprint` — are unchanged)
- No real-world "first use" of the 2 SP2 tools on a legacy finding (was a Phase 4 suggestion that didn't happen in the SP2 cook; SP3 can do this)
- No `derive_status` calls on the 3 other stale `reported` findings (the G8 recurrence family, etc.) — Phase 1 is a single-call demonstration, not a bulk sweep. SP3 (drift aggregation) is the right place for bulk operations.

## Success Metrics

- [ ] `pnpm test` passes (full suite, ≥ 557 tests; 556 existing + 1 new)
- [ ] `pnpm validate:records` passes (no schema regression)
- [ ] `pnpm validate:plan-loop` passes (no frontmatter regression)
- [ ] `agent-manifest.json` `meta_state.tools` array has 10 entries (was 7)
- [ ] `agent-manifest.json` validates as JSON: `node -e "JSON.parse(require('fs').readFileSync('tools/learning-loop-mcp/agent-manifest.json'))"`
- [ ] New test `SP2: warm tier surfaces check_grounding + refresh_fingerprint` passes
- [ ] All 10 `meta_state_*` tool names appear in `loop_describe({ tier: "warm" }).tools` (verifiable manually)
- [ ] Insertion order preserved: `report, list, ack, resolve, promote_rule, sweep, log_change, derive_status, check_grounding, refresh_fingerprint`
- [ ] Gate log has 1 new `meta_state_derive_status` call entry (id: `meta-260601T1353Z-bash-gate-constraint-matcher-...`)
- [ ] `meta-state.jsonl` has 1 new change-log entry (id starting with `meta-260603T`; target: `tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js`)
- [ ] Journal entry documents the derive_status result + the change-log intent (mirror `docs/journals/260602-sp2-check-grounding-cook.md` pattern)

## Risks

| Risk | Mitigation |
|---|---|
| The new test could false-pass if `listAllTools` has a `degraded: true` mode that silently drops missing tools. | The test asserts `names.includes(...)` regardless of count. If a tool is missing for any reason, the test fails. |
| JSON syntax error in `agent-manifest.json` (trailing comma, missing comma). | Run `node -e "JSON.parse(require('fs').readFileSync('tools/learning-loop-mcp/agent-manifest.json'))"` after the edit. |
| The test ties itself to the SP2 tool names (not just a count). | Acceptable: those names are locked in `brainstorm-260602-sp2-check-grounding.md`. If a future SP renames them, the test will need updating — but the rename would itself require a brainstorm, so the coupling is intentional. |
| The test doesn't cover the `quickstart` chains in `agent-manifest.json` (e.g., `record_verification` referencing `index_validate`). | Out of scope. The drift in other groups is a separate audit. The new test specifically covers the `meta_state` group's discoverability. |
| The test reads from the real `MCP_ROOT/tools/manifest.json` (not a test fixture). | Intentional: it exercises the full manifest registration path. The temp-dir is only used to scope `process.env.GATE_ROOT` for the registry read (the manifest itself is read from a hardcoded path). |
| The bash-gate-constraint-matcher entry has `expires_at: 2026-06-02T06:53:40.789Z` (in the past) and `status: reported`. The `meta_state_list` tool would skip it on expiry, but `meta_state_derive_status` works regardless. | Phase 1 calls `derive_status` directly (per-id), not via `meta_state_list`. Expiry is a presentation concern, not a derivation concern. The result is still meaningful. |
| The SP1 change-log entry might conflict with the existing SP0 self-log (`meta-260602T1705Z-...`). | Each entry has a unique id generated by `generateId(slug)`. The slug for SP1's entry (`sp1-derive-status-tool-js`) is distinct from SP0's slug (`meta-state-log-change-tool-js`). No collision. |

## Phase 0: Discoverability Test + `agent-manifest.json` Backfill

See [`phase-00-discoverability-and-backfill.md`](./phase-00-discoverability-and-backfill.md) for the full phase spec.

## Phase 1: SP1 Operational Follow-ups (`derive_status` first use + SP1 change-log entry)

See [`phase-01-sp1-followups.md`](./phase-01-sp1-followups.md) for the full phase spec.

## References

### Design Artifacts

- `plans/reports/brainstorm-260603-sp2-discoverability-and-manifest-backfill.md` — locked design
- `plans/reports/verification-260603-sp2-design.md` — SP2 verification report (I-12, I-13 mitigations)
- `plans/260602-sp2-check-grounding/plan.md` — SP2 parent plan

### Code References

- `tools/learning-loop-mcp/agent-manifest.json` — patch target (line 48-52, the `meta_state` group)
- `tools/learning-loop-mcp/__tests__/loop-describe.test.js` — patch target (the `describe("loop_describe new behavior")` block, around line 110)
- `tools/learning-loop-mcp/tools/manifest.json` — source of truth (not patched; already correct)
- `tools/learning-loop-mcp/core/loop-introspect.js` — `listAllTools` (the manifest reader that the new test exercises)

### Pattern References

- The temp-dir + env-restoration pattern in `loop-describe.test.js` (used in 12+ sibling tests)
- The `__tests__/sp0-change-log-self-log.test.js` (Phase 4 acceptance test pattern from SP0)
- The `__tests__/sp1-derive-status-acceptance.test.js` (Phase 4 acceptance test pattern from SP1)
