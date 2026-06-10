---
phase: 3
title: "Refactor and closeout"
status: pending
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 3: Refactor and closeout

## Overview

Apply 8 registry mutations in the strict sequence required by F11 (from plan 260608-1015) and the new evidence_code_ref fix (per red-team amendment 6). Plus 4 setup mutations (1 change-log for the hot fix ship — with `supersedes` field per amendment 4 — 1 new loop-design for Bridge 5 deferral, 1 evidence_code_ref patch on the originating finding, 1 closeout update on the existing loop-design #508 to mark it shipped). Run final validation (`pnpm check` + cold-session test). Journal the session reflection.

**Pre-validation gate (per red-team amendment 3):** Step 2 only files the Bridge 5 deferral via `meta_state_propose_design` if Test 1.5 (empty arrays round-trip flat) passes. If Test 1.5 fails at Phase 2, Step 2 falls back to `meta_state_log_change` (no array shape issue), and a new finding is filed for the empty-array edge case.

## Requirements

- Functional:
  - 8 registry mutations applied in the correct sequence (per F11 lesson + red-team amendment 6 for the new Step 2.5)
  - All existing tests pass (898)
  - `pnpm check` passes (validate records + extract index + tests)
  - Cold-session test passes (the rule `rule-cold-session-test-must-pass-before-resolution` checks MCP tool availability, not registry content; the change-log mutation does not affect tool availability)
  - Loop-design #508 (`loop-design-meta-state-patch-wire-format-recursion`) status flips from `active` → `inactive` with `shipped_in_plan` and `shipped_at` populated; **the closeout patch includes `addresses: []` alongside the scalars** (Option B recursive proof per red-team amendment 5 — the empty array exercises the unwrap path)
  - New loop-design `loop-design-schema-source-of-truth` exists with status `active` and ~200-char deferral paragraph referencing AGENTS.md Bridge 5 + the 11 drift cells (only if Test 1.5 passes; otherwise filed via `meta_state_log_change`)
  - Finding #509's `evidence_code_ref` updated to point to the fix site BEFORE the fingerprint refresh
- Non-functional:
  - All 8 mutations go through canonical MCP tools (no `node -e` escape hatch, no direct file I/O to `meta-state.jsonl`)
  - Each mutation's `source_refs` includes the relevant evidence_code_ref (per Internalization Rule)
  - The change-log entry explicitly references the 3 affected tools: `meta_state_patch`, `meta_state_propose_design`, `meta_state_report`
  - The change-log entry includes a `supersedes` field pointing to the stale change-log #510 (per red-team amendment 4)
  - The Bridge 5 loop-design entry's `description` is ~200 chars, references AGENTS.md Bridge 5, does NOT duplicate the AGENTS.md content
  - The resolve narrative uses "Resolved:" (per F12 from 260608-1015 plan), NOT "Superseded by:"

## Architecture

**The 8 registry mutations, in sequence:**

| # | Tool | Target | Payload | Why this order |
|---|------|--------|---------|----------------|
| 1 | `meta_state_log_change` | `tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema` | `change_diff.added: ["unwrapItemWrap helper"]`, `applies_to.tools: ["meta_state_patch", "meta_state_propose_design", "meta_state_report"]`, **`supersedes: "meta-20260609185059Z-meta-state-patch-wire-format-recursion-design-proposed"`** (per red-team amendment 4) | First: announce the ship + formally correct the stale change-target in #510 (this is the change-log that subsequent mutations will reference) |
| 2 | `meta_state_propose_design` (or `meta_state_log_change` fallback) | new id: `loop-design-schema-source-of-truth` | `status="active"`, `proposed_design_for=[]`, `addresses=[]`, ~200-char description referencing AGENTS.md Bridge 5 + 11 drift cells | Second: file the Bridge 5 deferral entry; mechanism depends on Test 1.5 outcome (see Step 2 detail below) |
| 2.5 | `meta_state_patch` | `meta-260610T0115Z-...` (finding #509) | `patch: { evidence_code_ref: "tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema" }` (replaces stale `meta-state-patch-tool.js#handler`) | NEW per red-team amendment 6: must precede Step 4 so the fingerprint hashes the correct file. Without this, `check_grounding` returns `drifted` against the wrong file |
| 3 | `meta_state_ack` | `meta-260610T0115Z-meta-state-patch-array-wrap-and-passthrough-recursion-bug` | (no payload; just call the tool) | Fourth: promote finding from `reported` to `active` (removes 24h TTL pressure) |
| 4 | `meta_state_refresh_fingerprint` | `meta-260610T0115Z-...` | (no payload; uses the updated `evidence_code_ref` from Step 2.5) | Fifth: refresh the fingerprint after Phase 2 edited the file (F11 lesson) |
| 5 | `meta_state_check_grounding` | `meta-260610T0115Z-...` | (no payload; just call the tool to verify `grounded` status) | Sixth: verify the fingerprint is fresh before resolve (F11 lesson) |
| 6 | `meta_state_resolve` | `meta-260610T0115Z-...` | `resolution: "Resolved: meta_state_patch wire-format recursion bug closed by meta_state_log_change meta-<id-from-step-1>. Hot fix shipped unwrapItemWrap helper in tool-registry.js#coerceParamsToSchema. Bridge 5 deferred to loop-design-schema-source-of-truth. 4 regression tests in __tests__/wire-format-patch-recursion.test.js (1 stdio combined-patch + 1 unit test on coerceParamsToSchema + 1 stdio propose_design + 1 pre-validation for empty arrays). The fix lives in coerceParamsToSchema (registry layer), so Bridge 5 can read and delete the unwrap branch in 1 file edit. Zero changes to meta-state-patch-tool.js."` | Seventh: resolve the originating finding (per F12, "Resolved:" not "Superseded by:") |
| 7 | `meta_state_patch` | id: `loop-design-meta-state-patch-wire-format-recursion` | `patch: { status: "inactive", shipped_in_plan: "plans/260610-meta-state-patch-wire-format-recursion/", shipped_at: "2026-06-10T<current-timestamp>Z", addresses: [] }` (combined array + scalars) | Eighth: the recursive proof, earned (Option B per red-team amendment 5) — the empty array exercises the unwrap path (`{item: []}` is the natural edge case), proving the fix works end-to-end via the registry round-trip |

**Critical sequence rule (F11 from 260608-1015 plan + red-team amendment 6):** Steps 2.5 → 3 → 4 → 5 → 6 must happen in that order. Step 2.5 must precede Step 4 (so the fingerprint hashes the correct file). The `rule-no-orphaned-evidence` consult-gate will block Step 6 if Step 4 (refresh_fingerprint) is missing or stale.

**Step 2 conditional logic (per red-team amendment 3):**

- **If Test 1.5 passes** (empty arrays round-trip flat at Phase 2): Step 2 calls `meta_state_propose_design` with the shape in the table above.
- **If Test 1.5 fails** (empty arrays wrap as `{item: []}`): Step 2 falls back to `meta_state_log_change` with:
  ```
  change_dimension: "surface"
  change_target: "loop-design-schema-source-of-truth"
  change_diff: { added: ["Bridge 5 deferral entry (no loop-design entry because propose_design still fails on empty arrays)"] }
  reason: "Bridge 5 deferral filed via meta_state_log_change (not propose_design) because Test 1.5 (pre-validation for empty arrays) failed; propose_design still wraps empty arrays as {item: []}. The empty-array edge case is filed as a separate finding (subtype: wire-format-empty-array-edge-case) for a follow-up plan. Bridge 5 itself remains deferred."
  ```
  Additionally, file a new finding `meta-<date>-wire-format-empty-array-edge-case` with `category: gate-logic-bug` or `loop-anti-pattern` (per F-class), `severity: warning`, `affected_system: mcp-tools`, `description: "meta_state_propose_design wraps empty arrays as {item: []} even after the unwrapItemWrap hot fix. Affects the Bridge 5 deferral mechanism (loop-design entries with empty proposed_design_for/addresses fields). The hot fix in this plan handles non-empty arrays but not the empty-array edge case."`

**No direct registry write fallback** (per red-team amendment 3): the previous plan's "documented data-integrity fix pattern" turned out to be the same `meta-260606T2102Z` anti-pattern. The pre-validation gate removes the need for that fallback. Step 2's only fallback is `meta_state_log_change` (canonical tool with no array shape issue).

## Implementation Steps

### Step 0: Pre-flight checks

1. Verify all Phase 1 + Phase 2 tests pass: `pnpm test`
2. Verify `pnpm check` passes: validate records + extract index + tests
3. **Verify Test 1.5 (pre-validation for empty arrays) passed at Phase 2.** This determines the Step 2 mechanism:
   - If Test 1.5 passed: Step 2 uses `meta_state_propose_design`.
   - If Test 1.5 failed: Step 2 uses `meta_state_log_change` (and a new finding is filed in Step 2's detail block).
4. Read `meta-state.jsonl` to confirm:
   - Finding #509 exists with status `reported`, `mechanism_check: true`, `evidence_code_ref: "tools/learning-loop-mcp/tools/meta-state-patch-tool.js#handler"` (the stale ref that Step 2.5 will correct)
   - Loop-design #508 exists with status `active`
   - Change-log #510 (`meta-20260609185059Z-meta-state-patch-wire-format-recursion-design-proposed`) exists (the one Step 1 supersedes)
5. Confirm the new `unwrapItemWrap` helper is the only production change in `tool-registry.js` (no constant changes; `MAX_RECURSION_DEPTH` stays at 2)

### Step 1: Change-log for the hot fix ship (with `supersedes` per amendment 4)

```
Tool: meta_state_log_change
Payload:
  change_dimension: "mechanical"
  change_target: "tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema"
  change_diff:
    added: ["unwrapItemWrap helper"]
    removed: []
    changed: []
  reason: "Closes meta-260610T0115Z-meta-state-patch-array-wrap-and-passthrough-recursion-bug. The meta_state_patch tool was corrupting data when called with combined array + scalar fields via stdio transport (top-level arrays wrapped as {item: [...]}). The fix lives in tool-registry.js#coerceParamsToSchema (the contract layer between wire format and Zod), adds a typeName-gated unwrapItemWrap helper (ZodArray or ZodObject only, max 3 iterations inlined). NO constant changes (MAX_RECURSION_DEPTH stays at 2; depth bump dropped). Zero changes to meta-state-patch-tool.js (the patch tool schema stays passthrough until Bridge 5). 4 stdio regression tests in __tests__/wire-format-patch-recursion.test.js (1 stdio combined-patch + 1 unit test on coerceParamsToSchema + 1 stdio propose_design + 1 pre-validation for empty arrays). Same fix benefits meta_state_propose_design and meta_state_report (same wire-format class). Bridge 5 (schema as source of truth) deferred to loop-design-schema-source-of-truth. Supersedes meta-20260609185059Z-meta-state-patch-wire-format-recursion-design-proposed (which had the wrong change_target: core/gate-logic.js — the actual function is in tool-registry.js)."
  applies_to:
    tools: ["meta_state_patch", "meta_state_propose_design", "meta_state_report"]
    surfaces: ["meta"]
    rules: []
    statuses: ["active", "inactive", "resolved"]
    schemas: ["tools/learning-loop-mcp/tool-registry.js"]
  supersedes: "meta-20260609185059Z-meta-state-patch-wire-format-recursion-design-proposed"
  evidence_code_ref: "tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema"
  evidence_journal: "plans/reports/brainstorm-260610-meta-state-patch-wire-format-recursion.md"

Capture: the new change-log id (format: meta-YYMMDDTHHmmZ-tools-learning-loop-mcp-tool-registry-js-coerceparamstosc)
```

### Step 2: File Bridge 5 deferral entry (mechanism depends on Test 1.5 outcome)

**If Test 1.5 passed (empty arrays round-trip flat at Phase 2):**

```
Tool: meta_state_propose_design
Payload:
  title: "Schema as source of truth (Bridge 5) — derive tool schemas from record schemas at startup"
  description: "Deferred design (Bridge 5 per AGENTS.md): derive the meta_state_patch tool schema from the 4-kind Zod union (metaStateEntrySchema) at startup so the z.object({}).passthrough() and the unwrapItemWrap helper in tool-registry.js#coerceParamsToSchema can be deleted. 11 drift cells across experiment + risk per AGENTS.md Bridge 5. Hot fix for the current {item:[...]} wrap bug is shipped by plan plans/260610-meta-state-patch-wire-format-recursion/."
  proposed_design_for: []
  addresses: []
  affected_system: "mcp-tools"
```

**If Test 1.5 FAILED (empty arrays still wrap as {item: []} at Phase 2):**

File a new finding FIRST, then use `meta_state_log_change` (no array shape issue):

```
Tool 1: meta_state_report
Payload:
  id: "meta-260610T<current-time>Z-wire-format-empty-array-edge-case"
  category: "loop-anti-pattern"
  subtype: "wire-format-bug"
  severity: "warning"
  affected_system: "mcp-tools"
  description: "meta_state_propose_design wraps empty arrays as {item: []} even after the unwrapItemWrap hot fix in plan plans/260610-meta-state-patch-wire-format-recursion/. The hot fix handles non-empty arrays (e.g., {item: [a, b, c]} unwraps to [a, b, c]) but the empty-array edge case ({item: []}) is not handled. This blocks the Bridge 5 deferral filing mechanism (loop-design entries with empty proposed_design_for/addresses fields cannot be filed via propose_design). The unwrapItemWrap helper's 3-iter bound on {item: X} chains may not cover the empty-array case. Test 1.5 in plans/260610-meta-state-patch-wire-format-recursion/phase-01 reproduces this. Fix is a follow-up plan."
  evidence_code_ref: "tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema"

Then:
Tool 2: meta_state_log_change
Payload:
  change_dimension: "surface"
  change_target: "loop-design-schema-source-of-truth"
  change_diff: { added: ["Bridge 5 deferral entry (no loop-design entry because propose_design still fails on empty arrays)"] }
  reason: "Bridge 5 deferral filed via meta_state_log_change (not propose_design) because Test 1.5 (pre-validation for empty arrays) failed; propose_design still wraps empty arrays as {item: []}. The empty-array edge case is filed as a separate finding (meta-260610T<current-time>Z-wire-format-empty-array-edge-case) for a follow-up plan. Bridge 5 itself remains deferred per AGENTS.md."
  evidence_code_ref: "tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema"
```

**Why no direct registry write fallback** (per red-team amendment 3): the previous plan's "documented data-integrity fix pattern" turned out to be the same `meta-260606T2102Z` anti-pattern. The pre-validation gate (Test 1.5) removes the need for that fallback. The two mechanisms above are both canonical MCP tools.

### Step 2.5: Update finding #509's `evidence_code_ref` (NEW per red-team amendment 6)

```
Tool: meta_state_patch
Payload:
  id: "meta-260610T0115Z-meta-state-patch-array-wrap-and-passthrough-recursion-bug"
  entry_kind: "finding"
  patch: {
    evidence_code_ref: "tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema"
  }

This step is MANDATORY before Step 4. The current `evidence_code_ref` ("tools/learning-loop-mcp/tools/meta-state-patch-tool.js#handler") points to the patch tool's handler, not the fix site. Without this patch, Step 4's `meta_state_refresh_fingerprint` will hash the wrong file, and Step 5's `meta_state_check_grounding` will return `drifted` against the wrong file, blocking Step 6's resolve.

Verify after: the registry shows the updated `evidence_code_ref` value.
```

### Step 3: Ack the originating finding

```
Tool: meta_state_ack
Payload:
  id: "meta-260610T0115Z-meta-state-patch-array-wrap-and-passthrough-recursion-bug"
  reason: "Promoting from reported to active in preparation for resolve after hot fix ships"
```

### Step 4: Refresh fingerprint (F11)

```
Tool: meta_state_refresh_fingerprint
Payload:
  id: "meta-260610T0115Z-meta-state-patch-array-wrap-and-passthrough-recursion-bug"

Note: this uses the updated `evidence_code_ref` from Step 2.5 (the fix site, not the patch tool's handler).
```

### Step 5: Check grounding

```
Tool: meta_state_check_grounding
Payload:
  id: "meta-260610T0115Z-meta-state-patch-array-wrap-and-passthrough-recursion-bug"

Expected return: status="grounded" (the fingerprint was just refreshed in Step 4 against the correct file)
If status is "drifted": re-run Step 4 (this should not happen after Step 2.5, but guard against it)
```

### Step 6: Resolve the originating finding

```
Tool: meta_state_resolve
Payload:
  id: "meta-260610T0115Z-meta-state-patch-array-wrap-and-passthrough-recursion-bug"
  resolution: "Resolved: meta_state_patch wire-format recursion bug closed by meta_state_log_change meta-<id-from-step-1>. Hot fix shipped unwrapItemWrap helper in tool-registry.js#coerceParamsToSchema. Bridge 5 deferred to loop-design-schema-source-of-truth. 4 regression tests in __tests__/wire-format-patch-recursion.test.js (1 stdio combined-patch + 1 unit test on coerceParamsToSchema + 1 stdio propose_design + 1 pre-validation for empty arrays). The fix lives in coerceParamsToSchema (registry layer), so Bridge 5 can read and delete the unwrap branch in 1 file edit. Zero changes to meta-state-patch-tool.js. NO constant changes (MAX_RECURSION_DEPTH stays at 2; depth bump dropped). Step 2.5 updated evidence_code_ref to point to the fix site before fingerprint refresh."
```

### Step 7: Close out the loop-design (Option B recursive proof per amendment 5)

```
Tool: meta_state_patch
Payload:
  id: "loop-design-meta-state-patch-wire-format-recursion"
  entry_kind: "loop-design"
  patch: {
    status: "inactive",
    shipped_in_plan: "plans/260610-meta-state-patch-wire-format-recursion/",
    shipped_at: "2026-06-10T<current-timestamp>Z",
    addresses: []
  }

This is the recursive proof, EARNED (Option B per red-team amendment 5): the design that motivated the fix is now closed out via the very tool the design motivated, with a combined array + scalars patch. The `addresses: []` field exercises the unwrap path (`{item: []}` is the natural edge case) without adding real new fields to the registry. The registry round-trip (read-back of the entry after the patch) proves the fix works end-to-end.

Verify after: the registry shows the loop-design entry with `status: "inactive"`, `shipped_in_plan: "plans/260610-meta-state-patch-wire-format-recursion/"`, `shipped_at: <timestamp>`, AND `addresses: []` (flat empty array, NOT `{item: []}`).
```

### Step 8: Final validation

1. Run `pnpm test` — all 902 tests pass (898 baseline + 4 new from Phase 1)
2. Run `pnpm check` — validate records + extract index + tests all pass
3. Run the cold-session test explicitly: `node tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` (or whatever the project's cold-session test invocation is)
4. Read `meta-state.jsonl` (last 20 lines) to confirm the 8 mutations are present and in the expected order
5. Run `git status` to confirm:
   - `tools/learning-loop-mcp/tool-registry.js` is modified (Phase 2)
   - `tools/learning-loop-mcp/__tests__/wire-format-patch-recursion.test.js` is new (Phase 1)
   - `meta-state.jsonl` is modified (Phase 3, 8 lines added)
   - NO other files modified (especially `meta-state-patch-tool.js` and `core/gate-logic.js`)

### Step 9: Journal

Create `docs/journals/260610-meta-state-patch-wire-format-recursion-closeout.md` with:
- Summary: 1 paragraph describing what shipped and why
- Mutations applied: list of 8 registry mutations
- Test count: 902 pass
- Notable deviation from plan: any fallback used in Step 2 (propose_design vs log_change), and whether Test 1.5 passed
- Pre-existing unrelated issues: any

## Success Criteria

- [ ] All 902 tests pass (898 baseline + 4 new from Phase 1)
- [ ] `pnpm check` passes (validate records + extract index + tests)
- [ ] Cold-session test passes (the rule `rule-cold-session-test-must-pass-before-resolution` is satisfied)
- [ ] Finding #509 (`meta-260610T0115Z-...`) `evidence_code_ref` updated to `tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema` (via Step 2.5)
- [ ] Finding #509 (`meta-260610T0115Z-...`) status: `resolved`, `resolved_by: operator`
- [ ] Loop-design #508 (`loop-design-meta-state-patch-wire-format-recursion`) status: `inactive`, `shipped_in_plan: "plans/260610-meta-state-patch-wire-format-recursion/"`, `shipped_at: <current-timestamp>`, **AND `addresses: []` round-trips flat in the closeout patch** (Option B recursive proof)
- [ ] Loop-design `loop-design-schema-source-of-truth` exists with status `active` and ~200-char deferral paragraph (only if Test 1.5 passes; otherwise the deferral is filed via `meta_state_log_change` and a new finding is filed for the empty-array edge case)
- [ ] Change-log entry for the hot fix ship exists in `meta-state.jsonl` with `supersedes: "meta-20260609185059Z-..."` (formally corrects the stale change-target in change-log #510)
- [ ] `meta-state-patch-tool.js` is UNCHANGED
- [ ] `core/gate-logic.js` is UNCHANGED
- [ ] `MAX_RECURSION_DEPTH` in `tool-registry.js` is UNCHANGED (stays at 2; depth bump dropped)
- [ ] `git status` shows only the expected 3 file changes (2 from Phases 1+2, 1 from Phase 3)
- [ ] Journal entry created at `docs/journals/260610-meta-state-patch-wire-format-recursion-closeout.md`

## Risk Assessment

### Risk: F11 fingerprint sequence breaks (extended per amendment 6)

If Step 2.5 (evidence_code_ref patch) is skipped, Step 4 (refresh_fingerprint) hashes the wrong file (`meta-state-patch-tool.js#handler` instead of `tool-registry.js#coerceParamsToSchema`), and Step 5 (check_grounding) returns `drifted` against the wrong file. Step 6 (resolve) is then blocked by `rule-no-orphaned-evidence`.

**Mitigation:** the sequence is documented in this phase's step list. Steps 2.5 → 3 → 4 → 5 → 6 must happen in that order. Verify the fingerprint is fresh (Step 5 check_grounding returns "grounded") BEFORE Step 6. If Step 5 returns `drifted` after Step 4, the `evidence_code_ref` is still wrong — re-run Step 2.5 first, then re-run Step 4.

### Risk: Test 1.5 (pre-validation) fails at Phase 2

If empty arrays still wrap as `{item: []}` at Phase 2, Step 2 falls back to `meta_state_log_change` (canonical tool, no array shape issue). A new finding is filed for the empty-array edge case.

**Mitigation:** the Step 2 conditional logic in the Architecture section above handles both cases. Verify Test 1.5's outcome at Step 0 (pre-flight checks) before choosing the Step 2 mechanism. The fallback is `meta_state_log_change` + a new finding, NOT direct registry write (per red-team amendment 3 — the direct-write fallback is the same anti-pattern as `meta-260606T2102Z`).

### Risk: Step 7 (Option B recursive proof) fails with empty-array edge case

The combined patch in Step 7 includes `addresses: []` (empty array). If Test 1.5 failed (empty arrays still wrap as `{item: []}`), the Step 7 patch will hit the same bug and store `addresses: { item: [] }` in the registry.

**Mitigation:** if the registry shows `addresses: { item: [] }` after Step 7, the registry round-trip assertion fails. Fall back to a 2-call patch (one for scalars, one for the empty array) per the workaround used in plan 260609-adopt-instruction-layer. Document the split in the journal. Alternatively, drop `addresses: []` from the payload (loses the Option B proof; reverts to a smoke-test framing).

### Risk: Cold-session test fails after the change-log mutation

The cold-session test (`cold-session-discoverability.test.cjs`) checks that MCP tools are loaded into the agent's tool list. The change-log mutation does not affect tool loading.

**Mitigation:** if the cold-session test fails, the cause is unrelated to this plan (likely an environment issue, not a registry issue). Document the failure in the journal and do NOT block the plan on it.
