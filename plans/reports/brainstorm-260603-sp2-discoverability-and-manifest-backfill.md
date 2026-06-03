---
date: "2026-06-03T15:30:00Z"
status: agreed
tags: [brainstorm, sp2, gap-closure, agent-manifest, discoverability, loop-describe, tdd]
related:
  - plans/260602-sp2-check-grounding/plan.md (SP2 — shipped)
  - plans/260602-sp2-check-grounding/phase-03-manifest-registration.md (SP2 manifest phase)
  - plans/reports/verification-260603-sp2-design.md (SP2 verification, I-12 + I-13 mitigations)
  - plans/reports/brainstorm-260602-sp2-check-grounding.md (SP2 locked design)
  - tools/learning-loop-mcp/agent-manifest.json (the drift target)
  - tools/learning-loop-mcp/__tests__/loop-describe.test.js (the test surface)
  - tools/learning-loop-mcp/core/loop-introspect.js (listAllTools — manifest reader)
  - tools/learning-loop-mcp/tools/manifest.json (the source of truth, in sync)
---

# SP2 Gap Closure: Discoverability Test + `agent-manifest.json` Backfill

> **Status: agreed.** Two-patch TDD fix for the 2 gaps surfaced in the SP2 review. No new files. No schema changes. 1 new test + 1 JSON patch.

## Problem Statement

The SP2 cook session shipped 44 new tests (target 41, +3 over) and 2 new tools, but left 2 specific gaps unaddressed:

1. **Missing discoverability test (I-12 from verification report).** The plan's `I-12` required a unit test asserting the 2 new tool names appear in `loop_describe({ tier: "warm" })`. It was never written. The plan's success metric list cites this as a contract: "loop_describe shows both new tools in the MCP tool list." Without this test, an agent in a fresh session has no automated guarantee that `meta_state_check_grounding` / `meta_state_refresh_fingerprint` are surfaced by the discovery tool.

2. **`agent-manifest.json` drift (I-13 from verification report).** The cook chose Option A (add SP2 tools, leave SP0/SP1 for a separate cleanup). The current `meta_state.tools` array has 7 entries; SP0's `meta_state_sweep` + `meta_state_log_change` and SP1's `meta_state_derive_status` are missing. The grouped structure that `loop_introspect` and any future SP3 drift consumer reads from is out of sync with the flat `manifest.json` (which has all 10).

Both gaps are 5-10 minute fixes. They were intentionally deferred in the SP2 cook to keep that session focused, but they need to close before SP3 starts because:

- SP3's `meta_state_query_drift` will read from `agent-manifest.json` to enumerate meta-state tools. The drift will misroute SP3's tool lists.
- The discoverability test is the smallest possible safety net for the manifest registration pattern. SP3 will add 1 more tool to the same group; without a test, the drift recurs.

## Evaluated Approaches

### Approach 1: Minimum fix (Patch A only, no Patch B)

- **Pros:** ~5 min. Lowest risk. The discoverability test catches future drift in the manifest flat file (which is what `loop_introspect` actually reads).
- **Cons:** Leaves `agent-manifest.json` (the grouped structure) out of sync. The "Tools" view in any agent manifest consumer (e.g., `loop_describe({ tier: "cold" })` aggregation logic) shows only 7 tools. SP3's design is unclear which manifest it reads from.
- **Verdict:** Insufficient. The grouped structure exists for a reason (grouped ordering, `quickstart` chains).

### Approach 2: Recommended — Both patches in one TDD cycle

- **Pros:** Closes both gaps. The new test naturally exercises Patch B's effect (3 more tools in the warm response = 3 more entries in `text.tools`). Patches are independent; both can land in one phase.
- **Cons:** Slightly larger scope than the absolute minimum. The test asserts 2 specific tool names, not a count — which is correct but ties the test to SP2's tool names (acceptable: those names are locked in the brainstorm).
- **Verdict:** The right move. Tests-first locks in the backfill, then the JSON patch is verifiable by re-running the test.

### Approach 3: Defer to SP3

- **Pros:** Cleaner conceptual separation (SP2's gaps close in SP3, not in a separate plan).
- **Cons:** SP3 is a multi-week build. The `agent-manifest.json` drift is visible to any agent reading `loop_describe` documentation NOW. Delaying makes the drift harder to track.
- **Verdict:** Worse than Approach 2. Drift compounds.

## Final Recommended Solution

**Two phases: Phase 0 (2 patches, TDD) + Phase 1 (2 operational follow-ups).**

### Phase 0: Discoverability Test + `agent-manifest.json` Backfill

#### Step 1: Write the test (RED)

Extend `tools/learning-loop-mcp/__tests__/loop-describe.test.js` with a new test inside the existing `describe("loop_describe new behavior")` block. Use the same `mkdtempSync` + `process.env.GATE_ROOT` pattern as sibling tests. Assert that both SP2 tool names appear in `text.tools`.

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

Run `pnpm test -- __tests__/loop-describe.test.js` — confirm test FAILS (RED). The test reads the real `MCP_ROOT/tools/manifest.json` (which is already correct), so it will pass for SP2; the RED comes from the fact that the test is new. After Patch B, the test still passes. If a future regression removes a tool from `manifest.json`, the test fails.

#### Step 2: Patch the JSON (GREEN is implicit, but the test isn't really broken)

Append 3 missing tool names to the end of the `meta_state.tools` array in `tools/learning-loop-mcp/agent-manifest.json`, preserving the chronological insertion order from `tools/manifest.json`:

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

Verify: `node -e "JSON.parse(require('fs').readFileSync('tools/learning-loop-mcp/agent-manifest.json'))"` returns without throwing.

#### Step 3: Run full suite

`pnpm test` — confirm 556 + 1 = 557 pass, 0 fail.
`pnpm validate:records` — confirm 183 records, 0 errors.
`pnpm validate:plan-loop` — confirm passes.

### Phase 1: SP1 Operational Follow-ups (closed per the SP1 journal's "Next Steps" section)

The SP1 cook journal listed 2 items that were intentionally deferred. Both remain undone (verified 2026-06-03). Phase 1 closes them as a side-effect of the current plan.

#### Step 1.1: Operational first use of `meta_state_derive_status`

**Target:** `meta-260601T1353Z-bash-gate-constraint-matcher-does-not-distinguish-heredoc-co` (the only entry from the SP1-flagged "4 stale `reported` findings" set still in `reported` status as of 2026-06-03).

**Tool call:** `meta_state_derive_status({ id: "meta-260601T1353Z-bash-gate-constraint-matcher-..." })` (default `run_tests: false`; no `evidence_test` on this entry).

**Expected output:** `{ raw_status: "reported", derived_status: "resolved-by-mechanism", derivation: { kind: "mechanism-shipped", signals: { code_ref_exists: true, code_ref_path: "tools/learning-loop-mcp/hooks/bash-gate.js", test_passed: null }, ... }, drift: true, recommendation: "resolve" }`.

**Agent action:** capture the result in a journal entry; the actual `meta_state_resolve` call is out of scope (deferred to a future plan).

#### Step 1.2: Record a change-log entry for SP1 self-modification

**Tool call:** `meta_state_log_change({ change_dimension: "surface", change_target: "tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js", change_diff: { added: ["meta_state_derive_status"], removed: [], changed: [] }, reason: "SP1 derivation query shipped...", applies_to: { tools: ["meta_state_derive_status"], schemas: ["core/meta-state.js"] }, evidence: { code_ref: "tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js", journal: "plans/reports/brainstorm-260602-sp1-derive-status.md" } })`.

**Expected output:** new `meta-state.jsonl` line with `entry_kind: "change-log"` and a new id `meta-260603T????-sp1-derive-status-tool-js`. `meta-state.jsonl` goes from 20 entries to 21.

#### Step 1.3: Journal entry

Create `docs/journals/260603-sp2-gap-closure-cook.md` documenting the Phase 0 + Phase 1 work. Mirror the SP0/SP1/SP2 cook journal structure.

#### Step 1.4: Verify

`pnpm test` — confirm 557 pass, 0 fail.
`pnpm validate:records` — confirm passes.
`pnpm validate:plan-loop` — confirm passes.

## Implementation Considerations and Risks

| Risk | Mitigation |
|---|---|
| The new test could false-pass if `listAllTools` has a `degraded: true` mode that silently drops missing tools. | The test asserts `names.includes(...)` regardless of count. If a tool is missing for any reason, the test fails. |
| JSON syntax error in `agent-manifest.json` (trailing comma, missing comma). | Run `node -e "JSON.parse(...)"` after the edit. Hand-written JSON; pre-existing `manifest.json` is also hand-written and uses the same convention. |
| The test ties itself to the SP2 tool names (not just a count). | Acceptable: those names are locked in `brainstorm-260602-sp2-check-grounding.md`. If a future SP renames them, the test will need updating — but the rename would itself require a brainstorm, so the coupling is intentional. |
| The test doesn't cover the `quickstart` chains in `agent-manifest.json` (e.g., `record_verification` referencing `index_validate`). | Out of scope. The drift in other groups is a separate audit. The new test specifically covers the `meta_state` group's discoverability. |

## Success Metrics and Validation Criteria

- [ ] `pnpm test` shows 557 pass (was 556), 0 fail
- [ ] `pnpm validate:records` passes (no schema regression)
- [ ] `pnpm validate:plan-loop` passes (no frontmatter regression)
- [ ] `agent-manifest.json` `meta_state.tools` array has 10 entries (was 7)
- [ ] New test `SP2: warm tier surfaces check_grounding + refresh_fingerprint` passes
- [ ] `node -e "JSON.parse(require('fs').readFileSync('tools/learning-loop-mcp/agent-manifest.json'))"` returns without throwing
- [ ] `loop_describe({ tier: "warm" })` in a fresh session returns all 10 `meta_state_*` tool names (verifiable manually)
- [ ] Gate log has 1 new `meta_state_derive_status` entry (id: `meta-260601T1353Z-bash-gate-constraint-matcher-...`)
- [ ] `meta-state.jsonl` has 21 entries (was 20); the new entry is `entry_kind: "change-log"` with `change_target: "tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js"`
- [ ] Journal entry exists at `docs/journals/260603-sp2-gap-closure-cook.md` and follows the SP0/SP1/SP2 cook journal pattern

## Next Steps and Dependencies

**Depends on:** SP2 shipped (status: completed; verified via `pnpm test` 556/556).

**Enables:**
- **SP3 (drift aggregation)** can now read from `agent-manifest.json` `meta_state` group without manual filtering. The `meta_state_query_drift` tool (per parent doc lines 200-240) will be designed against a complete tool list.
- The test pattern (`assert text.tools.find(t => t.name === X)`) is reusable for SP3's discoverability assertion: a follow-up test can assert `meta_state_query_drift` is in the warm response after SP3 ships.

**Out of scope (intentionally):**
- Backfilling drift in other `agent-manifest.json` groups (`gate`, `workflow`, `index`, etc.)
- Renaming `meta_state_check_grounding` / `meta_state_refresh_fingerprint` (locked names)
- Refactoring `agent-manifest.json` to be auto-generated from `manifest.json` (would be a separate "single source of truth" plan)

## Naming

This report: `brainstorm-260603-sp2-discoverability-and-manifest-backfill.md` (per the established `brainstorm-{YYMMDD}-{slug}.md` pattern in `plans/reports/`).

Plan (next step): `plans/260603-sp2-discoverability-and-manifest-backfill/plan.md` (per the established `plans/{YYMMDD}-{slug}/plan.md` pattern).
