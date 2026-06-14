# Red Team Adjudication — Plan 260614-1259-phase-b-codegen-adoption

**Date:** 2026-06-14  
**Reviewers:** Security Adversary, Assumption Destroyer, Failure Mode Analyst  
**Total raw findings:** 29 (9 + 10 + 10)  
**After deduplication:** 11 findings  
**Evidence-filter failures:** 0

---

## Adjudication Summary

| Severity | Count | Accepted | Rejected |
|----------|-------|----------|----------|
| Critical | 4 | 4 | 0 |
| High | 6 | 6 | 0 |
| Medium | 1 | 1 | 0 |
| **Total** | **11** | **11** | **0** |

All 11 deduplicated findings pass the evidence filter (each cites at least one `file:line` and was verified against the actual codebase).

---

## Red Team Findings

### Finding 1: Phase 2 `z.intersection` breaks wire-format coercion — Critical
**Reviewer:** Security Adversary, Failure Mode Analyst, Assumption Destroyer  
**Location:** Phase 2, Architecture section  
**Flaw:** `buildPatchSchemaFor` currently returns a plain `ZodObject` (`metaState<Kind>EntrySchema.partial().strict()`). The plan changes it to `z.intersection(strict, SCRIPT_CALLER_PATCH_FIELDS)`. `coerceParamsToSchema` in `tool-registry.js:78-80` accesses `schema.shape` and only recurses into `ZodObject`; `ZodIntersection` has no `.shape` and is not unwrapped by `unwrapTypeName` (`tool-registry.js:6-22`). Nested array/boolean fields inside `patch` will no longer be coerced, regressing the B2 wire-format fix.  
**Failure scenario:** A stdio caller sends `patch: { reopens: "[\"old-id\"]" }`. With `z.intersection`, `coerceParamsToSchema` cannot introspect the patch shape, leaves the string uncoerced, and `.strict()` rejects it.  
**Evidence:** `tool-registry.js:78-80` (`const shape = schema.shape || schema`), `tool-registry.js:6-22` (no `ZodIntersection` branch), `tool-registry.js:124-134` (recursion gated on `ZodObject`), node verification: `z.intersection(...).shape === undefined`.  
**Disposition:** Accept  
**Rationale:** Verified empirically. This would break stdio round-trips for all patch fields, not just the 3 script-caller fields.

---

### Finding 2: Phase 2 `z.intersection` with `.strict()` rejects legitimate patch fields — Critical
**Reviewer:** Security Adversary  
**Location:** Phase 2, Risk Assessment re-evaluation (lines 156-166)  
**Flaw:** The plan re-evaluates the typo risk and switches `SCRIPT_CALLER_PATCH_FIELDS` from `.passthrough()` to `.strict()`. With two `.strict()` schemas in `z.intersection`, any field must be present in BOTH schemas to be accepted. A normal finding patch such as `{ status: "resolved" }` is accepted by the per-kind schema but rejected by the 3-field script-caller schema.  
**Failure scenario:** `meta_state_patch({ id, entry_kind: "finding", patch: { status: "resolved" } })` fails because `status` is unknown to `SCRIPT_CALLER_PATCH_FIELDS.strict()`. The patch tool becomes unusable for normal patches.  
**Evidence:** Node verification: `z.intersection(z.object({x:z.string()}).strict(), z.object({y:z.boolean()}).strict()).safeParse({x:"a"})` returns `success: false`. Plan text at Phase 2 line 156 contradicts line 162.  
**Disposition:** Accept  
**Rationale:** Verified empirically. The `.strict()` re-evaluation makes the intersection unusable regardless of the coercion issue.

---

### Finding 3: `meta_state_promote_rule` is NOT a genuine codegen candidate — Critical
**Reviewer:** Assumption Destroyer, Failure Mode Analyst  
**Location:** Phase 1, B3 Audit table + Step 2  
**Flaw:** The tool schema (`meta-state-promote-rule-tool.js:25-33`) includes `id` (source finding id), `rule_id`, `enforcement`, `pattern_type`, `pattern`, `scope_predicate`, `preview`, `sample_commands`, `sample_paths`. Only `rule_id`, `enforcement`, `pattern_type`, `pattern`, `scope_predicate` overlap with `metaStateRuleEntrySchema`. `id` is the source finding id, not the rule entry id; `preview`, `sample_commands`, `sample_paths` are preview-mode parameters not stored on the entry. The handler constructs a new rule entry internally.  
**Failure scenario:** Replacing the schema with `metaStateRuleEntrySchema.shape` drops `preview`, `sample_commands`, `sample_paths`, and mislabels the finding id as the rule id. Preview mode and rule promotion break.  
**Evidence:** `meta-state-promote-rule-tool.js:25-33`, `meta-state-promote-rule-tool.js:158-171` (handler builds `ruleEntry`), `core/meta-state.js:164-197` (rule entry schema has no `preview`/`sample_*`).  
**Disposition:** Accept  
**Rationale:** The tool schema is inherently tool-specific. Migration is not a refactor; it changes behavior.

---

### Finding 4: `meta_state_batch` migration is mis-scoped and should be deferred — Critical
**Reviewer:** All three reviewers  
**Location:** Phase 1, B3 Audit table + Step 4  
**Flaw:** The batch tool uses a `z.discriminatedUnion` where `write` ops accept `z.record(z.string(), z.unknown())` and `update` ops use `.passthrough()` (`meta-state-batch-tool.js:8-28`). Validation is deferred to the handler (`core/meta-state.js:512`). The plan's proposed `buildOpSchemaFor` helper would replace loose pre-filters with strict per-kind `ZodObject` schemas, breaking existing callers and the discriminated-union structure.  
**Failure scenario:** A caller sends an `update` op with a field not in the per-kind schema. The current `.passthrough()` accepts it; the strict schema would reject it. Existing batch scripts break.  
**Evidence:** `meta-state-batch-tool.js:8-28`, `core/meta-state.js:510-527` (handler validates `write` entries, `update` uses `Object.assign`).  
**Disposition:** Accept  
**Rationale:** The batch tool's loose schema is intentional. Migration requires redesign, not a helper.

---

### Finding 5: `meta_state_log_change` `.shape` swap exposes handler-generated fields — High
**Reviewer:** All three reviewers  
**Location:** Phase 1, B3 Audit table + Step 1  
**Flaw:** The tool schema (`meta-state-log-change-tool.js:44-71`) exposes 9 caller-provided fields. The entry schema (`core/meta-state.js:117-158`) adds `id`, `entry_kind`, `status`, `created_at`, `version`, `expires_at`, `affected_system`, `code_ref`, `ledger_ref` — all generated by the handler (`meta-state-log-change-tool.js:101-116`). Using raw `.shape` would expose these as MCP parameters that callers can specify but the handler ignores.  
**Failure scenario:** A caller passes `id: "custom-id"`. The schema accepts it but the handler overwrites it with `generateId(slugify(change_target))`. The caller receives an unexpected id, breaking downstream references.  
**Evidence:** `meta-state-log-change-tool.js:44-71`, `meta-state-log-change-tool.js:98-116`, `core/meta-state.js:117-158`.  
**Disposition:** Accept  
**Rationale:** Raw `.shape` is not a drop-in replacement. Must use `.pick()`/`.omit()` to expose only caller-provided fields, or reclassify as partial candidate.

---

### Finding 6: `meta_state_propose_design` `.shape` swap drops `loop_design_id` and widens `affected_system` — High
**Reviewer:** Assumption Destroyer, Failure Mode Analyst  
**Location:** Phase 1, B3 Audit table + Step 3  
**Flaw:** The tool schema includes `loop_design_id` (`meta-state-propose-design-tool.js:37`) which is NOT in `metaStateLoopDesignSchema`. The handler uses it to allow explicit ids. The tool's `affected_system` enum has 6 values; the entry schema's enum has 15 values. Raw `.shape` would drop `loop_design_id` and widen accepted `affected_system` values.  
**Failure scenario:** A caller passes `loop_design_id: "loop-design-my-feature"`. The migrated schema rejects it. Operators lose the explicit-id workflow. Alternatively, `affected_system: "web"` is accepted after migration but rejected before — a behavioral change.  
**Evidence:** `meta-state-propose-design-tool.js:24-39`, `meta-state-propose-design-tool.js:101`, `core/meta-state.js:14-29` (15-value enum), `core/meta-state.js:203-225` (entry schema uses 15-value enum).  
**Disposition:** Accept  
**Rationale:** Tool schema and entry schema diverge by design. Raw `.shape` breaks the tool contract.

---

### Finding 7: `meta_state_resolve` partial projection would drop `cascade_from` — High
**Reviewer:** Failure Mode Analyst  
**Location:** Phase 1, Step 5 (optional)  
**Flaw:** The tool schema includes `cascade_from: z.array(z.string()).optional()` (`meta-state-resolve-tool.js:22-23`). This field is not in `metaStateFindingEntrySchema`. A `.pick()` projection from the finding schema would drop it, breaking cascade-close workflows.  
**Failure scenario:** An operator calls `meta_state_resolve` with `cascade_from: ["child-id"]` to close a stale parent. The migrated schema rejects the field; the cascade feature fails.  
**Evidence:** `meta-state-resolve-tool.js:18-24`, `meta-state-resolve-tool.js:128`, `core/meta-state.js:56-111` (no `cascade_from`).  
**Disposition:** Accept  
**Rationale:** Tool-level field required for cascade behavior. Minimal schema size makes migration value negligible.

---

### Finding 8: `meta_state_supersede` partial projection would drop `_expected_version` — High
**Reviewer:** Failure Mode Analyst  
**Location:** Phase 1, Step 5 (optional)  
**Flaw:** The tool schema includes `_expected_version: z.number().optional()` (`meta-state-supersede-tool.js:13-14`). This CAS field is not in `metaStateFindingEntrySchema`. A `.pick()` projection would drop it, breaking CAS safety for supersede operations.  
**Failure scenario:** Concurrent supersede calls race without `_expected_version` detection. One silently overwrites the other.  
**Evidence:** `meta-state-supersede-tool.js:10-15`, `meta-state-supersede-tool.js:42-58`, `core/meta-state.js:56-111` (no `_expected_version`).  
**Disposition:** Accept  
**Rationale:** CAS field is load-bearing. Schema is already minimal; migration is YAGNI.

---

### Finding 9: `meta_state_report` `.shape` pattern is mischaracterized as "simplest" — High
**Reviewer:** Failure Mode Analyst  
**Location:** Phase 1, Architecture section "Full-shape pattern"  
**Flaw:** The plan cites `meta_state_report` as a simple `.shape` pattern. However, the handler (`meta-state-report-tool.js:14-105`) does not pass all `.shape` fields through; it strips/transforms `mechanism_check`, `status`, `created_at`, `expires_at`, `acked_at`, `resolved_at`, `resolved_by`, etc. The pattern works for `meta_state_report` only because its handler consumes most entry fields directly. Other tools construct entries internally and cannot use raw `.shape`.  
**Failure scenario:** An implementer copies the `meta_state_report` pattern for `meta_state_log_change`, exposing ignored parameters and creating a misleading MCP surface.  
**Evidence:** `meta-state-report-tool.js:13-105`, especially lines 35-81 (handler constructs entry with internal defaults).  
**Disposition:** Accept  
**Rationale:** The pattern reference is misleading. The Architecture section must caveat that `.shape` tools require handler-side filtering and that entry-constructing tools need `.pick()`/`.omit()`.

---

### Finding 10: "864-test baseline" is stale — High
**Reviewer:** Assumption Destroyer, Failure Mode Analyst  
**Location:** Phase 1 Requirements, Step 6, Success Criteria; Phase 2 Success Criteria  
**Flaw:** The plan repeatedly references an "864-test baseline" verified 2026-06-13. Current `pnpm test` output is 870 pass / 1 skip / 103 suites. The baseline number is incorrect, making success criteria unverifiable.  
**Failure scenario:** Implementer sees 871 tests total, cannot tell whether the +7 delta is pre-existing drift or migration regression. The "864+ tests" gate becomes a moving target.  
**Evidence:** `pnpm test` output: `tests 871, suites 103, pass 870, fail 0, skipped 1`.  
**Disposition:** Accept  
**Rationale:** Verified by running tests. All references should be updated to the actual current count.

---

### Finding 11: B6 loop-design flip has unhandled CAS race — Medium
**Reviewer:** Failure Mode Analyst, Security Adversary  
**Location:** Phase 3, Step 2  
**Flaw:** The plan recommends using `_expected_version` from a prior `meta_state_list` call but provides no retry loop. Between list and patch, another process could mutate the entry, causing `version_mismatch`. The plan says "auto-capture is the default" while also saying "explicit is safer" — contradictory guidance.  
**Failure scenario:** A concurrent registry mutation bumps the version. The flip returns `{ patched: false, reason: "version_mismatch" }`. Step 3 (audit trail + tracker update) proceeds without verifying success, leaving the loop-design active while the tracker claims it is inactive.  
**Evidence:** `phase-03-b6-loop-design-flip.md:72-75`, `meta-state-patch-tool.js:79-98` (returns `version_mismatch` with current version).  
**Disposition:** Accept  
**Rationale:** Low-probability but high-impact metadata drift. Plan should either specify exact retry loop or rely on auto-capture consistently.

---

## Additional Observation (Not a Reviewer Finding)

### Observation A: Phase 2 LIM-2 bug description may be inaccurate
**Location:** Phase 2, Overview + Requirements  
**Observation:** The plan states that `mechanism_check` and `code_fingerprint` are "script-caller-only (not part of the entry's stored shape)." However, `metaStateFindingEntrySchema` already includes both fields (`core/meta-state.js:87-90`). For finding patches, `buildPatchSchemaFor('finding')` already accepts them inside `patch`. Additionally, `code_fingerprint` is in `IMMUTABLE_PATCH_FIELDS` (`meta-state-patch-tool.js:15`), so the handler rejects it even if the schema accepts it.  
**Disposition:** Flagged for planner verification. The LIM-2 bug should be re-triaged before implementation.

---

## Whole-Plan Consistency Notes

The accepted findings imply these decision deltas that must be propagated across all plan files:

1. **Phase 2 design changes:** Remove `z.intersection`; replace with a coercion-safe approach (e.g., tool-level fields, `.merge()`, or adding script-caller fields to per-kind schemas if appropriate). Update Phase 2 Architecture, Implementation Steps, Risk Assessment, and Success Criteria.
2. **Phase 1 candidate list shrinks:** `meta_state_promote_rule`, `meta_state_batch`, `meta_state_resolve`, `meta_state_supersede` → NOT candidates. `meta_state_log_change` → partial candidate with `.pick()`/`.omit()`. `meta_state_propose_design` → partial candidate with `.merge({ loop_design_id })` and narrowed `affected_system`, or NOT candidate.
3. **Test baseline:** Replace all "864+" references with actual count (870 pass / 1 skip) and add Step 0 pre-flight to record current count.
4. **Pattern reference:** Update Architecture section to clarify that `.shape` is only safe when the handler consumes the fields directly; entry-constructing tools need projections.
5. **Phase 3 CAS:** Add explicit retry loop or consistently rely on auto-capture.
6. **B1+B2 plan status:** Parent plan `plans/260613-1853-phase-b-bridge-5-core-fix/plan.md` shows `status: pending` while phase files are `completed`. Should be reconciled.

---

## Proposed Next Step

Apply the 11 accepted findings to the plan files, then run a whole-plan consistency sweep before presenting the revised plan for approval.
