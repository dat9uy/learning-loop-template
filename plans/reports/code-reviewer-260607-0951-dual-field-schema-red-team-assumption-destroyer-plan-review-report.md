## Code Review Summary: Plan 260607-dual-field-schema-unification — Red Team / Assumption Destroyer

**Scope:** Plan document + 7 phase files  
**Focus:** Factual claims against codebase, scope correctness, design feasibility  
**Scout findings:** 10 verified issues, 3 critical

---

## Finding 1: Phase 4 proposes `z.union().partial()`, which does not exist in Zod — validation code will crash
- **Severity:** Critical
- **Location:** Phase 4 (phase-05-4.md), section "Modify `updateEntry`"
- **Flaw:** The plan instructs `metaStateEntrySchema.partial().safeParse(patch)` inside `updateEntry`. `metaStateEntrySchema` is a `z.union([...])` (meta-state.js:152). Zod unions do not have a `.partial()` method. Verified empirically: `metaStateEntrySchema.partial()` throws `metaStateEntrySchema.partial is not a function`.
- **Failure scenario:** Any `updateEntry` call after this change will throw an unhandled exception, crashing the MCP server on every patch write (meta_state_resolve, meta_state_sweep, migration scripts, etc.).
- **Evidence:** `metaStateEntrySchema` is defined as `z.union([metaStateFindingEntrySchema, metaStateChangeEntrySchema, metaStateRuleEntrySchema, metaStateLoopDesignSchema])` at meta-state.js:152. `node -e "require('./tools/learning-loop-mcp/core/meta-state.js').metaStateEntrySchema.partial()"` throws `TypeError: metaStateEntrySchema.partial is not a function`.
- **Suggested fix:** Replace union `.partial()` with a dedicated patch schema (e.g., `z.object({}).passthrough()` or a shallow union of the 4 branch schemas’ `.partial()` shapes merged via `z.union([...]).or(...)`). Do not call `.partial()` on a `z.union()`.

---

## Finding 2: Phase 6 consult-gate rule `rule-no-orphaned-evidence` is wired to `applies_to_resolution` but is designed as a global gate — it will never fire for most resolutions
- **Severity:** Critical
- **Location:** Phase 6 (phase-07-6.md), section "Requirements" + "Implementation Steps"
- **Flaw:** The plan sets `applies_to_resolution: "meta-260607T0008Z-..."` (the finding id). The `metaStateResolveTool` handler (meta-state-resolve-tool.js:66-87) only calls `checkResolutionEvidence` for rules where `rule.promoted_to_rule.applies_to_resolution === id`. This means the rule is only consulted when resolving that *specific* finding. But the rule’s logic checks *all* active findings for orphaned evidence — it is architecturally a global gate. The plan never modifies `metaStateResolveTool` to handle global rules.
- **Failure scenario:** The rule is created and active, but `meta_state_resolve` on any finding other than the one in `applies_to_resolution` skips the rule entirely. The consult-gate is a no-op. The plan’s success criteria (“meta_state_resolve consults the new rule”) is false for the general case.
- **Evidence:** `metaStateResolveTool.handler` at meta-state-resolve-tool.js:68-70: `if (rule.promoted_to_rule?.applies_to_resolution !== id) continue;`. The plan’s rule has `applies_to_resolution` set to a specific finding id, not a wildcard.
- **Suggested fix:** Either (a) change `metaStateResolveTool` to also check rules where `applies_to_resolution` is missing/undefined (global rules), or (b) set `applies_to_resolution` to a sentinel value and handle it in `checkResolutionEvidence`. The plan must include a `metaStateResolveTool` modification step.

---

## Finding 3: `metaStateFindingEntrySchema` already contains `evidence_journal` and `evidence_test` top-level — Phase 3 claims to add fields that already exist
- **Severity:** High
- **Location:** Phase 2 (phase-03-2.md), section "Implementation Steps", step 2
- **Flaw:** The plan says "Modify `metaStateFindingEntrySchema`. Add 2 new top-level optional fields: `evidence_journal`, `evidence_test`. (Already has `evidence_code_ref`.)" But the schema at meta-state.js:36-38 already defines all three: `evidence_journal`, `evidence_code_ref`, `evidence_test`.
- **Failure scenario:** The implementer will attempt to add fields that already exist, resulting in a no-op or confusion. This undermines the plan’s credibility on schema accuracy and raises doubt about whether the plan author actually read the current schema.
- **Evidence:** meta-state.js:36 `evidence_journal: z.string().optional()`, :37 `evidence_code_ref: z.string().optional()`, :38 `evidence_test: z.string().optional()`.
- **Suggested fix:** Update the plan to state that `metaStateFindingEntrySchema` is already correct; no change needed. Only `metaStateChangeEntrySchema` and `metaStateRuleEntrySchema` require modification.

---

## Finding 4: Phase 1 T-3 test claims 4 of 4 union branches expose `evidence_code_ref`, but loop-design never gets it — Phase 2 success criteria falsely claims T-3 turns GREEN
- **Severity:** High
- **Location:** Phase 1 (phase-02-1.md), T-3 description + Phase 2 (phase-03-2.md) success criteria
- **Flaw:** The plan explicitly says `metaStateLoopDesignSchema` gets "no change (loop-designs don't have evidence)" (Phase 2, step 2). But T-3 asserts "4 of 4 union branches expose `evidence_code_ref` as a top-level field". After Phase 3, only 3 of 4 will expose it (finding, change-log, rule). Loop-design still won’t. The Phase 2 success criteria says "T-3 from Phase 1 turns GREEN" — impossible.
- **Failure scenario:** The RED→GREEN narrative is broken. T-3 will remain RED after Phase 3, causing confusion about whether the schema flatten is complete. The implementer may incorrectly add `evidence_code_ref` to loop-design to make the test pass, violating the plan’s own "loop-designs don't have evidence" decision.
- **Evidence:** Phase 2 step 2: "`metaStateLoopDesignSchema`: no change (loop-designs don't have evidence)." Phase 1 T-3: "4 of 4 union branches expose `evidence_code_ref` as a top-level field".
- **Suggested fix:** Rewrite T-3 to assert "3 of 4 union branches expose `evidence_code_ref`" and explicitly exempt loop-design. Or change the assertion to only check the 3 branches that should have it.

---

## Finding 5: Phase 4 references modifying `meta-state.test.js` but the file does not exist
- **Severity:** High
- **Location:** Phase 4 (phase-05-4.md), section "Related Code Files"
- **Flaw:** The plan lists "Modify: `tools/learning-loop-mcp/__tests__/meta-state.test.js` (4 new tests)". There is no `meta-state.test.js` in the test directory. The tests would need to be added to an existing file or a new file created.
- **Failure scenario:** The implementer will look for a non-existent file. If they create it, the test runner may not discover it (depending on naming conventions). If they add to an existing file, the plan’s explicit file reference is wrong.
- **Evidence:** `ls tools/learning-loop-mcp/__tests__/ | grep meta-state` shows 20 files, none named `meta-state.test.js`. Existing files include `meta-state-schema.test.js`, `meta-state-integration.test.js`, etc.
- **Suggested fix:** Create `meta-state-write-validation.test.js` (new file) or add the 4 tests to `meta-state-schema.test.js`.

---

## Finding 6: Phase 2 risk mitigation references `loop-introspect.test.js` but the file does not exist — the proposed regression guard is unplaceable
- **Severity:** High
- **Location:** Phase 2 (phase-03-2.md), Risk Assessment, first bullet
- **Flaw:** The risk mitigation says "add a unit test in `__tests__/loop-introspect.test.js` that asserts `summarize(entry)` returns top-level `evidence_code_ref`". No `loop-introspect.test.js` exists in the test directory. The test cannot be placed as described.
- **Failure scenario:** The implementer cannot follow the mitigation step. The risk (summarize silently reading nested form) is unguarded.
- **Evidence:** `ls tools/learning-loop-mcp/__tests__/ | grep loop-introspect` returns empty. `loop-introspect.js` itself (meta-state.js:357) does not include `evidence_code_ref` in `summarize`.
- **Suggested fix:** Create `loop-introspect.test.js` or add the test to `meta-state-schema.test.js` / `meta-state-list-compact.test.js`. Also, `summarize` currently does NOT include `evidence_code_ref` at all — the test would fail even after the migration. The plan should decide whether `summarize` should include it.

---

## Finding 7: Phase 6 `checkResolutionEvidence` return shape `{ resolved, reason, orphans }` mismatches `metaStateResolveTool` expectation of `{ satisfied, ... }`
- **Severity:** Medium
- **Location:** Phase 6 (phase-07-6.md), Implementation Steps, step 3
- **Flaw:** The plan’s new `checkResolutionEvidence` branch returns `{ resolved: false, reason: "orphaned_evidence", orphans: [...] }`. But the caller in `metaStateResolveTool` checks `if (!evidence.satisfied)` and spreads `...evidence` into the result. The returned object lacks `satisfied`, `rule_id`, `blocking_id`, and `applies_to_resolution` fields that the existing tests and the tool response shape expect. The `reason` will be silently overwritten to `"orphaned_evidence"`, which breaks test assertions that expect `"resolution_evidence_required"`.
- **Failure scenario:** Tests in `gate-resolution-evidence.test.js` that call `checkResolutionEvidence` directly will pass (T-A, T-B). But the `metaStateResolveTool` integration tests and the existing `meta-state-resolve-tool.test.js` may break because the response shape is different. The plan’s success criteria says "`meta_state_resolve` consults the new rule" but does not verify the response shape.
- **Evidence:** meta-state-resolve-tool.js:72: `if (!evidence.satisfied)`. The plan’s code snippet returns `resolved` not `satisfied`.
- **Suggested fix:** Return `{ satisfied: false, rule_id: "rule-no-orphaned-evidence", orphans, reason: "orphaned_evidence" }` (or similar) to match the existing contract. Update `metaStateResolveTool` to handle the new reason field if needed.

---

## Finding 8: Phase 4 validation with Zod default behavior silently strips unknown fields (like nested `evidence`) — does not actually reject them
- **Severity:** Medium
- **Location:** Phase 4 (phase-05-4.md), Requirements + Implementation Steps
- **Flaw:** The plan states that `writeEntry` and `updateEntry` validation will "catch divergence at the chokepoint". But Zod `.safeParse` on a `z.object()` schema strips unknown keys by default — it does not reject them. If a caller passes an entry with `evidence: { code_ref: "x" }` to `writeEntry`, the union schema will match the entry to the closest branch (e.g., finding), strip `evidence`, and return `success: true`. The nested data is silently lost, not rejected. The plan never mentions `.strict()` or `.passthrough()`.
- **Failure scenario:** A future writer tool (or a bug in a tool) could pass an entry with nested `evidence`. `writeEntry` would accept it, strip the `evidence` block, and write a corrupted entry (missing the evidence reference entirely). The validation would pass but the data would be lost.
- **Evidence:** Zod default behavior: `z.object({ a: z.string() }).safeParse({ a: "x", b: "y" })` returns `success: true` with `b` stripped. The plan does not mention `.strict()` on any schema.
- **Suggested fix:** Either add `.strict()` to all branch schemas (rejecting unknown fields) or add a pre-validation check that explicitly rejects `evidence` key presence. `.strict()` is a breaking change — test it carefully.

---

## Finding 9: Phase 4 migration script does not specify how to delete the `evidence` field via `updateEntry`
- **Severity:** Medium
- **Location:** Phase 3 (phase-04-3.md), Requirements + Implementation Steps
- **Flaw:** The plan says "If `entry.evidence` is now `{}` (no remaining fields): delete `entry.evidence`". But `updateEntry` (meta-state.js:254-260) uses `Object.assign(entry, cleanPatch)`. It does not delete properties. To remove `evidence`, the patch would need to contain `evidence: undefined`, which `JSON.stringify` will omit during serialization. The plan says "Construct the patch object (top-level fields + delete evidence if empty)" but never explicitly says to include `evidence: undefined` in the patch.
- **Failure scenario:** The migration script may leave `evidence: {}` in the registry entries, or fail to delete the field at all. The Phase 1 T-1 test ("0 entries carry nested `evidence.code_ref`") would still pass because `{}` has no `code_ref`, but the `evidence` block itself remains as dead weight.
- **Evidence:** meta-state.js:258: `Object.assign(entry, cleanPatch);` — no deletion logic.
- **Suggested fix:** Explicitly state in the implementation steps: if the nested evidence object is empty, include `evidence: undefined` in the patch. Verify `JSON.stringify` omits it.

---

## Finding 10: Phase 5 `metaStatePromoteRuleTool` does not use evidence fields — plan falsely claims it "already uses top-level fields"
- **Severity:** Medium
- **Location:** Phase 5 (phase-06-5.md), Requirements + Implementation Steps, step 3-4
- **Flaw:** The plan says "`metaStateProposeDesignTool` and `metaStatePromoteRuleTool`: verify (no code change). Both already use top-level fields." But `metaStatePromoteRuleTool` (meta-state-promote-rule-tool.js:163-176) constructs a rule entry with `id`, `entry_kind`, `origin`, `enforcement`, `pattern_type`, `pattern`, `scope_predicate`, `applies_to_resolution`, `description`, `status`, `promoted_at`, `promoted_by` — no evidence fields at all. It does not "already use top-level fields" because it does not use any evidence fields. The plan’s phrasing is misleading.
- **Failure scenario:** None directly — no code change is needed. But the plan’s verification step is vacuous. The implementer might incorrectly believe the tool already writes `evidence_code_ref` and skip adding it in a future enhancement.
- **Evidence:** meta-state-promote-rule-tool.js:163-176 — no `evidence_code_ref`, `evidence_journal`, or `evidence_test` in the entry construction.
- **Suggested fix:** Reword to: "`metaStateProposeDesignTool` and `metaStatePromoteRuleTool` do not write evidence fields (no change needed)."

---

## Unresolved Questions

1. The plan says Phase 1 T-1 counts "30 entries with nested `evidence.code_ref`". Verified: 30 entries have *only* nested form, 7 have both, 11 have top-level only. The plan’s count is correct but the exact definition ("carry nested" vs "carry only nested") should be explicit in the test.
2. `summarize()` in `loop-introspect.js` currently does not include `evidence_code_ref` at all. Should it? The plan does not address this.
3. The `cold-tier-regression.test.js` fixture will need to be regenerated after the migration (30 entries change shape). The plan mentions extending it with 2 new buckets but does not mention regenerating the baseline fixture.

---

**Status:** DONE_WITH_CONCERNS
**Summary:** The plan has 3 critical blockers (Zod union `.partial()` crash, consult-gate global scope mismatch, and non-existent test file references) and 2 high factual errors (finding schema already has the fields, T-3 test is impossible). The core diagnosis (30 nested entries, queryDrift skipping them) is correct, but the prescription has multiple execution-level bugs. Recommend fixing the plan before implementation.
