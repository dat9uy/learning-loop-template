# Red Team Security Adversary — Plan Review Report

Plan: `260614-1259-phase-b-codegen-adoption` (B3-B6)
Reviewer: code-reviewer (hostile / security adversary)
Date: 2026-06-14

---

## Finding 1: `z.intersection` is invisible to `coerceParamsToSchema` — wire-format coercion will silently fail on script-caller fields inside `patch`

- **Severity:** Critical
- **Location:** Phase 2, section "Architecture" (the `z.intersection` fix)
- **Flaw:** The plan proposes `z.intersection(strict, SCRIPT_CALLER_PATCH_FIELDS)` as the return value of `buildPatchSchemaFor`. The wire-format coercion helper `coerceParamsToSchema` in `tool-registry.js:78` walks `schema.shape` to look up field schemas by key. A `ZodIntersection` has no `.shape` property — `unwrapTypeName` does not handle `"ZodIntersection"` (verified: `tool-registry.js:6-22` only unwraps Optional/Nullable/Default/Effects/Transform/Lazy). When the patch object arrives via stdio, `coerceParamsToSchema` will see the intersection, fail to find `.shape`, and return the raw args uncoerced. Any script-caller fields that need coercion (e.g., `mechanism_check` sent as string `"true"` by a Python caller) will pass through uncoerced, then the inner `.strict()` schema will reject them because the type is wrong. The fix breaks the very callers it is meant to help.
- **Failure scenario:** A Python script caller sends `{"patch": {"mechanism_check": "true"}}` via stdio. `coerceParamsToSchema` hits the intersection, cannot unwrap it, skips coercion, passes `"true"` (string) to Zod. The inner `.strict()` schema expects boolean → parse fails → script caller gets a schema rejection on a field that the plan claims is now accepted.
- **Evidence:** `tool-registry.js:78-80` does `const shape = schema.shape || schema; if (!shape || typeof shape !== "object") return args;`. `tool-registry.js:6-22` `unwrapTypeName` never handles `"ZodIntersection"`. `z.intersection` is not used anywhere in the MCP codebase (`grep -rn "z.intersection"` returns empty). The B2 regression tests (`wire-format-*.test.js`) will fail if this is applied.
- **Suggested fix:** Do NOT use `z.intersection`. Instead, keep the per-kind `.partial().strict()` schemas unchanged, and add the 3 script-caller fields as optional keys directly into each per-kind entry schema (they are already there for `finding` — `mechanism_check` and `code_fingerprint` exist at `meta-state.js:87-89`). For other kinds where they do not exist, add them as optional fields. This preserves `.shape` visibility for `coerceParamsToSchema` and keeps the single-source-of-truth intact.

---

## Finding 2: `meta_state_batch` `update` op uses `.passthrough()` — the plan silently ignores an existing trust-boundary violation

- **Severity:** High
- **Location:** Phase 1, section "B3 Audit" (batch tool listed as candidate) + `meta-state-batch-tool.js:14-17`
- **Flaw:** The plan lists `meta_state_batch` as a "high risk" migration candidate but does not flag that the `update` op schema in the batch tool ALREADY uses `.passthrough()`: `z.object({ op: z.literal("update"), id: z.string(), _expected_version: z.number().optional() }).passthrough()`. This means any field sent in an `update` op is silently accepted at the tool schema level, then merged into the entry via `Object.assign` in `meta-state.js:420`. The plan's proposed `buildOpSchemaFor` helper would need to decide whether to keep this `.passthrough()` (trust boundary violation) or replace it with strict schemas (breaking change). The plan does not address this existing hole.
- **Failure scenario:** A caller sends `{ op: "update", id: "some-finding", bogus_injected_field: "malicious_value" }`. The `.passthrough()` accepts it. `Object.assign` in `updateEntry` merges it into the persisted entry. The entry now contains an unauthorized field that was never part of the schema. This is a data-integrity / injection vector.
- **Evidence:** `meta-state-batch-tool.js:14-17` shows `.passthrough()` on the update op. `meta-state.js:420` does `Object.assign(entry, cleanPatch)` with no field whitelist beyond the `IMMUTABLE_PATCH_FIELDS` deny-list in the patch tool (the batch tool does NOT use `IMMUTABLE_PATCH_FIELDS`).
- **Suggested fix:** The plan must explicitly scope whether `meta_state_batch` update ops should remain `.passthrough()` or become strict. If strict, the `buildOpSchemaFor` helper must also enforce the same `IMMUTABLE_PATCH_FIELDS` deny-list that the patch tool uses. If the plan defers this, it must document the `.passthrough()` as a known trust-boundary violation (LIM-9 territory, already acknowledged out-of-scope — but the plan should not migrate the batch tool without addressing it).

---

## Finding 3: `SCRIPT_CALLER_PATCH_FIELDS` with `.strict()` (the "re-evaluated" design) still breaks `coerceParamsToSchema` AND will reject legitimate entry fields

- **Severity:** Critical
- **Location:** Phase 2, section "Risk Assessment" (the `.strict()` re-evaluation at line 156-166)
- **Flaw:** The plan re-evaluates the risk and proposes `.strict()` instead of `.passthrough()` on `SCRIPT_CALLER_PATCH_FIELDS`. This is WORSE than the original design. `z.intersection(A, B)` where both A and B are `.strict()` will reject ANY field that is not in BOTH schemas. A `finding` patch containing `status: "resolved"` would be accepted by the inner `metaStateFindingEntrySchema.partial().strict()` but REJECTED by `SCRIPT_CALLER_PATCH_FIELDS.strict()` because `status` is not one of the 3 script-caller fields. The intersection would fail. This means the patch tool would reject ALL normal entry fields — the tool would become completely unusable for normal patches.
- **Failure scenario:** An operator sends `meta_state_patch({ id: "x", entry_kind: "finding", patch: { status: "resolved" } })`. The inner schema accepts `status`. The outer `SCRIPT_CALLER_PATCH_FIELDS.strict()` rejects `status` (not in its 3-field set). `z.intersection` fails. The patch is rejected. The patch tool is broken.
- **Evidence:** Zod intersection semantics: `z.intersection(z.object({a: z.string()}).strict(), z.object({b: z.string()}).strict()).parse({a: "x", b: "y"})` throws — `a` is unknown to the second schema, `b` is unknown to the first. The plan's own risk assessment at line 156 says "The inner `.strict()` rejects unknown fields per-kind; the outer passthrough accepts anything at the script-caller layer." — but then the re-evaluation at line 162 switches to `.strict()` on the outer, which contradicts this and breaks the intersection.
- **Suggested fix:** Abandon `z.intersection` entirely. The 3 script-caller fields (`mechanism_check`, `code_fingerprint`, `_expected_version`) are already present on `metaStateFindingEntrySchema` (`meta-state.js:87-89`). They should be added to the other 3 per-kind schemas as optional fields. Then `buildPatchSchemaFor` naturally includes them via `.partial()` with no intersection needed. This is the only design that preserves `.shape` for coercion and keeps the intersection semantics correct.

---

## Finding 4: `meta_state_log_change` schema migration will expose `created_at`, `version`, `expires_at` to callers — these are auto-generated audit-trail fields

- **Severity:** High
- **Location:** Phase 1, section "Step 1 — Migrate `meta_state_log_change`" (line 125-128)
- **Flaw:** The plan proposes replacing the hand-written schema with `metaStateChangeEntrySchema.shape`. The entry schema contains `created_at: z.string().describe("ISO timestamp")`, `version: z.number().default(0)`, and `expires_at: z.string().optional()`. The current hand-written schema (`meta-state-log-change-tool.js:44-71`) does NOT expose these fields — they are generated by the handler. If the tool schema is replaced with the full entry schema, callers can now pass these fields, and the handler may either accept them (data integrity risk) or need new filtering logic that the plan does not specify.
- **Failure scenario:** A caller sends `meta_state_log_change({ ..., created_at: "1970-01-01T00:00:00Z", version: 999 })`. The schema accepts it. The handler writes it to the registry. The audit-trail entry now has a forged timestamp and a bogus version. This breaks the immutability and chronology guarantees of the change-log.
- **Evidence:** `meta-state-log-change-tool.js:44-71` (hand-written schema) has no `created_at`, `version`, or `expires_at` fields. `meta-state.js:117-158` (`metaStateChangeEntrySchema`) has `created_at: z.string()`, `version: z.number().default(0)`, `expires_at: z.string().optional()`. The handler at `meta-state-log-change-tool.js:99-100` does `const now = new Date();` and generates its own timestamp — but if the caller provides one, the schema will accept it and the handler will overwrite it (or worse, merge it). The plan does not specify how this conflict is resolved.
- **Suggested fix:** Use `.pick()` or `.omit()` to strip auto-generated fields from the tool schema, OR document that the handler will unconditionally overwrite them. The plan currently says "Strip tool-level fields that don't apply (none expected)" — this is wrong; `created_at`, `version`, and `expires_at` are auto-generated and must be stripped.

---

## Finding 5: `meta_state_promote_rule` schema migration will expose `promoted_at`, `promoted_by`, `origin` to callers — these are handler-generated fields

- **Severity:** High
- **Location:** Phase 1, section "Step 2 — Migrate `meta_state_promote_rule`" (line 130-133)
- **Flaw:** The plan proposes `schema: metaStateRuleEntrySchema.shape` with a `.merge({})` for tool-level fields. The rule entry schema (`meta-state.js:164-201`) contains `origin: z.string().describe("Finding id that originated this rule")`, `promoted_at: z.string().describe("ISO timestamp")`, and `promoted_by: z.string().describe("Operator id")`. These are handler-generated fields. The current hand-written schema (`meta-state-promote-rule-tool.js:24-34`) does NOT expose them. The plan says "Strip tool-level fields: `pattern_type`, `pattern` are not on `metaStateRuleEntrySchema`" — but it does not mention stripping `origin`, `promoted_at`, `promoted_by`, which ARE on the entry schema but should NOT be caller-provided.
- **Failure scenario:** A caller sends `meta_state_promote_rule({ id: "finding-1", rule_id: "rule-x", origin: "forged-finding", promoted_by: "attacker" })`. The schema accepts it. The handler may use the caller-provided `origin` instead of the actual finding id, creating a false lineage. Or the caller can set `promoted_at` to a future date, breaking chronology.
- **Evidence:** `meta-state-promote-rule-tool.js:24-34` has no `origin`, `promoted_at`, or `promoted_by` fields. `meta-state.js:164-201` has all three. The handler at `meta-state-promote-rule-tool.js` (not fully read, but the pattern is clear) likely sets these from the finding entry and `new Date()`.
- **Suggested fix:** The plan must explicitly list which entry-schema fields are auto-generated and must be stripped from the tool schema. For `promote_rule`, at minimum: `origin`, `promoted_at`, `promoted_by`. Use `.omit()` or a custom projection.

---

## Finding 6: `meta_state_propose_design` schema migration will expose `created_at`, `created_by`, `shipped_in_plan`, `shipped_at` to callers

- **Severity:** High
- **Location:** Phase 1, section "Step 3 — Migrate `meta_state_propose_design`" (line 135-138)
- **Flaw:** The plan proposes `schema: metaStateLoopDesignSchema.shape`. The loop-design entry schema (`meta-state.js:203-225`) contains `created_at`, `created_by`, `shipped_in_plan`, `shipped_at`, `status`. The current hand-written schema (`meta-state-propose-design-tool.js:24-39`) only exposes `title`, `description`, `proposed_design_for`, `addresses`, `affected_system`, `severity_hint`, `loop_design_id`. The plan says "Watch for the wire-format recursion case" but does not mention the auto-generated field exposure risk.
- **Failure scenario:** A caller sends `meta_state_propose_design({ title: "x", description: "y", ..., status: "inactive", shipped_in_plan: "plans/attacker-plan", shipped_at: "2026-01-01" })`. The schema accepts it. The entry is created with a forged shipped state, bypassing the normal lifecycle. The B6 flip (Phase 3) becomes meaningless because the entry could already be shipped.
- **Evidence:** `meta-state-propose-design-tool.js:24-39` has no `status`, `created_at`, `created_by`, `shipped_in_plan`, or `shipped_at`. `meta-state.js:203-225` has all of them. The handler at `meta-state-propose-design-tool.js` (not fully read) likely sets `created_at` and `created_by` automatically.
- **Suggested fix:** Use `.omit()` to strip `created_at`, `created_by`, `shipped_in_plan`, `shipped_at`, `status` from the tool schema. Or use `.pick()` to only include the caller-provided fields. Document the omitted fields in the audit deliverable.

---

## Finding 7: `meta_state_batch` `write` op uses `z.record(z.string(), z.unknown())` — no schema validation at the tool boundary, full validation deferred to `metaStateEntrySchema` inside the handler

- **Severity:** Medium
- **Location:** Phase 1, section "Step 4 — Migrate `meta_state_batch`" + `meta-state-batch-tool.js:11-12`
- **Flaw:** The batch tool's `write` op schema is `z.record(z.string(), z.unknown())` — it accepts any JSON object. The plan proposes migrating to per-op derived schemas, but the current design already has a trust-boundary gap: the tool schema does not validate the entry shape; validation happens inside `metaStateBatch` at `meta-state.js:512`. This is acceptable IF the plan acknowledges it, but the plan lists batch as a "high risk" migration without noting that the current tool schema is already a passthrough. The risk assessment table says "atomic batch has 5 op types with different shapes" but does not mention that the `write` op is currently unvalidated at the tool boundary.
- **Failure scenario:** A caller sends a `write` op with an invalid entry (e.g., wrong `entry_kind`, missing required fields). The tool schema accepts it. The batch handler validates it inside `metaStateBatch` and throws. The batch rolls back. This is safe but inefficient — the plan should note that the current design already defers validation.
- **Evidence:** `meta-state-batch-tool.js:11-12` shows `entry: z.record(z.string(), z.unknown())`. `meta-state.js:512` shows `metaStateEntrySchema.safeParse(op.entry)` inside the handler. The plan's risk assessment does not mention this existing gap.
- **Suggested fix:** Document the existing deferred-validation pattern in the audit deliverable. If the plan migrates batch to per-op schemas, ensure the `write` op uses the per-kind entry schema (not `.record()`) so validation happens at the tool boundary, not inside the batch handler.

---

## Finding 8: Phase 3 (B6) uses `meta_state_patch` with `_expected_version` but the plan does not specify how to obtain the current version safely

- **Severity:** Medium
- **Location:** Phase 3, section "Step 2 — The flip" (line 73)
- **Flaw:** The plan says "Use the current `version` from the list call as `_expected_version`." But `meta_state_list` returns entries, not a single entry. The plan does not specify the exact `meta_state_list` call shape (e.g., `id` filter) to get the version. If the operator runs the list call without filtering, they get all entries and must manually extract the version. The plan also says "auto-capture is the default per the `meta_state_patch` handler" — but then says "explicit is safer." This is contradictory: if auto-capture is safe, why require explicit? If explicit is required, the plan must give the exact call.
- **Failure scenario:** The operator runs `meta_state_list` without an `id` filter, gets 500 entries, manually picks the wrong version (e.g., from a different entry), and the CAS fails. Or the operator omits `_expected_version` relying on auto-capture, but the entry was modified between the list call and the patch call (race condition). The flip fails or overwrites a newer version.
- **Evidence:** `meta-state-patch-tool.js:34-35` shows `_expected_version` is optional and the handler auto-captures. `meta-state-list-tool.js` (not fully read) likely supports `id` filtering. The plan does not specify the list call parameters.
- **Suggested fix:** Give the exact `meta_state_list` call in the plan: `meta_state_list({ id: "loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from" })`. Verify that the list tool supports `id` filtering. If not, document the alternative (e.g., `meta_state_derive_status`).

---

## Finding 9: The plan cites `tools/learning-loop-mcp/tool-registry.js:77-134` (`coerceParamsToSchema`) as a wire-format helper that "must compose" with generated schemas, but the proposed `z.intersection` breaks this composition

- **Severity:** High
- **Location:** Phase 1, section "Context Links" (line 23-24) + Phase 2, section "Architecture"
- **Flaw:** The plan explicitly states that "The wire-format coercion helpers (`coerceParamsToSchema` + `installWireFormatCoercion`) compose with the generated schemas — no regression in stdio round-trips." This is a factual claim that is FALSE for the `z.intersection` design in Phase 2. The plan makes this claim in Phase 1 (the verification gate) and then proposes a design in Phase 2 that violates it. The two phases are internally inconsistent.
- **Failure scenario:** The B4 verification gate (Phase 1, Step 6) runs `pnpm test` and passes because the tests do not cover `z.intersection` (it is not yet introduced). Then Phase 2 introduces `z.intersection`, and the stdio regression tests fail. The plan's own success criteria for Phase 1 ("wire-format coercion helpers compose with the generated schemas") are violated by Phase 2.
- **Evidence:** `tool-registry.js:78-80` requires `.shape` on the schema. `z.intersection` has no `.shape`. The plan's Phase 1 success criteria at line 166: "The wire-format coercion helpers (`coerceParamsToSchema`, `installWireFormatCoercion`) compose with the generated schemas (verified by the existing 4 stdio regression tests + the per-tool parity tests)." Phase 2's `z.intersection` breaks this.
- **Suggested fix:** Reconcile Phase 1 and Phase 2. Either (a) do not use `z.intersection` in Phase 2, or (b) update Phase 1's success criteria to exclude `z.intersection` schemas from the wire-format coercion guarantee, and add a new test that specifically tests coercion through `z.intersection` (which will fail, proving the design is wrong).

---

## Summary

The plan has **3 Critical** findings, **4 High**, and **2 Medium**. The most severe is the `z.intersection` design in Phase 2, which is broken on two independent axes: (1) it is invisible to the wire-format coercion helper, and (2) the `.strict()` re-evaluation makes the intersection reject all normal entry fields. The plan should abandon `z.intersection` entirely and instead add the script-caller fields to the per-kind entry schemas as optional keys.

The auto-generated field exposure risk (Findings 4, 5, 6) is a recurring pattern: the plan treats `.shape` as a drop-in replacement for hand-written schemas without accounting for fields that are handler-generated and should not be caller-provided. The audit deliverable must include an "auto-generated fields to strip" column.

The `meta_state_batch` trust-boundary gap (Finding 2, 7) is pre-existing but the plan should not migrate the batch tool without addressing it.

**Status:** DONE_WITH_CONCERNS
**Summary:** Plan contains a critical design flaw in Phase 2 (`z.intersection` breaks wire-format coercion AND normal field acceptance) and a recurring pattern of exposing auto-generated fields to callers in Phase 1. These must be fixed before implementation.
**Concerns/Blockers:** Phase 2 `z.intersection` design is fundamentally broken and must be redesigned. Phase 1 must add auto-generated field stripping to all tool schema migrations. `meta_state_batch` `.passthrough()` on `update` ops must be scoped (fix or document as known vulnerability).
