---
title: "Dual-Field Schema Unification: evidence_code_ref (top-level) as Single Source of Truth + Gate Hardening"
description: "Closes meta-260607T0008Z-dual-field-schema-risk: queryDrift skips SP2 grounding for 30 entries that carry only the nested evidence.code_ref form. Migrates 30 entries in-place to top-level evidence_code_ref, validates writes against the 4-kind Zod union, and adds a new consult-gate rule (rule-no-orphaned-evidence) to prevent silent divergence."
date: "2026-06-07T00:08:00Z"
tags: [meta, meta-state, schema-drift, registry-mutation, gate-hardening, zod-validation, consult-gate]
status: draft
session: 260607-dual-field-schema-unification
supersedes: null
superseded_by: null
related:
  - meta-state.jsonl entry meta-260607T0008Z-dual-field-schema-risk-evidence-code-ref-top-level-vs-eviden (the finding this report resolves)
  - meta-state.jsonl entry meta-260606T2055Z-tools-learning-loop-mcp-core-meta-state-js-metastateentrysch (4-kind union ship; this report extends the surface)
  - meta-state.jsonl entry meta-260606T1830Z-context-pollution-stale-workaround-languag (rule-no-new-artifact-types precedent for consult gates)
  - meta-state.jsonl entry meta-260606T1656Z-cold-session-test-must-pass-before-resolution (rule-cold-session-test-must-pass-before-resolution is the implementation pattern for rule-no-orphaned-evidence)
  - meta-state.jsonl entry meta-260606T2102Z-agent-used-direct-file-i-o-node-e-scripts- (idempotency in migration scripts is the precondition for in-place registry mutation)
  - meta-state.jsonl entry meta-260606T2106Z-agent-called-meta-state-log-change-mcp-too (idempotency in writers is the precondition for the migration's clean-break design)
  - plans/260606-rule-loop-design-first-class/plan.md (Phase 2 migration clean-break pattern: extract → mutate source → emit; reused here)
  - plans/260606-meta-state-scan-readiness-refactor/plan.md (Phase 5 backfill-mechanism-check.mjs is the pattern for in-place idempotent migration)
  - tools/learning-loop-mcp/core/query-drift.js (the bug: line 37 `typeof entry.evidence_code_ref === "string"` skips 30 entries)
  - tools/learning-loop-mcp/core/meta-state.js (the writer: `writeEntry` accepts unvalidated entries; `updateEntry` same)
  - tools/learning-loop-mcp/core/check-grounding.js (legacy fallback chain `entry.evidence_code_ref ?? entry.evidence?.code_ref`)
  - tools/learning-loop-mcp/core/derive-status.js (same legacy fallback at line 66)
  - tools/learning-loop-mcp/tools/meta-state-refresh-fingerprint-tool.js (same legacy fallback at line 51)
  - tools/learning-loop-mcp/scripts/backfill-mechanism-check.mjs (the CAS-safe idempotent migration pattern)
  - tools/learning-loop-mcp/scripts/migrate-rule-entry-kind.mjs (the clean-break + idempotency + audit-trail pattern)
  - tools/learning-loop-mcp/core/gate-logic.js#checkResolutionEvidence (the consult-gate mechanism; rule-no-orphaned-evidence uses this)
  - tools/learning-loop-mcp/__tests__/gate-resolution-evidence.test.js (the test scaffolding for new consult-gate rules)
  - tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js (the regression guard for cold-tier size)
related_findings:
  - meta-260607T0008Z-dual-field-schema-risk-evidence-code-ref-top-level-vs-eviden (schema-drift, escalate, mechanism_check=true)
  - meta-260606T2102Z-agent-used-direct-file-i-o-node-e-scripts-importing-core-met (loop-anti-pattern, reported, mechanism_check=true)
  - meta-260606T2106Z-agent-called-meta-state-log-change-mcp-tool-5-times-in-succe (loop-anti-pattern, reported, mechanism_check=true)
---

# Dual-Field Schema Unification: evidence_code_ref (top-level) as Single Source of Truth + Gate Hardening

## TL;DR

The meta-state registry carries two equivalent fields for the same concept: `evidence_code_ref` (top-level, finding + rule schemas) and `evidence.code_ref` (nested, change-log schema). Two writers, two shapes. One consumer — `core/query-drift.js:37` — gates SP2 grounding on the top-level field only, silently dropping 30 entries (all change-logs + 1 finding with `evidence_journal` only) from drift detection. The legacy fallback chain `entry.evidence_code_ref ?? entry.evidence?.code_ref` works in 4 of 5 consumers, but the 5th (`queryDrift`) does not use it.

This report ships **a single-source-of-truth refactor + 2 hardening layers** in 7 TDD phases:

1. **Top-level `evidence_code_ref` wins.** Nested `evidence` block removed from `metaStateChangeEntrySchema`. Top-level promoted to canonical.
2. **In-place migration of 30 entries** via idempotent CAS-safe script. Idempotency, snapshot diff, partial-state recovery tests.
3. **`writeEntry` + `updateEntry` Zod-validated** against the 4-kind union. Defends against future drift at the chokepoint.
4. **4 writers updated** to emit top-level only. No more dual-write; the legacy fallback is deleted from 5 consumers.
5. **New consult-gate rule `rule-no-orphaned-evidence`** (resolution-evidence-required). `meta_state_resolve` consults the rule; ungrounded findings cannot be resolved.

Zero new schema types, zero new MCP tools, zero new artifact types (rule-no-new-artifact-types is active). The change-log schema is the only structural change. ~5KB code deletion, ~3KB new code, ~30 registry entries flattened.

## Problem Statement

### The bug (locked in meta-260607T0008Z-...)

`core/query-drift.js:37` reads:
```js
if (runGrounding && typeof entry.evidence_code_ref === "string") {
  grounding = checkGrounding(entry, codeContext);
}
```

`checkGrounding` (line 117) reads:
```js
const rawCodeRef = entry.evidence_code_ref ?? entry.evidence?.code_ref;
```

Same fallback is used in `derive-status.js:66`, `meta-state-refresh-fingerprint-tool.js:51`, `backfill-mechanism-check.mjs:45`. But `query-drift.js:37` does NOT use the fallback — it gates SP2 on the top-level field only. Result: 30 of ~50 entries (mostly change-logs) have only the nested form and skip SP2 grounding entirely.

### Root cause: two writers, two shapes

| Writer | Top-level `evidence_code_ref` | Nested `evidence.code_ref` |
|---|---|---|
| `meta_state_report` (finding) | yes | yes (backward-compat) |
| `meta_state_log_change` (change-log) | no | yes |
| `meta_state_propose_design` (loop-design) | n/a | n/a |
| `meta_state_promote_rule` (rule) | yes | n/a |

The `meta_state_report` tool writes BOTH fields for backward compat. The `meta_state_log_change` tool writes only the nested form (the change-log schema defines it that way). No canonical source.

### Root cause: schema divergence

`metaStateFindingEntrySchema` (line 7 in `core/meta-state.js`):
- `evidence_code_ref: z.string().optional()` (top-level)

`metaStateChangeEntrySchema` (line 51):
- `evidence: z.object({ code_ref, journal }).optional()` (nested)

Both schemas pass their own `.safeParse` independently. The Zod union `metaStateEntrySchema` accepts both shapes because each member schema does. No one checks cross-shape consistency.

### Root cause: `writeEntry` is unvalidated

`core/meta-state.js:159-170`:
```js
export function writeEntry(root, entry) {
  return enqueue(root, () => {
    ...
    lines.push(JSON.stringify(entry));
    ...
  });
}
```

No `metaStateEntrySchema.safeParse(entry)`. The MCP tool layer validates its own kind (e.g., `metaStateFindingEntrySchema` for findings) but does not cross-check. `updateEntry` (line 178) is also unvalidated.

### Impact (locked by the finding)

- **Drift blindness:** 30 entries skip SP2 grounding. False negatives for hash_mismatch and code_missing on the affected entries.
- **Audit trail pollution:** 30 entries carry the same data in two places, doubling the storage cost in `evidence.code_ref` for change-logs.
- **Schema intent drift:** the change-log schema's nested form is the older convention; the finding + rule schemas already use top-level. Drift is asymmetric.

## User-stated constraints (from session)

- **Schema winner:** top-level `evidence_code_ref`. Nested form is dropped.
- **Migration scope:** all 30 entries; in-place mutation; idempotent script.
- **Hardening:** A + B (Zod-validate in `writeEntry` + `updateEntry`; new consult-gate rule `rule-no-orphaned-evidence`).
- **Delivery shape:** brainstorm report + 7-phase TDD plan via `/ck:plan --tdd`.
- **Non-negotiable:** rule-no-new-artifact-types respected. Backward compatibility for the change-log `evidence.journal` and `evidence.test` fields preserved by promoting them to top-level `evidence_journal` and `evidence_test`.
- **Touchpoints:** `core/meta-state.js` (schemas + writeEntry/updateEntry), `core/query-drift.js` (line 37 simplification), `core/derive-status.js` (line 66 legacy fallback removal), `core/check-grounding.js` (line 117 legacy fallback removal), `tools/meta-state-refresh-fingerprint-tool.js` (line 51), `scripts/backfill-mechanism-check.mjs` (line 45), 4 writer tools (report, log_change, propose_design, promote_rule), new `scripts/flatten-evidence-fields.mjs`, new rule entry `rule-no-orphaned-evidence`, `core/gate-logic.js#checkResolutionEvidence` (consult-gate wiring).

## Evaluated Approaches

### Approach 1: nested `evidence.code_ref` wins (collapse findings)

**Position:** Pick the change-log's nested form as canonical. Migrate findings and rules to nested. Update 2 schemas. Affects 16+ findings + 4 rules = ~20 mutations.

**Pros:** Reuses the more compact nested block; change-logs need no change.
**Cons:** Breaks the existing `summarize()` field whitelists in `core/loop-introspect.js` (24+ fields read top-level). The 16 findings that already carry top-level need a 1-line structural rewrite. Migrating rules is awkward (rule schema is a different shape; nested would be a new sub-block). **REJECTED.**

### Approach 2: top-level `evidence_code_ref` wins (flatten change-logs) — CHOSEN

**Position:** Pick the finding + rule schema's top-level form as canonical. Migrate change-logs to top-level. Update `metaStateChangeEntrySchema` to drop the nested `evidence` block and add `evidence_code_ref` / `evidence_journal` top-level optional fields. Affects 30 entries (mostly change-logs).

**Pros:** Reuses the more-sprawled top-level convention (already used by 2 of 4 schemas). `summarize()` field whitelists need no change. `evidence_journal` and `evidence_test` migrate cleanly to top-level. The migration touches only the change-log schema + 30 change-log entries.

**Cons:** `metaStateChangeEntrySchema` shape changes (nested → top-level). 30 entries need in-place mutation. The `evidence` object literal in `meta-state-report-tool.js` is removed (it was a backward-compat shim).

**Verdict:** Lowest cost, highest clarity. Single source of truth at the schema level. All 4 schemas converge on the same field set.

### Approach 3: introduce `mechanism_ref` (new neutral name) — REJECTED

**Position:** Pick a new field name (e.g., `mechanism_ref`) that both writers can converge on. Migrate everything to the new name.

**Pros:** Clean break; no legacy form to maintain.
**Cons:** Touches 50+ entries (every entry with a code_ref). 4 schemas need the same field rename. 4 writers need to switch. 5 consumers need to switch. `summarize()` field whitelists need to be re-validated. **REJECTED — YAGNI.** The user already explicitly chose "top-level `evidence_code_ref`" over "new neutral name."

### Approach 4: status quo + only fix `queryDrift` — REJECTED

**Position:** Add the legacy fallback to `query-drift.js:37` and call it done. Leave the 30 entries untouched; let the writers continue to write dual shapes.

**Pros:** Smallest diff (1 line).
**Cons:** The schema divergence persists. Future writers may write nested only (recurrence of the same bug). `writeEntry` remains unvalidated. The user explicitly chose "all 30 entries: in-place mutation." **REJECTED.**

## Architecture (target end-state)

```
                  ┌─────────────────────────────┐
                  │  meta-state.jsonl (registry) │
                  │                              │
                  │  ALL entries have:          │
                  │    evidence_code_ref (top)  │  ◄── single source
                  │    [optional evidence_journal/test, top-level] │
                  │    (NO nested evidence.code_ref)              │
                  └─────────────────────────────┘
                              ▲
                              │ writeEntry/updateEntry
                              │ (Zod-validated against
                              │  metaStateEntrySchema union)
                              │
       ┌──────────────┬───────┴────────┬──────────────┐
       │              │                │              │
  meta_state_report  log_change  propose_design  promote_rule
  (writes only      (writes only  (writes only    (writes only
   top-level)        top-level)    top-level)      top-level)
```

The 4-kind union `metaStateEntrySchema` is the single source of truth for shape. `writeEntry` enforces it on every new write. `updateEntry` enforces it on every patch (using `.partial()`). Consumers read top-level only (no legacy fallback). The 5 currently-divergent consumers collapse into a single, simpler code path.

## Implementation Plan (7 phases, TDD)

### Phase 0 — Surface declaration + decision records

**Goal:** Declare the surface in `product/**` (N/A — this is meta work) and create 2 decision records in `records/<surface>/decisions/`. Follow the AGENTS.md "Decision records MUST exist before implementation phases begin" rule.

**Files:**
- Create `records/meta/decisions/decision-260607T-dual-field-schema-winner.yaml` (decision: top-level wins)
- Create `records/meta/decisions/decision-260607T-zod-validate-at-chokepoints.yaml` (decision: validate in `writeEntry` + `updateEntry`)

**Acceptance:** `pnpm validate:plan-loop` exits 0 with both decisions present.

### Phase 1 — Diagnostic red: count + dual-form coverage

**Goal:** Write the first test that captures the current state. Currently fails (30 entries carry nested form).

**Files:**
- Create `tools/learning-loop-mcp/__tests__/meta-state-evidence-coverage.test.js`

**Tests (3):**
1. **T-1: 0 entries carry nested `evidence.code_ref`.** Reads registry, asserts `entries.filter(e => e.evidence?.code_ref).length === 0`. **RED: 30 fail.**
2. **T-2: all active findings have `evidence_code_ref` or `evidence.code_ref` set.** Asserts no orphan findings. (Pre-Phase 1: 0 orphans; post-Phase 1: 0 orphans.)
3. **T-3: 4 schemas agree on `evidence_code_ref` field name and position.** Iterates the 4 schemas in `core/meta-state.js` and asserts all expose `evidence_code_ref` as a top-level field. (Pre-Phase 1: 2 of 4 pass; post-Phase 1: 4 of 4.)

**Acceptance:** T-1 fails, T-2 passes, T-3 fails. The 2 failing tests are the red signal for Phase 2.

### Phase 2 — Schema flatten (red→green)

**Goal:** Remove the nested `evidence` block from `metaStateChangeEntrySchema`. Add `evidence_code_ref`, `evidence_journal`, `evidence_test` as top-level optional fields on all 4 schemas. Update the Zod union `metaStateEntrySchema`.

**Files:**
- Modify `tools/learning-loop-mcp/core/meta-state.js`:
  - `metaStateChangeEntrySchema`: remove `evidence: z.object({...})` block; add `evidence_code_ref`, `evidence_journal`, `evidence_test` as top-level optional
  - All 4 schemas: ensure `evidence_code_ref` is a top-level optional
  - `metaStateEntrySchema`: no shape change (it's a union; the union's branches change)
- Modify `tools/learning-loop-mcp/core/loop-introspect.js#summarize`: confirm it reads top-level only (no change expected; verify the 24+ field whitelist)

**Tests:**
- Update `tools/learning-loop-mcp/__tests__/meta-state-schema.test.js`:
  - New: "change-log schema accepts top-level `evidence_code_ref`"
  - New: "change-log schema rejects nested `evidence.code_ref`"
  - New: "all 4 union branches expose `evidence_code_ref` top-level"
- Update `tools/learning-loop-mcp/__tests__/loop-describe.test.js` and `loop-describe-warm-tier.test.js`: confirm `summarize()` output unchanged for findings, rules, loop-designs, change-logs.

**Acceptance:** T-1 (Phase 1) still fails (30 entries unchanged). T-3 (Phase 1) passes. New schema tests pass. The change-log entries still carry the old shape — they haven't been migrated yet. **RED remains for the 30-entry migration in Phase 3.**

**Risk:** The change-log entries still carry the old shape and now FAIL `metaStateChangeEntrySchema.safeParse`. This is acceptable because `writeEntry` and `updateEntry` are still unvalidated in Phase 2 (validation is Phase 4). Phase 3 must complete before Phase 4.

### Phase 3 — In-place migration (red→green)

**Goal:** Migrate 30 entries in `meta-state.jsonl` from nested form to top-level form. Idempotent. CAS-safe. Atomic (defer writes until all validations pass).

**Files:**
- Create `tools/learning-loop-mcp/scripts/flatten-evidence-fields.mjs`

**Algorithm:**
```js
for each entry in registry:
  if entry.evidence?.code_ref and !entry.evidence_code_ref:
    entry.evidence_code_ref = entry.evidence.code_ref
  if entry.evidence?.journal and !entry.evidence_journal:
    entry.evidence_journal = entry.evidence.journal
  if entry.evidence?.test and !entry.evidence_test:
    entry.evidence_test = entry.evidence.test
  if entry.evidence is now {}: delete entry.evidence
  if entry.evidence has any other fields: keep (forward-compat)
  validate against entry_kind's schema (metaStateFindingEntrySchema / metaStateChangeEntrySchema / etc.)
  if validation fails: abort with error
  collect all updates, defer writes

for each pending update:
  writeEntry with CAS _expected_version
  if version_mismatch: warn, skip
```

**Idempotency:** skip if `evidence_code_ref` is already set (regardless of `evidence.code_ref` value).

**Tests (3):**
- `tools/learning-loop-mcp/__tests__/flatten-evidence-fields.test.js`:
  1. **Roundtrip:** apply script to fixture with 4 dual-form entries; assert 0 nested forms post-run; assert all 4 have top-level set; assert all 4 entries validate against their schema.
  2. **Idempotency:** run script twice on the same fixture; assert second run produces 0 changes; assert registry is byte-identical.
  3. **Partial-state recovery:** fixture with 1 entry already migrated, 1 not; assert only the un-migrated entry is rewritten; assert the already-migrated entry is untouched (CAS `_expected_version` matches).

**Acceptance:** T-1 (Phase 1) passes. T-3 (Phase 1) passes. New tests pass. `meta-state.jsonl` has 0 nested `evidence.code_ref` entries. Snapshot diff test passes.

**Real-world data:** 30 entries include ~16 change-logs (each with `evidence.code_ref` and `evidence.journal`); 1 entry with `evidence_journal` only (the dual-field-schema-risk finding itself, which has only `evidence.code_ref`); the rest are findings that write both forms (the `meta_state_report` backward-compat path). All 30 flatten cleanly.

### Phase 4 — Zod validate at chokepoints (red→green)

**Goal:** `writeEntry` validates against `metaStateEntrySchema.safeParse` (the 4-kind union). `updateEntry` validates against `metaStateEntrySchema.partial().safeParse` (the patch shape).

**Files:**
- Modify `tools/learning-loop-mcp/core/meta-state.js#writeEntry`:
  - Before `lines.push(JSON.stringify(entry))`: call `metaStateEntrySchema.safeParse(entry)`. If `!success`, throw `InvalidEntryError` with the validation errors.
  - The error class is exported for callers to catch.
- Modify `tools/learning-loop-mcp/core/meta-state.js#updateEntry`:
  - Before `Object.assign(entry, cleanPatch)`: call `metaStateEntrySchema.partial().safeParse(patch)`. If `!success`, return `"validation_failed"` (consistent with existing return shape: `null`, `true`, `"version_mismatch"`).
  - The `.partial()` shape covers `{ status, acked_at, resolved_at, resolved_by, ... }` and any other top-level field. It does NOT recurse into the entry_kind-specific shapes (that's the union's job).

**Tests (4 new in `meta-state.test.js`):**
1. `writeEntry` rejects entry missing required fields (e.g., finding with no `category`).
2. `writeEntry` accepts valid union member (4 sub-tests, one per kind).
3. `updateEntry` rejects bad patch (e.g., `{ category: "not-a-category" }`).
4. `updateEntry` accepts valid patch (e.g., `{ status: "active" }`).

**Acceptance:** All 4 tests pass. No regressions in the 4 writer tools (they already build valid entries).

**Caveat:** The migration script (`flatten-evidence-fields.mjs`) is a one-shot. It does not go through `writeEntry` because it uses direct file I/O (same pattern as `backfill-mechanism-check.mjs`). This is acceptable because the migration is a single, atomic, operator-confirmed operation. Future writes are validated.

### Phase 5 — Update 4 writers (red→green)

**Goal:** Remove dual-write from `metaStateReportTool`. Remove nested `evidence` block from `metaStateLogChangeTool`. Verify `metaStateProposeDesignTool` and `metaStatePromoteRuleTool` are unchanged (they already use top-level).

**Files:**
- Modify `tools/learning-loop-mcp/tools/meta-state-report-tool.js`:
  - Remove the `evidence: { ... }` block from the entry construction.
  - Top-level `evidence_code_ref`, `evidence_test`, `evidence_journal` remain.
- Modify `tools/learning-loop-mcp/tools/meta-state-log-change-tool.js`:
  - Change `evidence: { code_ref, journal }` to top-level `evidence_code_ref`, `evidence_journal`.
  - Update the tool description string to reflect top-level shape.
- Verify `tools/learning-loop-mcp/tools/meta-state-propose-design-tool.js` and `tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js` use top-level only (no change).

**Tests (2):**
- `tools/learning-loop-mcp/__tests__/meta-state-report-tool-extension.test.js`:
  - New: "report tool writes no nested `evidence` block (only top-level fields)"
- `tools/learning-loop-mcp/__tests__/meta-state-log-change.test.js`:
  - New: "log-change tool writes top-level `evidence_code_ref`, not nested `evidence.code_ref`"

**Acceptance:** Both tests pass. The 2 writer tool descriptions are updated. No regressions in the 2 unchanged writers.

### Phase 6 — New consult-gate rule (red→green)

**Goal:** Create `rule-no-orphaned-evidence` (resolution-evidence-required). Wire it into `core/gate-logic.js#checkResolutionEvidence` so `meta_state_resolve` consults the rule.

**Files:**
- Add rule entry to `meta-state.jsonl`:
  - `id: "rule-no-orphaned-evidence"`
  - `entry_kind: "rule"`
  - `origin: "meta-260607T0008Z-..."` (the finding this report resolves)
  - `enforcement: "agent"` (consult-gate; not a command-path match)
  - `pattern_type: "resolution-evidence-required"`
  - `pattern: "meta-260607T0008Z-..."` (or similar; the gate consults the registry)
  - `description: "All active findings with mechanism_check=true must have an evidence_code_ref whose current hash matches the stored code_fingerprint. ..."`
  - `status: "active"`
  - `promoted_at`, `promoted_by`
- Modify `tools/learning-loop-mcp/core/gate-logic.js#checkResolutionEvidence`:
  - Add a new branch: when `rule.pattern_type === "resolution-evidence-required"` AND the pattern matches this rule's id (`rule-no-orphaned-evidence`), read all active findings with `mechanism_check === true`; for each, verify `code_fingerprint` matches the current SHA-256 of `evidence_code_ref`; if any fails, return `{ resolved: false, reason: "orphaned_evidence", orphans: [...] }`.

**Tests (2 new in `gate-resolution-evidence.test.js`):**
1. **T-A: rule-no-orphaned-evidence blocks resolution when an active finding has mechanism_check=true and code_fingerprint mismatch.**
2. **T-B: rule-no-orphaned-evidence allows resolution when all active findings are grounded (fingerprint matches or mechanism_check is not true).**

**Acceptance:** Both tests pass. `meta_state_resolve` consults the rule and blocks resolution on ungrounded findings.

**Design note:** The rule's `pattern` field is the rule's own id (a self-reference). The `checkResolutionEvidence` function reads the registry, finds this rule, and runs the orphan check. This is the same pattern as `rule-cold-session-test-must-pass-before-resolution` (which uses `pattern: "test-cold-session-mcp-client-loading"` to identify the test session_id).

### Phase 7 — Cold-tier regression + integrity sweep

**Goal:** Verify all changes hold end-to-end. Run the full test suite. Verify the registry is consistent.

**Files:**
- Update `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js`:
  - Add a new bucket `dual_form_entries` with tolerance 0 (post-Phase 3: 0 entries should have nested `evidence.code_ref`).
  - Add a new bucket `no_top_level_evidence_code_ref` with tolerance 0 (post-Phase 3: 0 active findings should be missing `evidence_code_ref`).
- Update `tools/learning-loop-mcp/__tests__/query-drift.test.js`:
  - Add T-25: "drift detection now covers all 30 previously-skipped entries (no regression in drift count when re-run against the flattened registry)"
  - Add T-26: "drift detection returns 0 orphans for entries that were previously skipped (after Phase 3)"
  - Add T-27: "drift detection returns the same drift count before and after migration for entries that were previously grounded (regression guard)"

**Acceptance:**
- `pnpm test` passes 100% (or with the 1 pre-existing `gate-integration` failure per `meta-260607T0715Z-...`).
- `pnpm validate:records` passes.
- `pnpm validate:plan-loop` passes.
- `pnpm generate:capabilities --dry-run` passes.
- `pnpm check` passes.
- `meta-state-evidence-coverage.test.js` (Phase 1) passes for all 3 tests.
- The 30 entries are flattened; 0 entries carry nested `evidence.code_ref`.

## Risk Map

| Risk | Severity | Mitigation |
|---|---|---|
| Migration script corrupts registry | High | CAS via `_expected_version` (same pattern as `backfill-mechanism-check.mjs`); snapshot diff test before commit; defer all writes until all validations pass; abort on first validation failure |
| Phase 2 schema flatten breaks `meta-state-list-compact.test.js` (uses `evidence_code_ref` in fixtures) | Med | Update fixtures to match new shape; run Phase 1 tests as the gate |
| Zod union `.partial()` rejects valid patches | Med | Test with realistic patch shapes from `meta_state_resolve`, `meta_state_sweep`, `meta_state_promote_rule`; use `.partial()` carefully on the OUTER shape |
| Consult-gate rule fires on legitimate findings with no `evidence_code_ref` | Med | Rule exempts findings where `mechanism_check !== true` (i.e., not claimed to be grounded) |
| Cold-tier regression test fixture (captured 2026-06-07) gets stale | Low | Same `TOLERANCES` pattern from the code review (C1 fix). New buckets get tolerance 0 after Phase 3 |
| The 1 entry with `evidence_journal` only (the dual-field-schema-risk finding itself) needs special handling | Low | The migration script's journal/test branches handle this; same algorithm as code_ref |
| `meta_state_report` tool description string references the dual-write | Low | Update the tool description in Phase 5 |
| `gate-promoted-rules.test.js` may be affected by new rule | Low | New rule is `resolution-evidence-required` (consult-gate), not `regex` or `glob`; doesn't apply to command-path matching |

## What Stays / What Changes

| Component | Before | After |
|---|---|---|
| `metaStateFindingEntrySchema` | `evidence_code_ref` top-level | Same (already correct) |
| `metaStateChangeEntrySchema` | `evidence: { code_ref, journal }` nested | Top-level `evidence_code_ref`, `evidence_journal`; nested block removed |
| `metaStateLoopDesignSchema` | No `evidence` field | Same (no change) |
| `metaStateRuleEntrySchema` | `evidence_code_ref` top-level | Same (already correct) |
| `writeEntry` | No validation | `metaStateEntrySchema.safeParse` |
| `updateEntry` | No validation | `metaStateEntrySchema.partial().safeParse` |
| `metaStateReportTool` | Writes both top-level + nested | Writes only top-level |
| `metaStateLogChangeTool` | Writes only nested | Writes only top-level |
| `core/query-drift.js:37` | `entry.evidence_code_ref` only (no fallback) | Same (now ALL entries have it) |
| `core/derive-status.js:66` | `entry.evidence_code_ref ?? entry.evidence?.code_ref` | `entry.evidence_code_ref` only (legacy fallback removed) |
| `core/check-grounding.js:117` | Same legacy fallback | Same simplification |
| `tools/meta-state-refresh-fingerprint-tool.js:51` | Same legacy fallback | Same simplification |
| `scripts/backfill-mechanism-check.mjs:45` | Same legacy fallback | Same simplification |
| `core/loop-introspect.js#summarize` | Reads top-level | Same (no change) |
| New rule entry | — | `rule-no-orphaned-evidence` (resolution-evidence-required) |
| `meta-state.jsonl` | 30 entries with nested `evidence.code_ref` | 0 entries (all flattened) |
| 4 writer tools | 1 writes dual, 1 writes nested | 0 write dual/nested (all write top-level) |

## Success Metrics

- `pnpm test` passes 100% (or with the 1 pre-existing `gate-integration` failure, which is a known state per `meta-260607T0715Z-...`).
- `meta-state-evidence-coverage.test.js` (Phase 1) passes all 3 tests.
- `meta-state-schema.test.js` passes; 4 union members all with `evidence_code_ref` as the only code-ref field.
- New consult-gate rule `rule-no-orphaned-evidence` is active and prevents `meta_state_resolve` on ungrounded findings.
- `query-drift.test.js` T-25..T-27 added: drift detection now covers all 30 previously-skipped entries (no regression in drift count when re-run against the flattened registry).
- `meta_state_report` tool description string updated to reflect top-level write.
- `meta_state_log_change` tool description string updated to reflect top-level write.
- `meta-state.jsonl`: 0 entries with nested `evidence.code_ref`.
- Plan: `plans/260607-dual-field-schema-unification/plan.md` with 7 phases, each TDD red→green.

## Out of Scope (deliberately)

- Renaming `evidence_code_ref` to `mechanism_ref` (the user picked "top-level field" as the winner, not "new neutral name"). YAGNI.
- Adding `evidence_code_ref` to `metaStateLoopDesignSchema` (loop-designs don't have evidence per the schema; out of scope for this finding).
- Touching the `records/**` schemas (`decision.schema.json`, etc.) — they have a separate `source_refs` field, not the dual-shape problem.
- Removing the `entry_kind: "change-log"` exemption from compaction (orthogonal concern; not blocking this work).
- Migrating the `evidence: { code_ref }` form in any other registry file (e.g., `records/observations/`). Out of scope; the finding is about `meta-state.jsonl`.

## Open Questions (deferred)

- **Q1:** Should the new `InvalidEntryError` be exported from `core/meta-state.js` for the tool layer to catch? — Decision: yes, export it; tool layer catches and returns `{ error: "invalid_entry", errors: [...] }` for the MCP response.
- **Q2:** Should the `meta_state_sweep` tool also consult `rule-no-orphaned-evidence`? — Decision: no; sweep is for expiry transitions, not for orphan resolution. The rule only gates `meta_state_resolve`.
- **Q3:** Should the consult-gate rule's `pattern` field be the rule's own id or a separate field? — Decision: use the rule's own id; `checkResolutionEvidence` already has the rule object in scope.

## Hand-off

The 7-phase TDD plan is ready for `/ck:plan --tdd`. The plan folder will be `plans/260607-dual-field-schema-unification/` and will follow the same structure as `plans/260606-rule-loop-design-first-class/` (plan.md + phase-00..phase-06 .md with TDD red→green tests).
