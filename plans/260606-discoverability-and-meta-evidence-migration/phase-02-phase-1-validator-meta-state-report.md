---
phase: 2
title: "Phase 1 Validator + meta_state_report"
status: completed
priority: P2
effort: "2h"
dependencies: [1]
---

# Phase 2: Phase 1 Validator + meta_state_report

## Overview

Migrate the source-ref validator from `local:records/meta/evidence/*` to `local:meta-state:<id>` and update the `meta_state_report` tool description to surface the internalization rule. TDD: 6 new tests lock the contract before any code changes.

## Requirements
- **Functional:**
  - `validateSourceRef("local:meta-state:meta-260601T1339Z-the-learning-loop-has-no-mechanism-...", "decision", root)` returns `{ valid: true }` ONLY IF the id exists in `readRegistry(root)`; otherwise `{ valid: false, error: "meta-state entry <id> not found in registry" }`.
  - `validateSourceRef("local:records/meta/evidence/x.md", "decision", root)` returns `{ valid: false, error: <new error message> }`.
  - `validateSourceRef("local:plans/x.md", "decision", root)` returns `{ valid: true, deprecated: true }` (markdown ref accepted but flagged).
  - `validateSourceRef("local:meta-state:", "decision", root)` returns `{ valid: false, error: "must contain a meta-state entry ID" }` (empty id rejected).
  - `validateSourceRef("local:meta-state:obs-mpef2h6z-...", "decision", root)` returns `{ valid: false, error: "id prefix must be 'meta-' (got 'obs-'; observation ids are not meta-state entries)" }` (cross-namespace pollution rejected).
  - `validateSourceRef("local:meta-state:meta-../../etc/passwd", "decision", root)` returns `{ valid: false, error: "id contains path-traversal characters ('..' or '/')" }` (path-traversal rejected).
  - `meta_state_report` tool description string contains the substring `"evidence_code_ref"` AND `"meta_state_derive_status"` (downgraded from "Prefer" to "Optional but recommended for code-pointed findings" — see Risk 1 mitigation).
- **Non-functional:**
  - The 2 existing tests at `lib/source-ref-validator.test.js:21-27` and `:5-7` that accept `local:records/meta/evidence/*` and `local:records/evidence/*` respectively are REPLACED (not preserved); the new tests are net additions. (The 18-test file becomes a 17-19 test file depending on replacements.)
  - The 2 archived observations (`obs-mpef2h6z-9fefeed8` and `obs-mpfnglt7-abac55c4`) carry `source_refs: ["local:.claude/coordination/hooks/write-coordination-gate.cjs", "local:CLAUDE.md"]` and `["local:constraint-gate-mcp"]` respectively — paths the validator would already reject. They stay as historical artifacts (no re-validation); the new validator's "no `local:records/meta/evidence/*`" rule does not affect them. Risk 1 in this phase is updated accordingly.
  - The 2 underlying core validators (`lib/source-ref-validator.js` + `core/record-validation-rules.js#recordLocalRoots`) stay aligned: both reject `local:records/meta/evidence/*` and both accept `local:meta-state:<id>` via the same existence-check path.
  - `records/meta/evidence/` directory is deleted (was empty after the 2 archives per the brainstorm's verification).

## Architecture
- **Validator change:** add a new `local:meta-state:<id>` branch BEFORE the generic `local:` branch in `lib/source-ref-validator.js`. The new branch extracts `<id>` after the `local:meta-state:` prefix, validates the id's shape with the tightened regex `^meta-[0-9]{6}T[0-9]{4}Z-[a-z0-9-]{1,200}$` (mirrors `core/meta-state.js#generateId` output), rejects path-traversal characters (`..`, `/`, `\0`), and verifies existence via `readRegistry(root).some(e => e.id === entryId)`. Returns `{ valid: true }` only on full match; `{ valid: false, error: <reason> }` otherwise.
- **Markdown deprecation:** the existing `local:` branch (which calls `validateAllowedLocalPath` against `records/evidence` + `records/*/evidence` + `records/meta/evidence`) is kept but augmented to return `{ valid: true, deprecated: true }` for paths matching `local:plans/...` or `local:docs/...`. The `records/meta/evidence/*` path becomes hard-rejected. To make the deprecation REAL (not just advisory), the `record_create_decision` handler at `tools/create-decision-record-tool.js` is updated in Phase 1 to reject when ANY `source_ref` has `validateSourceRef` returning `deprecated: true` — see Implementation Step 4.5.
- **Core validator alignment:** the underlying `core/record-validation-rules.js#recordLocalRoots` (line 174) is updated to add a new branch for `local:meta-state:<id>` that mirrors the wrapper's regex + existence check. Both validators must stay in sync to avoid two-validator inconsistency.
- **Tool description change:** single string amendment in `tools/meta-state-report-tool.js`. The schema, handler, and entry shape are unchanged. The description downgrades "Prefer" to "Optional but recommended" to match the schema's actual `optional()` constraint.

## Related Code Files
- Modify: `tools/learning-loop-mcp/lib/source-ref-validator.js` (add `local:meta-state:` branch with tightened regex + existence check; deprecate markdown; reject `records/meta/evidence`)
- Modify: `tools/learning-loop-mcp/lib/source-ref-validator.test.js` (add 7 new tests + REPLACE 2 existing tests that accepted the now-rejected path)
- Modify: `tools/learning-loop-mcp/tools/meta-state-report-tool.js` (description amendment only)
- Modify: `tools/learning-loop-mcp/core/record-validation-rules.js#recordLocalRoots` (line 174; add `local:meta-state:<id>` branch that mirrors the wrapper)
- Modify: `tools/learning-loop-mcp/tools/create-decision-record-tool.js` (reject when any `source_ref` returns `deprecated: true` from `validateSourceRef`)
- Delete: `records/meta/evidence/` (empty directory per brainstorm verification 2026-06-06)
- Create: `tools/learning-loop-mcp/__tests__/source-ref-meta-state-branch.test.js` (new file; isolated test of the new branch)

## Implementation Steps (TDD: red → green → refactor)

1. **Red: write 7 failing tests in `lib/source-ref-validator.test.js`** (extend the existing `describe("validateSourceRef")` block):
   - Test 1: `local:meta-state:meta-260601T1339Z-...` is valid (entry exists in registry; use `mkdtempSync` + create a stub `meta-state.jsonl` with a matching entry).
   - Test 2: `local:meta-state:meta-doesnotexist-...` is invalid with "not found in registry" error.
   - Test 3: `local:meta-state:obs-mpef2h6z-...` is invalid with "id prefix must be 'meta-'" error (cross-namespace pollution).
   - Test 4: `local:meta-state:meta-../../etc/passwd` is invalid with "id contains path-traversal characters" error.
   - Test 5: `local:meta-state:` (empty id) is invalid with "must contain a meta-state entry ID" error.
   - Test 6: `local:records/meta/evidence/x.md` is invalid with the new error message.
   - Test 7: `local:plans/x.md` is valid + `deprecated: true`.
   - Run: `cd tools/learning-loop-mcp && node --test lib/source-ref-validator.test.js` — expect 7 failures (and the 2 existing tests for `local:records/meta/evidence/*` and `local:records/evidence/*` will continue to pass since the deprecation logic in step 2 only changes the meta/evidence rejection — see Step 2).
2. **Green: implement the new branch in `lib/source-ref-validator.js`**:
   - Add `if (ref.startsWith("local:meta-state:"))` branch BEFORE the generic `local:` branch.
   - Extract `const entryId = ref.slice("local:meta-state:".length)`.
   - Validate:
     - `entryId.length > 0 && entryId.length <= 200` (no empty, no overflow).
     - Does NOT contain `..`, `/`, `\0`, or `\\` (path-traversal rejection).
     - Matches tightened regex: `/^meta-\d{6}T\d{4}Z-[a-z0-9-]{1,200}$/` (mirrors `core/meta-state.js#generateId`).
   - Existence check: `readRegistry(root).some(e => e.id === entryId)`. If false → `{ valid: false, error: "meta-state entry <id> not found in registry" }`.
   - Return `{ valid: true }` only on full match.
   - Modify the existing `local:` branch to:
     - Reject `local:records/meta/evidence/*` explicitly with the new error message.
     - Accept `local:plans/...` and `local:docs/...` with `{ valid: true, deprecated: true }`.
   - Run the test suite — expect 18+7 passing (15 existing that aren't replaced + 7 new + 2 replaced tests). Net: 21-23 tests in the file (the 2 replaced tests are rewritten to assert the new behavior; they count as "new" not "preserved").
3. **Green: align `core/record-validation-rules.js#recordLocalRoots`** (line 174) to add a `local:meta-state:<id>` branch that mirrors the wrapper's regex + existence check. Add a unit test in `core/record-validation-rules.test.js` (if it doesn't exist, create it).
4. **Refactor: extract the id-validation regex + traversal check** to a module-level constant (`META_STATE_ID_PATTERN`, `PATH_TRAVERSAL_PATTERN`) so the test can import them. No behavior change.
4.5. **Wire `record_create_decision` to reject deprecated refs:** modify `tools/learning-loop-mcp/tools/create-decision-record-tool.js` to check `result.deprecated` from `validateSourceRefs` and throw an error if any ref is deprecated. Add 1 new test in `__tests__/create-decision-record-tool.test.js` (create the test file if it doesn't exist).
5. **Red: write 1 failing test for the description amendment** in a new file `tools/learning-loop-mcp/__tests__/meta-state-report-description.test.js`:
   - Import the tool object from `tools/meta-state-report-tool.js`.
   - Assert the description string contains both `"evidence_code_ref"` and `"meta_state_derive_status"`.
   - Assert the description does NOT contain the substring `"Prefer \`evidence_code_ref\`"` (must use the downgraded wording).
   - Run: `cd tools/learning-loop-mcp && node --test __tests__/meta-state-report-description.test.js` — expect 1 failure.
6. **Green: amend the description string** in `tools/meta-state-report-tool.js` to append: *" Use this to internalize external references for `source_refs`. Optional but recommended: pass `evidence_code_ref` (code location) so the loop can hash and re-check it on demand via `meta_state_derive_status`. Markdown paths in `source_refs` are deprecated and will be rejected by `record_create_decision`."*
7. **Delete `records/meta/evidence/`**: `rm -rf records/meta/evidence/`. The 2 archived observations stay in `records/observations/` (no relation to this directory).
8. **Run the full test suite** to confirm no regression: `cd tools/learning-loop-mcp && node --test lib/ __tests__/ 2>&1 | tail -n 5` — expect all green.

## Success Criteria

- [x] 7 new tests in `lib/source-ref-validator.test.js` pass (2 existing tests are REPLACED to assert the new behavior)
- [x] 1 new test in `__tests__/meta-state-report-description.test.js` passes
- [x] 1 new test in `__tests__/create-decision-record-tool.test.js` passes (deprecated ref rejection)
- [x] 1+ new test in `core/record-validation-rules.test.js` (or new test file) passes (core validator alignment)
- [x] `core/record-validation-rules.js#recordLocalRoots` has the `local:meta-state:<id>` branch
- [x] `records/meta/evidence/` directory deleted (verify with `ls records/meta/`)
- [x] `meta_state_report` tool's `description` field contains `"evidence_code_ref"` AND `"meta_state_derive_status"` AND does NOT contain `"Prefer \`evidence_code_ref\`"`
- [x] `create-decision-record-tool` rejects records with deprecated source_refs
- [x] Full test suite (`lib/` + `__tests__/`) green

## Risk Assessment

- **Risk 1:** The 2 archived observations carry `source_refs: ["local:.claude/coordination/hooks/write-coordination-gate.cjs", "local:CLAUDE.md"]` (obs-mpef2h6z-9fefeed8) and `["local:constraint-gate-mcp"]` (obs-mpfnglt7-abac55c4) — paths the current validator would already reject. They stay as historical artifacts (no re-validation, no mutation). The new validator's "no `local:records/meta/evidence/*`" rule does not affect them. **The plan's earlier false claim that they use `local:meta-state:...` was corrected in the Red Team Review (Finding 1).**
- **Risk 2:** Tightening the regex from a permissive prefix-list to a strict format (mirroring `generateId`) may reject ids that an existing record's `source_refs` uses. Mitigation: grep `records/**` for `local:meta-state:` to find affected records BEFORE the cook phase. If found, either (a) update the records to use valid ids, OR (b) keep the permissive pattern as a fallback with a `console.warn` in the validator. Default to (a).
- **Risk 3:** The new error message string must be exact (test 4 asserts `result.error.includes("must stay under")` is REPLACED by `result.error.includes("source ref must be \`local:meta-state:<id>\`")`). Mitigation: write the test assertion against the new message verbatim.
- **Risk 4:** Deleting `records/meta/evidence/` may break in-flight reads from the cook phase of a prior plan. Mitigation: confirmed in meta-state.jsonl scan (2026-06-06) that no plan is currently in_progress against this path; the directory is empty.
- **Risk 5:** The `record_create_decision` handler change (rejecting deprecated refs) is a breaking change for callers that currently create records with `local:plans/...` refs. Mitigation: 16+ existing decision records use markdown refs (per Failure Mode Analyst Finding 5). The handler's rejection does NOT retroactively break those records (they're already on disk); it only blocks NEW records with markdown refs. The deprecation is forward-only.
- **Risk 6:** The core validator's `recordLocalRoots` modification may have a different shape than the MCP wrapper's branch (the core uses a different config format). Mitigation: study the core's `validateAllowedLocalPath` function (line 247) and the `recordLocalRoots` shape (line 174) before adding the new branch; match the existing pattern, don't invent a new one.

## TDD Tests Added (this phase)

| Test File | Test | Asserts |
|-----------|------|---------|
| `lib/source-ref-validator.test.js` (extend) | accepts `local:meta-state:meta-...` (entry exists) | `result.valid === true` |
| `lib/source-ref-validator.test.js` (extend) | rejects `local:meta-state:meta-doesnotexist-...` | `result.valid === false` + "not found in registry" |
| `lib/source-ref-validator.test.js` (extend) | rejects `local:meta-state:obs-...` (wrong prefix) | `result.valid === false` + "id prefix must be 'meta-'" |
| `lib/source-ref-validator.test.js` (extend) | rejects `local:meta-state:meta-../../etc/passwd` (path traversal) | `result.valid === false` + "path-traversal" |
| `lib/source-ref-validator.test.js` (extend) | rejects `local:meta-state:` (empty id) | `result.valid === false` + "must contain a meta-state entry ID" |
| `lib/source-ref-validator.test.js` (replace) | rejects `local:records/meta/evidence/x.md` (was: accepts) | `result.valid === false` + new error message |
| `lib/source-ref-validator.test.js` (extend) | accepts `local:plans/x.md` as deprecated | `result.valid === true && result.deprecated === true` |
| `__tests__/meta-state-report-description.test.js` (new) | description mentions `evidence_code_ref` + `meta_state_derive_status`, does NOT contain "Prefer \`evidence_code_ref\`" | all 3 substring assertions |
| `__tests__/create-decision-record-tool.test.js` (new or extend) | `record_create_decision` rejects when source_refs contains `local:plans/...` | throws error OR returns `valid: false` |
| `core/record-validation-rules.test.js` (new or extend) | `validateAllowedLocalPath` rejects `local:records/meta/evidence/*` + accepts `local:meta-state:<id>` with existence check | 2+ assertions |

**Total: 10 new tests, 2 existing tests replaced.**
