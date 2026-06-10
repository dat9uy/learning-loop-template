---
phase: 2
title: "Auto-default + warning on report (TDD)"
status: completed
priority: P2
effort: "1.5h"
dependencies: []
---

# Phase 2: Auto-default + warning on report (TDD)

## Overview

Change `meta_state_report` to auto-default `mechanism_check: true` when the caller provides `evidence_code_ref` but does not explicitly set `mechanism_check`. Use `??` (not `||`) to preserve an explicit `mechanism_check: false` opt-out. When the caller provides both `evidence_code_ref` AND `mechanism_check: false`, emit a structured `warnings` array in the response to teach the deliberate-opt-out path. Update the tool description to mention the auto-default. TDD: write 6 failing tests first (T5-T10), then change ~12 lines of production code.

## Requirements

- **Functional**: when caller passes `evidence_code_ref` and omits `mechanism_check`, the entry stores `mechanism_check: true`. When caller passes both `evidence_code_ref` and `mechanism_check: false`, the entry stores `mechanism_check: false` AND the response includes `warnings: [{ code, message, suggestion }]`. Explicit `mechanism_check: true` is preserved. `mechanism_check: null` behaves as omitted. Omitting both fields stores neither (field absent on entry, no warning).
- **Non-functional**: `??` operator (not `||`) to preserve explicit `false`. Spread constrained to `=== true` so the field is absent (not `false`) when neither is provided — preserves the "field absent" semantic that T-existing-B relies on. Warning is a runtime response field, not a stored field. Schema description text updated.

## Architecture

`mechanism_check` stays in the handler destructure (line 18 of `meta-state-report-tool.js`) so the warning condition can read the raw caller value. A derived constant `effective_mechanism_check = mechanism_check ?? Boolean(evidence_code_ref)` is computed after the destructure. The entry literal's spread is changed from `...(mechanism_check !== undefined && { mechanism_check })` to `...(effective_mechanism_check === true && { mechanism_check: true })`. This stores the field only when the effective value is `true`, preserving the "field absent" semantic for the "both omitted" case.

A `warnings` array is built before the entry literal and merged into the result object, gated on `warnings.length > 0`. The warning's `code` is the kebab-case string `"evidence_without_mechanism_check"`. The warning is added when `evidence_code_ref` is truthy AND `mechanism_check === false` (explicit opt-out only — not the "both omitted" case). The raw `mechanism_check` is read for the warning condition (so `null` and `false` both trigger the warning, but `undefined` does not).

The schema description in `core/meta-state.js:57` is updated to reflect the new default semantics. The tool's `description` field (line 6) is updated to mention the auto-default.

## Related Code Files

- **Modify**: `tools/learning-loop-mcp/tools/meta-state-report-tool.js` — keep `mechanism_check` in destructure (so the warning condition reads the raw caller value); add `effective_mechanism_check` constant; change spread to `=== true`; build `warnings` array; merge into result; update tool description (~12 lines)
- **Modify**: `tools/learning-loop-mcp/core/meta-state.js` — update schema description for `mechanism_check` field at line 57 (~1 line)
- **Modify**: `tools/learning-loop-mcp/__tests__/meta-state-report-tool-extension.test.js` — add T5, T6, T7, T8, T9, T10 (~120 lines)
- **Modify**: `tools/learning-loop-mcp/__tests__/meta-state-report-description.test.js` — update assertion if the new description text changes keyword presence (~3 lines, only if the existing assertions fail)

## Implementation Steps

### Step 2.1 — Write failing tests T5, T6, T7, T8, T9, T10 (red)

Append the 6 new tests to the existing `describe("metaStateReportTool mechanism_check extension", ...)` block in `__tests__/meta-state-report-tool-extension.test.js`. Use the same `mkdtempSync` + `process.env.GATE_ROOT` + `finally` pattern as the 3 existing tests.

**T5: auto-defaults `mechanism_check` to `true` when `evidence_code_ref` is provided**
- Call handler with `evidence_code_ref: "tools/foo.js:1"`, no `mechanism_check`.
- Assert `response.warnings === undefined` (no warning when not explicit opt-out).
- Assert `entry.mechanism_check === true` (auto-defaulted).
- Assert `entry.evidence_code_ref === "tools/foo.js:1"`.

**T6: explicit `mechanism_check: true` with `evidence_code_ref` stores `true` and emits no warning**
- Call handler with `evidence_code_ref` and `mechanism_check: true`.
- Assert `response.warnings === undefined`.
- Assert `entry.mechanism_check === true`.

**T7: explicit `mechanism_check: false` with `evidence_code_ref` stores `false` and emits a warning**
- Call handler with `evidence_code_ref` and `mechanism_check: false`.
- Assert `Array.isArray(response.warnings)` and `response.warnings.length === 1`.
- Assert `response.warnings[0].code === "evidence_without_mechanism_check"`.
- Assert `typeof response.warnings[0].message === "string"` and length > 20.
- Assert `entry.mechanism_check === false` (explicit opt-out preserved).

**T8: omits `mechanism_check` when neither field is provided**
- Call handler with no `evidence_code_ref` and no `mechanism_check`.
- Assert `response.warnings === undefined`.
- Assert `entry.mechanism_check === undefined` (field is absent, not false).

**T9: explicit `mechanism_check: true` without `evidence_code_ref` is the escape hatch**
- Call handler with no `evidence_code_ref` but `mechanism_check: true`.
- Assert `response.warnings === undefined`.
- Assert `entry.mechanism_check === true` and `entry.evidence_code_ref === undefined`.

**T10: `mechanism_check: null` behaves as if omitted**
- Call handler with `evidence_code_ref: "x.js:1"` and `mechanism_check: null`.
- Assert `entry.mechanism_check === true` (null coalesces to default).

### Step 2.2 — Update the destructure and add the `effective_mechanism_check` constant (green)

In `tools/meta-state-report-tool.js`:

1. Remove `mechanism_check,` from the destructure at line 18. (We will access it via the `arguments` object passed to the handler, or via the rest spread.)

   Actually, a cleaner approach: destructure everything else, then read `mechanism_check` from a separate variable. The MCP tool handler signature is fixed (destructured by `registerTool`); the simplest change is to keep `mechanism_check` in the destructure and just add the `effective_mechanism_check` constant.

2. After the destructure (after line 24, before `const root = resolveRoot();`), add:
   ```js
   // Auto-default: if caller provides evidence_code_ref, opt them into
   // mechanism_check unless they explicitly opted out.
   // ?? (not ||) preserves an explicit mechanism_check: false.
   const effective_mechanism_check = mechanism_check ?? Boolean(evidence_code_ref);
   ```

3. Change the spread at line 45 from:
   ```js
   ...(mechanism_check !== undefined && { mechanism_check }),
   ```
   to:
   ```js
   ...(effective_mechanism_check === true && { mechanism_check: true }),
   ```
   The `=== true` constraint (instead of `!== undefined`) ensures the field is stored ONLY when the effective value is `true`. This preserves the "field absent" semantic for the "both omitted" case (where `effective_mechanism_check` is `false`).

4. Add a one-line comment above the spread explaining the asymmetry: "Only `true` is stored; `false` is omitted (matches the pre-existing 'field absent' semantic for the neither-provided case)."

### Step 2.3 — Build the `warnings` array and merge into the result (green)

After the `entry` literal (after line 53) and before the `writeEntry` call (line 55), add:

```js
// Build warnings based on caller intent vs. tool default.
const warnings = [];
if (evidence_code_ref && mechanism_check === false) {
  warnings.push({
    code: "evidence_without_mechanism_check",
    message:
      "evidence_code_ref is set but mechanism_check is false; the fingerprint will not be tracked. " +
      "Pass mechanism_check: true to opt in to grounding checks via meta_state_refresh_fingerprint.",
    suggestion: "Remove mechanism_check or set it to true to opt in to grounding checks.",
  });
}
```

Update the result object at line 60-64 to:

```js
const result = {
  reported: true,
  id,
  status: "reported",
  expires_at: expiresAt.toISOString(),
  ...(warnings.length > 0 && { warnings }),
};
```

The `warnings.length > 0 && { warnings }` gated spread matches the `loop-describe-tool.js:209` precedent. The result has no `warnings` field when the warnings array is empty.

### Step 2.4 — Update the tool description (green)

Append to the tool's `description` field (line 6 of `meta-state-report-tool.js`):
> "When `evidence_code_ref` is provided, `mechanism_check` defaults to `true`; pass `mechanism_check: false` explicitly to opt out (a warning is returned)."

If this new text breaks the existing `meta-state-report-description.test.js` assertions (specifically the "warns that markdown paths are deprecated" test at line 17, which checks for the substring `"Markdown paths in `source_refs` are deprecated"`), no change is needed — the assertion is on an existing substring, not the full description. Verify after the change.

### Step 2.5 — Update the schema description (green)

In `core/meta-state.js:57`, change the `.describe()` text for `mechanism_check` from:
```
"Opt-in flag (SP2): include this finding in grounding checks. Default false. When true, checkGrounding computes and stores a SHA-256 fingerprint of evidence_code_ref."
```
to:
```
"Opt-in flag (SP2): include this finding in grounding checks. Defaults to true when evidence_code_ref is set; false otherwise. The meta_state_report tool applies this default automatically; the field is omitted from the entry if the caller provides neither mechanism_check nor evidence_code_ref. Pass mechanism_check: false to explicitly opt out (the response includes a warning). When true, checkGrounding computes and stores a SHA-256 fingerprint of evidence_code_ref."
```

This is a documentation-only change; it does not affect validation behavior. The schema's accepted values are unchanged.

### Step 2.6 — Run tests and verify (green)

Run `pnpm test` from the project root. The 6 new tests pass; the 3 existing tests in `meta-state-report-tool-extension.test.js` still pass (T-existing-B preserved by the `=== true` spread constraint); the description tests still pass.

**Backward-compat audit (additional verification step)**: Grep the test suite for `evidence_code_ref` usages in `meta_state_report` calls and verify none assert `assert.deepEqual(entry, {...full shape...})` (which would fail when `mechanism_check: true` is added). Known call sites that may be affected (verified manually during planning):

- `tools/learning-loop-mcp/__tests__/meta-state-session-id-roundtrip.test.js:81,90` — passes `evidence_code_ref`, no `mechanism_check`. The auto-default makes the entry have `mechanism_check: true` after this plan. The test asserts on `e.session_id` and `e.id`, not on `mechanism_check` — safe. **However**, the test at line 32 passes `mechanism_check: false + evidence_code_ref`; the response will now include a `warnings` field. Add an explicit assertion on the warning to make the test author's intent clear.
- `tools/learning-loop-mcp/__tests__/budget-option-c-e2e.test.js:187,215,221` — same pattern. Asserts only on `category`, `affected_system`, `status`, `id`. Safe.
- `tools/learning-loop-mcp/__tests__/loop-describe.test.js:247,339,346` — mixed; verify each call site before merge.
- `tools/learning-loop-mcp/__tests__/gate-scope-predicate.test.js:217,265,298,316` — mixed; verify each.
- `tools/learning-loop-mcp/__tests__/loop-describe-cold-tier-superseded.test.js:53` — passes `evidence_code_ref`. Verify assertion shape.
- `tools/learning-loop-mcp/__tests__/cold-session-churn-regression.test.js:29,53,89,107` — passes `evidence_code_ref`. Verify assertion shape.
- `tools/learning-loop-mcp/__tests__/meta-state-rule-schema.test.js:44` — passes `evidence_code_ref`. Verify.
- `tools/learning-loop-mcp/__tests__/flatten-evidence-fields.test.js:203` — passes `evidence_code_ref: "already.js"`. Verify.

Each call site must be inspected to confirm no full-object equality assertion is used. Add this audit to the checklist before merge.

## Success Criteria

- [ ] T5 passes: auto-default fires when `evidence_code_ref` set and `mechanism_check` omitted.
- [ ] T6 passes: explicit `mechanism_check: true` is preserved; no warning.
- [ ] T7 passes: explicit `mechanism_check: false` is preserved on entry; warning is in response.
- [ ] T8 passes: field is absent (not false) when neither is provided; no warning.
- [ ] T9 passes: explicit `mechanism_check: true` without `evidence_code_ref` is the escape hatch.
- [ ] T10 passes: `mechanism_check: null` behaves as omitted.
- [ ] T-existing-A, T-existing-B, T-existing-C still pass (no modification needed).
- [ ] Tool description mentions the auto-default.
- [ ] Schema description in `core/meta-state.js:57` reflects the new default.
- [ ] No regressions in `pnpm test`.

## Risk Assessment

- **T-existing-B breakage** — pre-existing test at `meta-state-report-tool-extension.test.js:60-69` asserts `entry.mechanism_check === undefined` when both fields are omitted. **Mitigation**: the spread is constrained to `=== true`, so the field is absent when `effective_mechanism_check === false` (which is the case for the "both omitted" input). T-existing-B passes without modification.
- **Wire-format coercion of `mechanism_check`** — the `coerceParamsToSchema` layer (in `tools/learning-loop-mcp/tool-registry.js:77+`) runs before the handler, converting strings to booleans. The `??` operator runs on the post-coercion value. `mechanism_check: "false"` (string) is coerced to `false` before the handler, then `false ?? ...` returns `false` (the explicit opt-out). **Verified by the coerceParamsToSchema design and confirmed by Researcher B Section 8.**
- **Backward compat with `meta_state_patch`** — the patch tool can update `mechanism_check` post-creation. Existing behavior is unchanged: patching a finding's `mechanism_check` to `true` or `false` works regardless of how the entry was created. **No risk.**
- **Direct-writeEntry callers in `.factory/hooks/loop-surface-inject.cjs`** — these bypass the tool handler and are unaffected by the auto-default. The registry will have a mix of "tool-handler findings" (with `mechanism_check: true` defaulted) and "hook findings" (with `mechanism_check` absent). **Documented as out-of-scope** per Researcher B Section 10.9.
- **Discoverability hint NOT updated in this phase** — the discoverability hint update is in Phase 3. This phase ships the behavior; Phase 3 makes it discoverable. The cold-session test should still pass (it doesn't test the new hint).
