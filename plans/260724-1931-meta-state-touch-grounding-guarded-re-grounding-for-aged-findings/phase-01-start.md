---
phase: 1
title: "Design decisions + failing test scaffold"
status: completed
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Design decisions + failing test scaffold

## Overview

Lock the tool contract and write the failing tests first (TDD). No handler code in this phase — tests must fail with "tool not registered" / import errors.

## Requirements

- Functional: test file `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-touch-tool.test.js` covering the full contract below
- Non-functional: mirror `meta-state-re-verify-tool.test.js` fixture patterns (temp registry root, `loadEntry`/`readRegistry` helpers)

## Architecture

**Tool contract — `meta_state_touch({ id, _expected_version? })`:**

1. `loadEntry(root, id)` → `not_found` if absent.
2. `isOpen(entry)` guard (same as re-verify; accepts legacy `active`/`reported`/`stale`) → `wrong_status` otherwise. Findings only: reject `entry_kind !== "finding"` with `wrong_kind`.
3. Run `checkGrounding(entry, { root, fileIndex: readFileIndex(root) })` (pure, no test execution).
4. **Reject on negative signal only** (operator attestation model):
   - `hash_match === false` → `{ touched:false, reason:"drifted" }`
   - `code_ref_exists === false` → `{ touched:false, reason:"missing" }`
   - `hash_match === true`, `null` (no baseline), or `status:"skipped"/"unknown"` (mechanism_check off / no evidence_code_ref) → **allow**
5. On allow: `applyUpdateAndCheck(root, id, { last_verified_at: now, _expected_version }, "meta_state_touch")` — CAS-safe, no status transition, no `verification.history` append (nothing executed).
6. `replyWithLog` (audit breadcrumb per call, same as re-verify). On success also append a gate-log entry carrying the grounding snapshot (`hash_match`, `status`) for auditability.
7. **No `META_STATE_VERIFY_EXEC` gate** — nothing is executed; standard R2 write gate + record-write path apply (same class as `meta_state_resolve`).
8. Result: `{ touched:true, id, last_verified_at, grounding: { hash_match, status } }`.

**Out of scope (YAGNI):** no `refresh` arg (touch only succeeds when there is no drift, so an index refresh is moot); no batch mode (phase 4 loops the CLI); no rule/loop-design/change-log kinds.

## Related Code Files

- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-touch-tool.test.js`
- Reference: `tools/learning-loop-mastra/tools/handlers/meta-state-re-verify-tool.js` (handler skeleton, CAS, replyWithLog)
- Reference: `tools/learning-loop-mastra/core/check-grounding.js:98` (`checkGrounding` signature: `(entry, { root, fileIndex? })`)
- Reference: `tools/learning-loop-mastra/core/update-entry-helpers.js` (`applyUpdateAndCheck`)

## Implementation Steps

1. Copy the re-verify test file as the structural template; rewrite cases:
   - `not_found` for unknown id
   - `wrong_status` for resolved/superseded finding
   - `wrong_kind` for rule/change-log entries
   - allow + stamp when `hash_match:true` (fixture: real temp file, `meta_state_refresh_file_index`-seeded baseline or `code_fingerprint` fallback)
   - allow when `mechanism_check` absent (status `skipped`) — the 22-finding common case
   - reject `drifted` when file bytes changed after baseline
   - reject `missing` when evidence file deleted
   - CAS conflict → `current_version` returned, no stamp
   - success result contains `last_verified_at` and grounding snapshot; registry entry unchanged otherwise (version bumped, status still `open`)
2. Run the new test file → confirm all fail (handler/module absent).
3. Run drift-test trio to confirm they also fail pre-registration (expected red):
   `cli-write-tool-set.test.js`, `cli-write-tool-set-drift.test.js`, `cli-write-hint-sketch-drift.test.js`

## Success Criteria

- [x] Test file exists, all cases fail for the right reason (missing tool), not for fixture bugs
- [x] Contract above reviewed against `checkGrounding` return shape (verified: check-grounding.js:98-260)

## Risk Assessment

- Risk: over-permissive allow on `hash_match:null` (no baseline anywhere) → stale finding touched with zero evidence check. Mitigation: allowed deliberately (matches current `isStaleView` no-drift-default semantics); gate-log snapshot records `hash_match:null` so audits can distinguish attested-with-baseline vs attested-blind.
