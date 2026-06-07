## Code Review Summary — Red Team / Fact Checker

### Scope
- Plan: plans/260607-dual-field-schema-unification/ (7 phases)
- Files reviewed: plan.md, phase-01-0.md through phase-07-6.md
- LOC: ~500 lines of plan text
- Focus: fact-check every codebase claim against live files
- Scout method: grep + glob + read on 20+ source files

### Overall Assessment
The plan's central problem statement — "30 entries carry only the nested form and skip SP2 grounding" — is factually false. The actual registry has only 2 such entries. This 15x inflation invalidates the plan's scope, effort estimates, risk weighting, and the migration script's design (which is built for 30 entries). Multiple secondary claims are also wrong: stale pre-existing failure assumptions, invented test numbers, incorrect API return-shape descriptions, and fields that already exist being described as "new." The plan requires major revision before it can be approved for implementation.

---

## Finding 1: The "30 entries" claim is false by a factor of 15x
- **Severity:** Critical
- **Location:** plan.md Problem Statement, TL;DR, Phase 1, Phase 3, Phase 6, Phase 7
- **Flaw:** The plan claims "30 of ~50 entries (mostly change-logs) carry only the nested form and skip SP2 entirely." Independent grep analysis of `meta-state.jsonl` shows only **2** entries have ONLY the nested `evidence.code_ref` form (lines 16 and 30). The other 18 entries that have a nested `evidence` block also have a top-level `evidence_code_ref`. Therefore `queryDrift` at line 37 (`typeof entry.evidence_code_ref === "string"`) is only skipping 2 entries, not 30.
- **Failure scenario:** The migration script is designed for 30 entries (CAS batch, structured logging, 1.5h effort). Running it on 2 entries is trivial over-engineering. The Phase 1 test `T-1` expects 30 failures but will only see 2, making the "RED" signal far weaker than expected. The Phase 7 consult-gate rule `rule-no-orphaned-evidence` is justified by "30 previously-orphaned entries" but there are only 2.
- **Evidence:**
  - `grep -c '"evidence_code_ref"' meta-state.jsonl` → 18 entries
  - `grep -c '"evidence.code_ref"' meta-state.jsonl` → 20 entries
  - `grep -n '"evidence.code_ref"' meta-state.jsonl | while read line; do ...` → only lines 16 and 30 lack top-level `evidence_code_ref`
  - `meta-state.jsonl:54` (finding `meta-260607T0008Z`) contains the same false "30 entries" claim — the plan blindly copied the finding without independent verification
- **Suggested fix:** Re-characterize the problem as "2 entries have only nested form + 18 entries carry redundant dual form." Scope the migration to flatten the 18 redundant entries (delete the nested block) and promote the 2 orphan entries. Reduce effort estimate from 1.5h to ~15m. Remove the "30 entries" justification from all risk assessments.

---

## Finding 2: `checkResolutionEvidence` return shape is misrepresented
- **Severity:** Critical
- **Location:** Phase 7, section "Implementation Steps", pseudocode block
- **Flaw:** The plan describes `checkResolutionEvidence(rule, root)` as returning `{ resolved: true/false, reason: "..." }`. The actual function returns `{ satisfied: true/false, blocking_id, rule_id, applies_to_resolution }`. The Phase 6 pseudocode proposes returning `{ resolved: false, reason: "orphaned_evidence", orphans: [...] }` which would break the existing caller `meta-state-resolve-tool.js` that expects `evidence.satisfied` and `evidence.blocking_id`.
- **Failure scenario:** If the Phase 6 pseudocode is implemented as written, `meta_state_resolve` will read `result.satisfied` on an object that has `resolved` instead, causing `!evidence.satisfied` to be `true` (undefined is falsy), which will block ALL resolutions regardless of whether the rule passed. The `appendGateLog` will also emit malformed data because `blocking_id` will be undefined.
- **Evidence:**
  - `gate-logic.js:656-674` — actual return shape: `{ satisfied, blocking_id, rule_id, applies_to_resolution }`
  - `meta-state-resolve-tool.js:71-77` — caller reads `evidence.satisfied`, `evidence.blocking_id`, `evidence.applies_to_resolution`
  - Phase 7 pseudocode: `return { resolved: false, reason: "orphaned_evidence", orphans: [...] }` — incompatible
- **Suggested fix:** Keep the existing return shape. Add `orphans` as an additional field on the existing shape: `{ satisfied: false, blocking_id: orphans[0]?.id, rule_id, applies_to_resolution, orphans }`. Update the caller in `meta-state-resolve-tool.js` to log `orphans` when present.

---

## Finding 3: Pre-existing failure claim is stale — gate-integration tests now pass
- **Severity:** Critical
- **Location:** plan.md Success Criteria, Phase 3, Phase 4, Phase 5, Phase 6, Phase 7
- **Flaw:** The plan repeatedly says "allow 1 pre-existing failure: gate-integration.test.cjs" and cites finding `meta-260607T0715Z`. That finding is **resolved** with resolution: "All 28 tests now pass (was 25 pass / 3 fail). Full test suite: 812 pass / 0 fail." The plan is working from stale data.
- **Failure scenario:** If the implementer assumes 1 pre-existing failure is acceptable, they will ignore actual regressions introduced by the migration. The test suite is currently clean (0 failures); any new failure is a real regression.
- **Evidence:**
  - `meta-state.jsonl:56` — finding `meta-260607T0715Z` has `status: "resolved"`, `resolution: "All 28 tests now pass..."`
- **Suggested fix:** Remove all "allow 1 pre-existing failure" language from success criteria. Replace with "0 failures expected".

---

## Finding 4: `query-drift.test.js` T-25..T-27 do not exist
- **Severity:** High
- **Location:** plan.md Success Criteria, Phase 7
- **Flaw:** The plan claims "`query-drift.test.js` T-25..T-27: drift detection now covers all 30 previously-skipped entries." The file only has tests T-1 through T-24. There is no T-25, T-26, or T-27.
- **Failure scenario:** The implementer will search for these tests, fail to find them, and either waste time or invent them incorrectly. The success criteria are unverifiable.
- **Evidence:**
  - `query-drift.test.js:379` — total lines in file
  - `grep -n "T-2[567]" tools/learning-loop-mcp/__tests__/query-drift.test.js` → no matches
  - Last test in file: `T-24: when SP1 is mechanism-shipped and SP2 returns grounded/skipped/unknown, recommendation is resolve` (line 362)
- **Suggested fix:** Change to "T-25 through T-27: add 3 new tests" (these do not exist yet; they must be created in a new phase). Alternatively, append the tests to the existing file as part of Phase 7.

---

## Finding 5: `metaStateFindingEntrySchema` already has `evidence_journal` and `evidence_test`
- **Severity:** High
- **Location:** Phase 2, section "Implementation Steps", step 2
- **Flaw:** The plan says "Modify `metaStateFindingEntrySchema`. Add 2 new top-level optional fields: `evidence_journal`, `evidence_test`. (Already has `evidence_code_ref`.)" Both fields already exist at lines 36-38.
- **Failure scenario:** The implementer will attempt to add duplicate fields, causing a syntax error or a no-op diff. The "clean break" narrative is weakened because the finding schema already has the target shape.
- **Evidence:**
  - `meta-state.js:36` — `evidence_journal: z.string().optional().describe("Path to related journal file")`
  - `meta-state.js:38` — `evidence_test: z.string().optional().describe("Test file reference")`
- **Suggested fix:** Remove step 2 from Phase 2. Note that `metaStateFindingEntrySchema` is already correct; only `metaStateChangeEntrySchema` and `metaStateRuleEntrySchema` need modification.

---

## Finding 6: `summarize()` in `loop-introspect.js` does NOT read `evidence_code_ref`
- **Severity:** High
- **Location:** Phase 2, section "Implementation Steps", step 4
- **Flaw:** The plan says "Verify `summarize()` in `loop-introspect.js`. Confirm it reads `entry.evidence_code_ref` directly (not `entry.evidence?.code_ref`). The existing 24+ field whitelist should already be top-level." The `summarize()` function has a 40+ field whitelist and `evidence_code_ref` is **completely absent** from it. It is neither read top-level nor nested.
- **Failure scenario:** The compact-mode test (`meta-state-list-compact.test.js`) explicitly asserts `entry.evidence_code_ref === undefined` and `entry.evidence === undefined`. If the plan's follow-up removes the legacy fallback from consumers, the compact mode will still not expose `evidence_code_ref`. The plan's verification step is a no-op that gives false confidence.
- **Evidence:**
  - `loop-introspect.js:357-396` — `summarize()` whitelist includes `id`, `entry_kind`, `status`, `origin`, `addresses`, `consolidated_into`, `supersedes`, `promoted_to_rule`, `proposed_design_for`, `created_at`, `severity`, `affected_system`, `category`, `subtype`, `title`, `rule_id`, `enforcement`, `pattern_type`, `pattern`, `scope_predicate`, `applies_to_resolution`, `shipped_in_plan`, `shipped_at`, `severity_hint`, `promoted_at`, `promoted_by`, `refined_at`, `refined_by`, `refinement_reason`, `resolution`, `resolved_by`, `resolved_at`, `version` — **no `evidence_code_ref`**
  - `meta-state-list-compact.test.js:48-52` — explicit assertions that `evidence_code_ref` and `evidence` are `undefined` in compact mode
- **Suggested fix:** Remove the false verification step. If `evidence_code_ref` should be in compact mode, add it to `summarize()` and update the compact test. If not, acknowledge the exclusion explicitly.

---

## Finding 7: `backfill-mechanism-check.mjs` does NOT use deferred-write pattern
- **Severity:** Medium
- **Location:** Phase 3, section "Architecture" and "Implementation Steps"
- **Flaw:** The plan claims the migration script should reuse the "CAS-safe idempotent migration pattern" from `backfill-mechanism-check.mjs` where "defer all writes until all validations pass; abort on first failure." The actual `backfill-mechanism-check.mjs` writes per-entry immediately via `updateEntry` inside a `for` loop. It does NOT collect all pending updates and defer them.
- **Failure scenario:** The migration script's atomicity requirement is based on a pattern that doesn't exist in the reference file. The implementer may write a more complex script than necessary, or may write one that doesn't actually match the claimed reference.
- **Evidence:**
  - `backfill-mechanism-check.mjs:68-85` — `for (const entry of resolvedFindings) { ... const r = await updateEntry(...) ... }` writes immediately per entry, no batching
- **Suggested fix:** Clarify that the reference script provides CAS idempotency but NOT deferred-write atomicity. The new migration script should either match the reference (per-entry CAS) or explicitly implement deferred writes (collect patches, validate all, then write all). Do not claim both properties from the reference.

---

## Finding 8: Reference decision file `decision-260606T-rule-loop-design-first-class.yaml` does not exist
- **Severity:** Medium
- **Location:** Phase 0, section "Implementation Steps", step 1
- **Flaw:** The plan says "Use the same shape as `records/meta/decisions/decision-260606T-rule-loop-design-first-class.yaml` (referenced from the sibling plan)." This file does not exist in `records/meta/decisions/`.
- **Failure scenario:** The implementer will search for the reference file, not find it, and may create a decision record with the wrong shape. The Phase 0 gate (`pnpm validate:records`) may fail because the reference shape is unknown.
- **Evidence:**
  - `ls records/meta/decisions/` — no file matching `decision-260606T-rule-loop-design-first-class.yaml`
  - `grep -r "rule-loop-design-first-class" records/` → no results
- **Suggested fix:** Identify the actual sibling decision record to use as reference (e.g., `decision-meta-260512T0046Z-loop-meta-evidence-gap-revisit.yaml` or any existing file in `records/meta/decisions/`). Update the plan with the correct filename.

---

## Finding 9: `meta-state-list-compact.test.js` is NOT at risk from schema flatten
- **Severity:** Medium
- **Location:** Phase 2, Risk Assessment
- **Flaw:** The plan lists "Phase 3 schema flatten breaks `meta-state-list-compact.test.js` fixtures" as a risk with "Med" severity. The test explicitly asserts that `entry.evidence` and `entry.evidence_code_ref` are `undefined` in compact mode. The `summarize()` function does not include these fields. Therefore, removing the nested `evidence` block from the schema makes the test MORE likely to pass, not less.
- **Failure scenario:** The implementer may unnecessarily update the compact test or create a workaround for a non-problem. This is wasted effort.
- **Evidence:**
  - `meta-state-list-compact.test.js:43-52` — `assert.strictEqual(entry.evidence, undefined)` and `assert.strictEqual(entry.evidence_code_ref, undefined)`
  - `loop-introspect.js:357-396` — `summarize()` does not include `evidence` or `evidence_code_ref`
- **Suggested fix:** Remove this risk from the Risk Assessment. The compact test is a regression guard for the CURRENT shape, which is unaffected by removing the nested block.

---

## Finding 10: Report tool description has no "backward compatibility" mention to remove
- **Severity:** Medium
- **Location:** Phase 5, section "Implementation Steps", step 1 and step 2
- **Flaw:** The plan says "Update the tool description string for `meta_state_report` and `meta_state_log_change` to mention 'top-level' fields" and "remove the 'backward compatibility' mention." The current `metaStateReportTool.description` does not contain the words "backward compatibility" or "backward-compat". The `metaStateLogChangeTool.description` also does not contain them.
- **Failure scenario:** The implementer will search for the phrase, not find it, and may make an unnecessary or incorrect edit.
- **Evidence:**
  - `meta-state-report-tool.js:12` — description is: "Report a new meta-state finding... Optional but recommended: pass `evidence_code_ref`... Markdown paths in `source_refs` are deprecated..."
  - `meta-state-log-change-tool.js:9` — description is: "Log a system change... The entry is immutable, status=active, no TTL. Use supersedes to replace a prior change entry."
- **Suggested fix:** Remove the "remove backward compatibility mention" instruction. The description strings are already clean. Optionally add a note that they already mention `evidence_code_ref`.

---

## Positive Observations
- The plan correctly identifies that `metaStateReportTool` and `metaStateLogChangeTool` write nested `evidence` blocks (verified at `meta-state-report-tool.js:42-46` and `meta-state-log-change-tool.js:59-62`).
- The plan correctly identifies that `writeEntry` and `updateEntry` are unvalidated (verified at `meta-state.js:196-207` and `216-269`).
- The plan correctly identifies that `meta_state_resolve` consults `checkResolutionEvidence` (verified at `meta-state-resolve-tool.js:66-87`).
- The plan correctly references the actual finding ID `meta-260607T0008Z` (verified at `meta-state.jsonl:54`).

---

## Recommended Actions (prioritized)

1. **Re-audit the registry:** Count actual entries with ONLY nested form. The correct count is 2, not 30. Re-scope the entire plan around this reality.
2. **Fix `checkResolutionEvidence` pseudocode:** Match the existing return shape `{ satisfied, blocking_id, rule_id, applies_to_resolution }` and update the caller.
3. **Remove stale pre-existing failure language:** `gate-integration.test.cjs` currently passes 0 failures.
4. **Fix test references:** `query-drift.test.js` only has T-1..T-24. Remove or redefine T-25..T-27.
5. **Correct Phase 2 schema changes:** `metaStateFindingEntrySchema` already has `evidence_journal` and `evidence_test`. Only `metaStateChangeEntrySchema` and `metaStateRuleEntrySchema` need updates.
6. **Correct `summarize()` verification:** Remove the false claim that `summarize()` reads `evidence_code_ref`.
7. **Correct deferred-write claim:** The backfill script does not defer writes. Clarify the migration's atomicity semantics.
8. **Find correct decision reference:** `decision-260606T-rule-loop-design-first-class.yaml` does not exist.
9. **Remove false risk:** `meta-state-list-compact.test.js` is not at risk from schema flatten.
10. **Remove false description change:** No "backward compatibility" mention exists in the tool descriptions.

---

## Unresolved Questions
- Is the `meta-260607T0008Z` finding itself (line 54 of meta-state.jsonl) also inflated, or did the plan author misread it? The finding explicitly says "30 entries in the registry carry only the nested form" which is the root of the plan's error.
- Does the `rule-no-orphaned-evidence` consult-gate rule need to handle `meta_state_resolve` with `resolved_by: "operator"` bypass? The plan does not address this.
