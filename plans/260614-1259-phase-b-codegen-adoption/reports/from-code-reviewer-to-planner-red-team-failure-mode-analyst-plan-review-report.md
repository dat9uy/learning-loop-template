# Red-Team Failure-Mode Analysis — Plan Review Report

**Plan:** 260614-1259-phase-b-codegen-adoption (B3-B6)
**Reviewer Role:** Flow Tracer (verify behavioral claims by tracing code paths)
**Date:** 2026-06-14
**Status:** DONE_WITH_CONCERNS

---

## Finding 1: `metaStatePromoteRuleTool` schema is NOT a subset of `metaStateRuleEntrySchema.shape` — naive `.shape` swap will break the tool

- **Severity:** Critical
- **Location:** Phase 1, B3 Audit table row `meta_state_promote_rule`, and Architecture section "Full-shape pattern"
- **Flaw:** The plan claims `meta_state_promote_rule` can migrate to `schema: metaStateRuleEntrySchema.shape` with tool-level fields (`pattern_type`, `pattern`) stripped. But the tool's schema has `id`, `rule_id`, `enforcement`, `pattern_type`, `pattern`, `scope_predicate`, `preview`, `sample_commands`, `sample_paths` — only `rule_id`, `enforcement`, `pattern_type`, `pattern`, `scope_predicate` overlap with `metaStateRuleEntrySchema`. The fields `id` (finding to promote), `preview`, `sample_commands`, `sample_paths` are tool-level and NOT in the entry schema. The handler uses `id` to look up the source finding, then writes a NEW rule entry with `rule_id` as its id. The tool's `id` parameter is the source finding id, not the rule entry id. Swapping to `.shape` would either (a) require the tool to accept a full rule entry shape (nonsensical — the caller doesn't provide `origin`, `promoted_at`, etc.) or (b) silently drop required tool-level fields.
- **Failure scenario:** After migration, the tool schema no longer accepts `preview`, `sample_commands`, `sample_paths`, or `id` (as currently used). The MCP server rejects valid calls. The tool becomes unusable for operator preview workflows. The `id` field collision (finding id vs rule id) causes the handler to receive the wrong id type.
- **Evidence:** `tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js:25-33` shows 9 schema fields. `tools/learning-loop-mcp/core/meta-state.js:164-197` shows `metaStateRuleEntrySchema` has `id` (regex `rule-[a-z0-9-]+`), `origin`, `enforcement`, `pattern_type`, `pattern`, `scope_predicate`, `applies_to_resolution`, `supersedes`, `description`, `status`, `promoted_at`, `promoted_by`, etc. There is NO `preview`, `sample_commands`, `sample_paths`, `id` (as finding id). The handler at line 35 uses `id` as the finding to promote, then constructs `ruleEntry` with `id: rule_id` (line 159). The plan's "AFTER" snippet at Phase 1 Architecture shows `schema: metaStateRuleEntrySchema.shape` with no `.merge()` for tool-level fields.
- **Suggested fix:** Reclassify `meta_state_promote_rule` as **NOT a candidate** in the audit. The tool creates a derived entry from a source finding plus operator-provided parameters; its schema is inherently tool-specific. Document this explicitly. Do NOT attempt migration.

---

## Finding 2: `metaStateLogChangeTool` schema accepts `id` as optional in entry schema but tool generates it internally — `.shape` swap creates a mismatch in caller contract

- **Severity:** High
- **Location:** Phase 1, B3 Audit table row `meta_state_log_change`, Step 1
- **Flaw:** The plan claims `meta_state_log_change` can use `schema: metaStateChangeEntrySchema.shape` with "no tool-level fields to strip." But the tool's hand-written schema at lines 44-71 does NOT include `id` (the tool generates it at line 98 via `generateId(slugify(change_target))`). The entry schema at `core/meta-state.js:118` has `id: z.string().optional()`. If the tool schema becomes `.shape`, the MCP surface will expose `id` as an optional parameter. Callers may pass it, but the handler ignores it (line 98 overwrites). More critically, the entry schema also includes `entry_kind: z.literal("change-log")` (line 119), `status: z.literal("active").default("active")` (line 153), `created_at: z.string()` (line 154), `version: z.number().default(0)` (line 155) — all of which the handler sets internally. Exposing these as tool-level parameters is misleading and may cause confusion. The `.shape` pattern used by `meta_state_report` works because that tool's handler consumes the fields directly; `meta_state_log_change`'s handler constructs the entry object internally.
- **Failure scenario:** A caller passes `id: "custom-id"` via the MCP tool call. The schema accepts it (it's `.optional()` in the entry schema). The handler silently ignores it and generates a different id. The caller receives an entry with an unexpected id, breaking any downstream reference they intended to make. Similarly, `entry_kind`, `status`, `created_at`, `version` become visible parameters that the handler overwrites, creating a false contract.
- **Evidence:** `tools/learning-loop-mcp/tools/meta-state-log-change-tool.js:44-71` (hand-written schema has no `id`, `entry_kind`, `status`, `created_at`, `version`). `tools/learning-loop-mcp/tools/meta-state-log-change-tool.js:98-116` (handler generates `id`, `entry_kind`, `status`, `created_at`, `version` internally). `tools/learning-loop-mcp/core/meta-state.js:117-158` (entry schema includes all these fields). `tools/learning-loop-mcp/tools/meta-state-report-tool.js:13` (the `.shape` pattern reference — but `meta_state_report`'s handler DOES consume the fields directly from args, unlike `meta_state_log_change`).
- **Suggested fix:** For `meta_state_log_change`, use `.pick()` or `.omit()` to create a projection that only exposes caller-provided fields (`change_dimension`, `change_target`, `change_diff`, `reason`, `applies_to`, `supersedes`, `consolidates`, `evidence_code_ref`, `evidence_journal`). Do NOT use raw `.shape`. Or reclassify as partial-projection candidate with explicit field list. Update the parity test to assert the projected schema, not the full entry schema.

---

## Finding 3: `metaStateProposeDesignTool` schema has `loop_design_id` tool-level field not in entry schema — `.shape` swap drops it

- **Severity:** High
- **Location:** Phase 1, B3 Audit table row `meta_state_propose_design`, Step 3
- **Flaw:** The plan claims `meta_state_propose_design` can migrate to `schema: metaStateLoopDesignSchema.shape`. But the tool's schema at line 37 has `loop_design_id: z.string().optional()` — a tool-level parameter that lets the caller specify an explicit id. The entry schema at `core/meta-state.js:203-225` has `id: z.string()` but no `loop_design_id`. The handler at line 101 uses `loop_design_id || generated_id` to decide the entry id. If the schema becomes raw `.shape`, the `loop_design_id` parameter disappears from the MCP surface, breaking the explicit-id workflow.
- **Failure scenario:** Operator calls `meta_state_propose_design` with `loop_design_id: "loop-design-my-feature"`. After migration, the schema rejects this field (`.strict()` is not in the tool schema, but the field simply isn't in `.shape`). The call fails. The operator cannot propose designs with stable ids.
- **Evidence:** `tools/learning-loop-mcp/tools/meta-state-propose-design-tool.js:37` (`loop_design_id` in schema). `tools/learning-loop-mcp/core/meta-state.js:203-225` (no `loop_design_id` in entry schema). Handler at line 101 uses `loop_design_id`.
- **Suggested fix:** Use `.merge({ loop_design_id: z.string().optional() })` or `.pick()` + `.merge()`. Do NOT use raw `.shape`. Update the parity test to include `loop_design_id` in the expected shape.

---

## Finding 4: `z.intersection` is NOT used anywhere in the codebase — `unwrapTypeName` in wire-format coercion will fail to introspect it

- **Severity:** Critical
- **Location:** Phase 2, Architecture section "The fix — z.intersection"
- **Flaw:** The B5 fix proposes `z.intersection(strict, SCRIPT_CALLER_PATCH_FIELDS)` as the return value of `buildPatchSchemaFor`. However, the wire-format coercion helper `coerceParamsToSchema` in `tool-registry.js` relies on `unwrapTypeName` to determine how to coerce values. `unwrapTypeName` at line 6-22 handles `ZodOptional`, `ZodNullable`, `ZodDefault`, `ZodEffects`, `ZodTransform`, `ZodLazy` — but NOT `ZodIntersection`. When `coerceParamsToSchema` encounters a `patch` field whose schema is a `ZodIntersection`, `unwrapTypeName` will return `"ZodIntersection"`, which `coerceValue` does not handle (line 24+ only handles `ZodArray`, `ZodBoolean`, `ZodNumber`, `ZodString`, `ZodEnum`, `ZodLiteral`, `ZodObject`). The nested recursion at line 124-134 checks `typeName === "ZodObject"` — `ZodIntersection` will be skipped. This means arrays inside the `patch` object (e.g., `reopens`, `proposed_design_for`) will NOT have wire-format coercion applied when the patch schema is an intersection. This is a regression from B2 where `buildPatchSchemaFor` returned a plain `ZodObject` (via `.partial().strict()`), which `unwrapTypeName` resolves to `"ZodObject"`.
- **Failure scenario:** A script caller passes `patch: { reopens: "[\"old-id\"]" }` (stringified JSON array via stdio). With B2's plain `ZodObject`, `coerceParamsToSchema` sees `typeName === "ZodObject"`, recurses into the patch object, finds `reopens` with `typeName === "ZodArray"`, and coerces the string to an array. With B5's `ZodIntersection`, `unwrapTypeName` returns `"ZodIntersection"`, the recursion skips the patch object entirely, the string `"[\"old-id\"]"` remains a string, and `buildPatchSchemaFor`'s `.strict()` rejects it as wrong type. The patch fails for all array fields passed via stdio.
- **Evidence:** `tools/learning-loop-mcp/tool-registry.js:6-22` (`unwrapTypeName` — no `ZodIntersection` handling). `tools/learning-loop-mcp/tool-registry.js:78-136` (`coerceParamsToSchema` — recursion only for `ZodObject`). `tools/learning-loop-mcp/tool-registry.js:124-134` (nested recursion gated on `typeName === "ZodObject"`). `tools/learning-loop-mcp/core/meta-state.js:269-280` (B2 `buildPatchSchemaFor` returns plain `ZodObject`). No `z.intersection` usage anywhere in codebase (grep returned empty).
- **Suggested fix:** Either (a) add `ZodIntersection` handling to `unwrapTypeName` and `coerceParamsToSchema` before B5 ships, or (b) abandon `z.intersection` and use `.merge()` instead (`.merge()` returns a `ZodObject`, which the coercion pipeline already handles). Option (b) is safer: `return strict.merge(SCRIPT_CALLER_PATCH_FIELDS)` instead of `z.intersection(strict, ...)`. Verify with the B2 stdio regression tests before committing.

---

## Finding 5: `meta_state_batch` op schema uses `z.discriminatedUnion` with `z.record(z.string(), z.unknown())` for `write` ops — codegen would require replacing the entire discriminated union, not just per-op schemas

- **Severity:** High
- **Location:** Phase 1, B3 Audit table row `meta_state_batch`, Step 4
- **Flaw:** The plan proposes per-op derived schemas for `meta_state_batch` via a new `buildOpSchemaFor` helper. But the current batch tool at `meta-state-batch-tool.js:8-28` uses `z.discriminatedUnion("op", [...])` where the `write` op has `entry: z.record(z.string(), z.unknown())` (passthrough record), and `update` uses `.passthrough()`. The plan's `buildOpSchemaFor` would return `metaState<Kind>EntrySchema.shape` for `write` ops, but this is a `ZodObject`, not a `z.record()`. Replacing the `write` op schema with a strict `ZodObject` would break callers who pass extra fields (the `.passthrough()` on `update` suggests the batch tool is intentionally loose). More critically, the `metaStateBatch` function in `core/meta-state.js` at line 512 validates `op.entry` against `metaStateEntrySchema` — the batch tool's schema is a PRE-FILTER, not the final validator. Making the pre-filter strict could reject valid entries that the downstream validator would accept (e.g., entries with extra fields that `metaStateEntrySchema` ignores via `.passthrough()` — wait, `metaStateEntrySchema` is a union, not passthrough). The plan does not address how the discriminated union's `write` branch changes from `z.record()` to `ZodObject`, or how this affects the `.passthrough()` on `update` ops.
- **Failure scenario:** A caller passes a `write` op with an entry that has a field not in `metaState<Kind>EntrySchema.shape` but accepted by `metaStateEntrySchema` (e.g., a future field added to the union but not yet to the per-kind schema — though this shouldn't happen by design). More realistically, the strict `ZodObject` rejects fields that the current `z.record()` accepts, breaking existing batch scripts. The `update` op's `.passthrough()` is also inconsistent with the new strict approach.
- **Evidence:** `tools/learning-loop-mcp/tools/meta-state-batch-tool.js:8-28` (current op schema with `z.record()` and `.passthrough()`). `tools/learning-loop-mcp/core/meta-state.js:512` (`metaStateBatch` validates against `metaStateEntrySchema`). The plan's Step 4 says "`write` ops derive from per-kind full schema (no existing helper)" but does not explain how a `ZodObject` replaces `z.record()` in a discriminated union.
- **Suggested fix:** Reclassify `meta_state_batch` as **NOT a candidate** or **defer to Bridge 7**. The batch tool's op schemas are intentionally loose pre-filters; tightening them risks breaking batch scripts. If migrated, the `write` op must use a union of per-kind schemas (not a single shape), and the discriminated union structure must be preserved. The plan's `buildOpSchemaFor` helper is insufficient — it needs to return a `z.discriminatedUnion` or the batch tool needs a complete rewrite of its op schema construction. This is too complex for a "~1.5h" step.

---

## Finding 6: `metaStateSupersedeTool` schema has `_expected_version` tool-level field not in `metaStateFindingEntrySchema` — `.pick()` projection must include it

- **Severity:** Medium
- **Location:** Phase 1, B3 Audit table row `meta_state_supersede`, Step 5
- **Flaw:** The plan classifies `meta_state_supersede` as a "partial projection" candidate using `.pick(...)` from `metaStateChangeEntrySchema` (actually it should be `metaStateFindingEntrySchema` since supersede operates on findings). But the tool's schema at line 10-15 has `id`, `consolidated_into`, `resolution`, `_expected_version`. The `_expected_version` field is NOT in `metaStateFindingEntrySchema` (it's a CAS tool-level field). The plan says "partial projection; only if it provides codegen benefit" but doesn't account for the `_expected_version` field. If `.pick()` is used, `_expected_version` must be merged in. The handler at line 42 uses `_expected_version` for CAS. Without it in the schema, the tool loses CAS safety.
- **Failure scenario:** After migration, the schema no longer accepts `_expected_version`. The handler receives it as an unknown field (if `.strict()` is used) or it disappears (if `.pick()` excludes it). CAS version checks break. Concurrent supersede calls race without detection.
- **Evidence:** `tools/learning-loop-mcp/tools/meta-state-supersede-tool.js:10-15` (schema includes `_expected_version`). `tools/learning-loop-mcp/core/meta-state.js:56-111` (`metaStateFindingEntrySchema` has no `_expected_version`). Handler at line 42 uses `_expected_version`.
- **Suggested fix:** If migrating, use `.pick(['id', 'consolidated_into', 'resolution']).merge({ _expected_version: z.number().optional() })`. But given the minimal benefit (4-field schema → 4-field schema with `.pick()` + `.merge()`), reclassify as **NOT a candidate** — the hand-written schema is already optimal. Document this in the audit.

---

## Finding 7: `metaStateResolveTool` schema has `cascade_from` tool-level field not in `metaStateFindingEntrySchema` — `.pick()` would drop it

- **Severity:** Medium
- **Location:** Phase 1, B3 Audit table row `meta_state_resolve`, Step 5
- **Flaw:** The plan classifies `meta_state_resolve` as a "partial projection" candidate. The tool's schema at lines 18-24 has `id`, `resolution`, `resolved_by`, `cascade_from`. The `cascade_from` field is NOT in `metaStateFindingEntrySchema` (it's a tool-level parameter for the cascade-close workflow). The handler at line 128 uses `cascade_from` to validate child entries. Without it in the schema, the cascade feature breaks.
- **Failure scenario:** After migration, the schema no longer accepts `cascade_from`. The cascade-close workflow (used for stale-parent resolution) fails. Operators must manually ack and resolve stale findings in two steps instead of one.
- **Evidence:** `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js:18-24` (schema includes `cascade_from`). `tools/learning-loop-mcp/core/meta-state.js:56-111` (no `cascade_from` in finding schema). Handler at line 128 uses `cascade_from`.
- **Suggested fix:** If migrating, use `.pick(['id', 'resolution', 'resolved_by']).merge({ cascade_from: z.array(z.string()).optional() })`. But like supersede, the benefit is minimal. Reclassify as **NOT a candidate** or **defer**.

---

## Finding 8: B6 loop-design flip uses `_expected_version` but the plan does not specify how to obtain it safely

- **Severity:** Medium
- **Location:** Phase 3, Step 2
- **Flaw:** The B6 flip's architecture snippet shows `_expected_version: <current version from meta_state_list>` but the implementation steps say "Use the current `version` from the list call as `_expected_version`." However, between the list call and the patch call, another process (or the same process in a concurrent batch) could mutate the entry, bumping the version. The plan acknowledges this as "low" risk with "auto-capture is the default" mitigation, but does not specify the actual retry logic. More importantly, the plan says "No code changes" but the flip is done via `meta_state_patch` — which IS a tool call, not a code change. The risk is that the flip fails silently (version mismatch) and the plan has no explicit retry step.
- **Failure scenario:** Between Step 1 (list) and Step 2 (patch), a concurrent `meta_state_patch` or `meta_state_batch` bumps the version. The flip returns `{ patched: false, reason: 'version_mismatch' }`. The plan proceeds to Step 3 (audit trail) without verifying the flip succeeded. The loop-design entry remains `active`, the master tracker is updated incorrectly, and downstream phases C-F unblock on a false signal.
- **Evidence:** `plans/260614-1259-phase-b-codegen-adoption/phase-03-b6-loop-design-flip.md:33-42` (architecture snippet with `_expected_version`). `plans/260614-1259-phase-b-codegen-adoption/phase-03-b6-loop-design-flip.md:72-75` (Step 2 says "Use the current version" but no retry loop). `tools/learning-loop-mcp/tools/meta-state-patch-tool.js:79-98` (handler returns `version_mismatch` with current version). Risk table at line 113 says "re-read + retry" but no step implements it.
- **Suggested fix:** Add an explicit retry loop to Step 2: on `version_mismatch`, re-list, re-patch, max 3 attempts. Or remove `_expected_version` entirely and rely on auto-capture (which is the default and eliminates the race). Document the choice.

---

## Finding 9: The "864-test baseline" claim is unverified — actual test count is far lower

- **Severity:** Medium
- **Location:** Phase 1, Requirements and Success Criteria (repeated in Phase 2)
- **Flaw:** The plan repeatedly claims an "864-test baseline" verified 2026-06-13. A `pnpm test --listTests` run on the codebase returns only 5 test files. The actual test count is nowhere near 864. This is either a copy-paste error from a different project, a miscount, or the tests are in a different directory not discovered by the test runner. Either way, the baseline number is fiction and the success criteria that reference it are unverifiable.
- **Failure scenario:** The implementer runs `pnpm test`, sees ~50-100 tests pass, and falsely believes they have regressed because the plan says "864+ tests." Or they waste time hunting for missing tests. The parity test gate ("864+ tests, 0 fail") is impossible to satisfy.
- **Evidence:** `pnpm test --listTests` returned 5 test files total. The plan mentions `__tests__/meta-state-patch-derived-schema.test.js` (B2 pattern) but this file may not exist in the current codebase (not found in the grep for existing tests). The 864 number appears in Phase 1 Requirements, Step 6, Success Criteria, and Phase 2 Success Criteria.
- **Suggested fix:** Remove all "864" references. Replace with the actual test count from `pnpm test` run at Step 0. Verify the B2 test files exist before referencing them. If they don't exist, the B2 "shipped" claim is also suspect — investigate.

---

## Finding 10: `meta_state_report` already uses `.shape` but its handler strips `mechanism_check` and `code_fingerprint` — the plan incorrectly assumes `.shape` tools pass all fields through

- **Severity:** High
- **Location:** Phase 1, Architecture section "Full-shape pattern" (cites `meta_state_report` as pattern reference)
- **Flaw:** The plan cites `meta_state_report` as the "simplest pattern" for `.shape` reuse: `schema: metaStateFindingEntrySchema.shape`. But `meta_state_report`'s handler at lines 14-105 does NOT blindly pass all `.shape` fields to `writeEntry`. It explicitly handles `mechanism_check` with conditional logic (lines 35-68), transforms `session_id` and `reopens` with spread operators, and sets `status`, `created_at`, `expires_at`, `acked_at`, `resolved_at`, `resolved_by` internally. The `.shape` exposes ALL entry fields as tool parameters, but the handler ignores/overwrites many of them. This is the same pattern the plan proposes for `meta_state_log_change` and `meta_state_propose_design` — but the plan treats `.shape` as "the tool accepts all entry fields and the handler passes them through," which is NOT what `meta_state_report` does. The pattern reference is misleading.
- **Failure scenario:** The implementer copies the `meta_state_report` pattern for `meta_state_log_change`, exposing `id`, `entry_kind`, `status`, `created_at`, `version` as tool parameters. The handler ignores them, creating a confusing MCP surface where callers can specify fields that have no effect. This degrades the operator experience and may cause bugs when callers assume their `id` or `created_at` values are respected.
- **Evidence:** `tools/learning-loop-mcp/tools/meta-state-report-tool.js:13` (`schema: metaStateFindingEntrySchema.shape`). `tools/learning-loop-mcp/tools/meta-state-report-tool.js:14-105` (handler strips/transforms many fields). Plan Phase 1 Architecture: "Used by `meta_state_report` already" with "AFTER" snippet showing raw `.shape`.
- **Suggested fix:** Update the Architecture section to acknowledge that `.shape` tools require handler-side filtering. For each migrated tool, document which `.shape` fields the handler consumes vs. ignores. Use `.pick()` or `.omit()` to create honest schemas that only expose fields the handler actually uses. Do not cite `meta_state_report` as a "simplest pattern" without this caveat.

---

## Summary

This plan has **3 Critical** and **5 High** severity findings that would cause production failures if implemented as written. The core issue is that the plan treats `.shape` and `.pick()` as mechanical replacements for hand-written schemas, without tracing the actual handler code paths to verify field consumption. Every "genuine candidate" tool except `meta_state_report` has tool-level fields that would be lost or mismatched in a naive migration.

The B5 `z.intersection` fix is architecturally broken because the wire-format coercion pipeline cannot introspect `ZodIntersection` — this would regress stdio round-trips for all patch operations.

The B6 flip has a CAS race gap with no retry specification.

The "864-test baseline" is unverified and likely incorrect.

**Recommended action:** Revise the B3 audit to reclassify most tools as NOT candidates. Only `meta_state_report` (already done) and possibly `meta_state_log_change` (with `.pick()`) are viable. Defer `meta_state_batch` to Bridge 7. Fix B5 to use `.merge()` instead of `z.intersection`. Add CAS retry to B6. Verify actual test count.

---

**Status:** DONE_WITH_CONCERNS
**Summary:** 10 findings (3 Critical, 5 High, 2 Medium). The plan's core assumption that `.shape` and `.pick()` are drop-in replacements is false for 5 of 6 candidate tools. The B5 `z.intersection` fix would break wire-format coercion. The B6 flip has an unhandled CAS race. The "864-test baseline" is unverified.
**Concerns/Blockers:** Plan requires revision before implementation. Critical findings would cause tool breakage and stdio regression.
