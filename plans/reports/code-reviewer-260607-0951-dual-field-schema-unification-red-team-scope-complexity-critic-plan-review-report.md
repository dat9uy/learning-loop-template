# Red Team Review: Dual-Field Schema Unification Plan

## Role: Scope & Complexity Critic + Contract Verifier
## Plan: plans/260607-dual-field-schema-unification/
## Date: 2026-06-07

---

## Finding 1: Zod union `.partial()` is not a function — `updateEntry` validation will crash

- **Severity:** Critical
- **Location:** Phase 5 (phase-05-4.md), "Modify `updateEntry`"
- **Flaw:** The plan proposes `metaStateEntrySchema.partial().safeParse(patch)` inside `updateEntry`. `metaStateEntrySchema` is a `z.union([...])`. Zod unions do not expose `.partial()`. Calling it throws `TypeError: union.partial is not a function`.
- **Failure scenario:** Every call to `updateEntry` after Phase 5 ships will crash the MCP server. `meta_state_ack`, `meta_state_resolve`, `meta_state_sweep`, `meta_state_refresh_fingerprint`, `meta_state_check_grounding`, `meta_state_promote_rule`, and the migration script all call `updateEntry`.
- **Evidence:** `tools/learning-loop-mcp/core/meta-state.js:152` defines `metaStateEntrySchema = z.union([...])`. Verified in Node REPL:
  ```
  const { z } = require('zod');
  const union = z.union([z.object({a: z.string()}), z.object({b: z.number()})]);
  union.partial(); // TypeError: union.partial is not a function
  ```
- **Suggested fix:** Use a dedicated patch schema: `z.object({}).passthrough()` for `updateEntry` (accepts any top-level field without stripping), or build a merged patch schema from the union branches. Do NOT use `.partial()` on a union.

---

## Finding 2: `metaStateEntrySchema` strips 7 real fields used in the registry

- **Severity:** Critical
- **Location:** Phase 5 (phase-05-4.md), "Modify `writeEntry`"
- **Flaw:** Zod `.object()` strips unknown keys by default. `metaStateEntrySchema` (the union) does not define `expires_at`, `acked_at`, `resolved_at`, `resolved_by`, `resolution`, `promoted_to_rule`, or `auto_resolve` — yet all 7 appear in actual `meta-state.jsonl` entries. If `writeEntry` validates with `metaStateEntrySchema.safeParse(entry)`, these fields are silently stripped.
- **Failure scenario:**
  - `metaStateReportTool` writes entries with `expires_at`, `acked_at`, `resolved_at`, `resolved_by` — all stripped.
  - `metaStatePromoteRuleTool` writes `promoted_to_rule` via `updateEntry` — stripped.
  - `metaStateResolveTool` writes `resolved_at`, `resolved_by`, `resolution` — stripped.
  - `metaStateAckTool` writes `acked_at`, `expires_at` — stripped.
  - Registry entries are corrupted on every write.
- **Evidence:**
  - `meta-state.jsonl` contains these fields: `acked_at`, `auto_resolve`, `expires_at`, `promoted_to_rule`, `resolution`, `resolved_at`, `resolved_by` (verified via Node scan of all 58 entries).
  - None of these fields appear in `metaStateFindingEntrySchema`, `metaStateChangeEntrySchema`, `metaStateRuleEntrySchema`, or `metaStateLoopDesignSchema` (verified via `grep` in `tools/learning-loop-mcp/core/meta-state.js`).
  - Verified in Node REPL: `metaStateFindingEntrySchema.safeParse({ ..., resolved_at: "...", resolved_by: "..." })` returns `success: true` but `data` omits both fields.
- **Suggested fix:** Add all 7 missing fields to `metaStateFindingEntrySchema` (and relevant fields to other schemas) BEFORE adding validation at `writeEntry`/`updateEntry`. Alternatively, add `.passthrough()` to all branch schemas so unknown keys are preserved.

---

## Finding 3: `checkResolutionEvidence` return contract mismatch

- **Severity:** Critical
- **Location:** Phase 7 (phase-07-6.md), "Modify `checkResolutionEvidence`"
- **Flaw:** The plan's new branch returns `{ resolved: false, reason: "orphaned_evidence", orphans: [...] }` and `{ resolved: true }`. But the existing function contract (consumed by `meta_state_resolve`) is `{ satisfied: true/false, rule_id, blocking_id, applies_to_resolution }`. `meta_state_resolve` checks `if (!evidence.satisfied)` at line 72.
- **Failure scenario:** When `meta_state_resolve` consults the new rule, `checkResolutionEvidence` returns `{ resolved: false, ... }`. `meta_state_resolve` reads `evidence.satisfied` which is `undefined` (falsy). It treats this as "not satisfied" and returns `{ resolved: false, reason: "resolution_evidence_required" }` — but the `reason` field is wrong, and the `orphans` array is lost in the response. The caller never sees the actual orphan list.
- **Evidence:**
  - `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js:71-72`:
    ```js
    const evidence = checkResolutionEvidence(rule, root);
    if (!evidence.satisfied) {
    ```
  - `tools/learning-loop-mcp/core/gate-logic.js:656-674` existing function returns `{ satisfied: true, rule_id }` and `{ satisfied: false, blocking_id, rule_id, applies_to_resolution }`.
  - Plan Phase 7 shows return shape `{ resolved: false, reason: "orphaned_evidence", orphans }`.
- **Suggested fix:** The new branch must return `{ satisfied: false, rule_id: "rule-no-orphaned-evidence", orphans, reason: "orphaned_evidence" }` (or restructure `meta_state_resolve` to handle both contracts).

---

## Finding 4: `meta_state_resolve` only consults rules matching `applies_to_resolution === id`

- **Severity:** High
- **Location:** Phase 7 (phase-07-6.md), "New consult-gate rule"
- **Flaw:** The plan's new rule `rule-no-orphaned-evidence` is intended to gate ALL resolutions of ungrounded findings. But `meta_state_resolve` only calls `checkResolutionEvidence` for rules where `rule.promoted_to_rule?.applies_to_resolution === id` (line 70). The plan's rule entry spec omits `applies_to_resolution` (or sets it to the finding id that originated the rule, not every finding). Therefore `meta_state_resolve` will NEVER consult this rule for any resolution.
- **Failure scenario:** The rule is created, tests pass, but `meta_state_resolve` never actually invokes it. Ungrounded findings continue to be resolved silently.
- **Evidence:**
  - `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js:68-71`:
    ```js
    for (const rule of rules) {
      if (rule.promoted_to_rule?.pattern_type !== "resolution-evidence-required") continue;
      if (rule.promoted_to_rule?.applies_to_resolution !== id) continue;
      const evidence = checkResolutionEvidence(rule, root);
    ```
  - Plan Phase 7 rule spec: `pattern: "meta-260607T0008Z-dual-field-schema-risk-..."` but `applies_to_resolution` is NOT listed in the required fields. `metaStateRuleEntrySchema` has `applies_to_resolution` as optional.
- **Suggested fix:** Either (a) set `applies_to_resolution` to a wildcard value and modify `meta_state_resolve` to match it, or (b) add a second consult-gate loop in `meta_state_resolve` for global rules (rules without `applies_to_resolution`), or (c) change the rule's pattern to be checked independently of `applies_to_resolution`.

---

## Finding 5: Wrong file path cited for refresh-fingerprint tool

- **Severity:** High
- **Location:** Plan.md "Related Code Files" line 23; Phase 3 (phase-03-2.md) "Verify no change"
- **Flaw:** The plan cites `tools/learning-loop-mcp/core/refresh-fingerprint.js` at line 51. The actual file is `tools/learning-loop-mcp/tools/meta-state-refresh-fingerprint-tool.js`. The plan also lists this as a "core" file but it's a "tool" file.
- **Failure scenario:** An implementer following the plan literally will look for a non-existent file. The legacy fallback chain audit will miss the actual tool.
- **Evidence:**
  - `grep -n "evidence_code_ref" tools/learning-loop-mcp/core/refresh-fingerprint.js` → `No such file or directory`.
  - `grep -n "evidence_code_ref" tools/learning-loop-mcp/tools/meta-state-refresh-fingerprint-tool.js` → line 51 has `entry.evidence_code_ref ?? entry.evidence?.code_ref`.
- **Suggested fix:** Update all references to `tools/learning-loop-mcp/tools/meta-state-refresh-fingerprint-tool.js`.

---

## Finding 6: `checkResolutionEvidence` needs restructuring before adding new branch

- **Severity:** High
- **Location:** Phase 7 (phase-07-6.md), "Modify `checkResolutionEvidence`"
- **Flaw:** The existing function starts with `const { pattern, applies_to_resolution, rule_id } = rule.promoted_to_rule;` (line 657). If the new branch is added AFTER this line, the destructuring runs for ALL rules (including the new one) and then the new branch is reached. The new branch's logic uses `rule.id === "rule-no-orphaned-evidence"` and ignores `pattern`, so the existing destructuring is harmless but the function's control flow is wrong: the new branch should be reached BEFORE the existing logic, or the function needs to be restructured with an if/else chain.
- **Failure scenario:** The plan says "Add a new branch" but doesn't specify WHERE in the function. If added naively after the existing code, the new rule will be processed by the existing `mcp-client-loading` logic first, which will look for a finding with `subtype === "mcp-client-loading"` and `session_id === "meta-260607T0008Z-..."` — which will never match, so it will always return `{ satisfied: true }`, and the new branch will never be reached.
- **Evidence:** `tools/learning-loop-mcp/core/gate-logic.js:656-674`.
- **Suggested fix:** Restructure `checkResolutionEvidence` to branch on `rule.id` or `rule.promoted_to_rule?.rule_id` before the existing destructuring.

---

## Finding 7: `metaStateProposeDesignTool` does not have evidence fields

- **Severity:** Medium
- **Location:** Phase 6 (phase-06-5.md), "Verify `metaStateProposeDesignTool` unchanged"
- **Flaw:** The plan states: "Verify `metaStateProposeDesignTool` and `metaStatePromoteRuleTool` are unchanged (they already use top-level)." `metaStateProposeDesignTool` does NOT have any evidence fields (`evidence_code_ref`, `evidence_journal`, `evidence_test`). It never has. The claim "they already use top-level" is misleading.
- **Failure scenario:** The implementer may waste time searching for evidence fields that don't exist. The verification step is trivial but the justification is false.
- **Evidence:** `tools/learning-loop-mcp/tools/meta-state-propose-design-tool.js` — no `evidence` references anywhere.
- **Suggested fix:** Change the plan text to: "Verify `metaStateProposeDesignTool` unchanged (loop-designs do not carry evidence fields)."

---

## Finding 8: `meta-state.test.js` does not exist

- **Severity:** Medium
- **Location:** Phase 5 (phase-05-4.md), "Modify `__tests__/meta-state.test.js`"
- **Flaw:** The plan references adding 4 tests to `__tests__/meta-state.test.js`. This file does not exist. There is no `meta-state.test.js` in the test directory.
- **Failure scenario:** The implementer will need to create a new file, but the plan doesn't mention file creation. The phase's "Related Code Files" section only lists "Modify" for this file.
- **Evidence:** `ls tools/learning-loop-mcp/__tests__/ | grep "meta-state"` — no `meta-state.test.js`.
- **Suggested fix:** Change to "Create: `tools/learning-loop-mcp/__tests__/meta-state-write-update.test.js`".

---

## Finding 9: `updateEntry` patches with `promoted_to_rule` would fail strict validation

- **Severity:** Medium
- **Location:** Phase 5 (phase-05-4.md), "Risk Assessment" section
- **Flaw:** The plan's risk assessment says: "those scripts use `updateEntry` (which validates patches), not `writeEntry` (which validates full entries). The patch shape `{ promoted_to_rule: "rule-id" }` is a valid `.partial()` for any of the 4 union branches." This is wrong. `promoted_to_rule` is NOT in any of the 4 branch schemas. If the validation uses `z.object({}).passthrough()` it would pass, but if it uses `.partial()` on the union (which doesn't work anyway), it would reject the patch.
- **Failure scenario:** Once validation is added, `metaStatePromoteRuleTool` would fail to promote findings because its `updateEntry` patch includes `promoted_to_rule` which is not in the schema.
- **Evidence:**
  - `tools/learning-loop-mcp/core/meta-state.js` — `promoted_to_rule` is not in `metaStateFindingEntrySchema`, `metaStateChangeEntrySchema`, `metaStateRuleEntrySchema`, or `metaStateLoopDesignSchema`.
  - `tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js:181` — `await updateEntry(root, id, { status: "active", promoted_to_rule: rule_id });`.
- **Suggested fix:** Add `promoted_to_rule: z.string().optional()` to `metaStateFindingEntrySchema` (or use a passthrough patch schema).

---

## Finding 10: `query-drift.test.js` does not have T-25..T-27

- **Severity:** Medium
- **Location:** Plan.md "Success Criteria" and Phase 7
- **Flaw:** The plan says "`query-drift.test.js` T-25..T-27: drift detection now covers all 30 previously-skipped entries". But `query-drift.test.js` only has 20 tests (T-1 through T-20). T-25..T-27 do not exist.
- **Failure scenario:** The success criteria references non-existent test numbers. The implementer may add 3 new tests but number them T-25..T-27, which would be confusing.
- **Evidence:** `grep -n "T-2[0-9]" tools/learning-loop-mcp/__tests__/query-drift.test.js` — only T-20 exists. No T-21+.
- **Suggested fix:** Update the success criteria to reference the actual test count (e.g., "3 new tests in `query-drift.test.js` covering previously-skipped entries").

---

## Summary

The plan has 3 critical issues (Zod union `.partial()`, schema stripping unknown keys, `checkResolutionEvidence` return contract) that will cause immediate runtime failures if implemented as written. The 4 high-priority issues (applies_to_resolution gap, wrong file path, function restructuring needs) will cause silent failures or implementation confusion. The 3 medium issues are factual inaccuracies that waste time.

**Bottom line:** The plan cannot be executed as written. It needs a schema completeness pass (add 7 missing fields), a Zod validation strategy redesign (no union `.partial()`), and a `checkResolutionEvidence` / `meta_state_resolve` integration redesign before any phase is safe to ship.

**Status:** DONE_WITH_CONCERNS
**Summary:** Plan has 3 critical and 4 high-severity issues that block safe implementation. Found Zod union `.partial()` crash, schema stripping 7 real fields, `checkResolutionEvidence` contract mismatch, and `applies_to_resolution` gap. All verified with grep/Node against actual codebase.
