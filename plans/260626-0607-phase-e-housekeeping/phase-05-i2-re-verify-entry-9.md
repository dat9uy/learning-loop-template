---
phase: 5
title: "Rev 6 I-2 — meta_state_patch entry #9 (stale → active) — REDESIGNED after red-team C1"
status: pending
priority: P2
dependencies: []
---

# Phase 5: Rev 6 I-2 — meta_state_patch entry #9 (stale → active)

## Overview

Transition entry `meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop` from `stale` to `active` via `meta_state_patch` (NOT `meta_state_re_verify` — entry has no `verification.steps`, so re-verify returns `no_verification_steps`). The entry's `code_fingerprint` is already grounded (verified by sha256sum match against the post-Plan-6 file `tools/learning-loop-mastra/mastra/create-loop-tool.js` per Plan 6 code review); only the status lifecycle is open. The patch sets `status: "active"` + `last_verified_at: <ISO>` directly.

**Why patch instead of re-verify (red-team finding C1):** The `meta_state_re_verify` tool (`tools/learning-loop-mastra/tools/legacy/meta-state-re-verify-tool.js:38-42`) requires `entry.verification.steps` to be a non-empty array. Entry #9 has no `verification` field at all. Calling `meta_state_re_verify` returns `{re_verified: false, reason: "no_verification_steps"}` — the entry stays stale. The red-team verified that `status` and `last_verified_at` are NOT on the `IMMUTABLE_PATCH_FIELDS` deny-list (`core/meta-state.js:259-270`), so `meta_state_patch` can mutate them directly. This is the simplest, most reliable path.

**Risk:** Low — single MCP tool invocation; deny-list verified; fingerprint grounded (no SP2 drift).

## Requirements

- Functional: entry `meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop` `status: stale → active` with `last_verified_at` set to a current ISO timestamp
- Non-functional:
  1. `meta_state_patch` uses CAS `_expected_version: 10` (current entry version) to prevent race with concurrent writers
  2. The patch op shape places mutable fields at the op's top level (per Plan 1 Phase 6 red-team correction: NOT wrapped in `{patch: {...}}`)
  3. The fingerprint (`sha256:a4921a9418784b238b60fc94e2e1b5777934c0a5b308330eb4a405c0a498b8f7`) remains unchanged (no drift)
  4. Cold-tier regression test passes after patch
- TDD gate: `meta_state_list --id meta-260618T0558Z-...` returns `status: active`; `meta_state_check_grounding --id meta-260618T0558Z-...` returns `status: grounded, hash match`

## Architecture

The `meta_state_patch` MCP tool atomically updates one entry's fields with CAS protection. For entry #9, the patch is:

```javascript
{
  id: "meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop",
  entry_kind: "finding",
  patch: {
    status: "active",
    last_verified_at: "<ISO timestamp>",
  },
  _expected_version: 10,
}
```

The tool's deny-list (`IMMUTABLE_PATCH_FIELDS` in `core/meta-state.js:259-270`) does NOT include `status` or `last_verified_at` (verified by grep before invocation). The CAS version (`_expected_version: 10`) matches the entry's current version (verified via `meta_state_list`). The patch is a single atomic op (no race window).

**Why patch directly is safe here:**
1. The fingerprint is grounded (SP2 invariant already satisfied per Plan 6 sha256sum audit)
2. The status transition (`stale → active`) is the operationally-correct outcome (the code didn't change; only the status lifecycle was open)
3. `meta_state_re_verify` was the canonical mechanism for stale → active, but it requires `verification.steps` which entry #9 lacks — this is a schema-gap in the entry, not a substantive problem with the transition
4. The transition is reversible (`active → stale` via `meta_state_patch` if a future audit reveals an issue)

## Related Code Files

- No code file modification
- MCP tool call: `mcp__learning-loop__mastra_meta_state_patch` with `id` + `entry_kind` + `patch` + `_expected_version`
- MCP tool call (verification): `mcp__learning-loop__mastra_meta_state_list --id <id>` + `mcp__learning-loop__mastra_meta_state_check_grounding --id <id>`

## File Inventory (deep mode)

| File | Operation | Lines affected | Notes |
|------|-----------|----------------|-------|
| `meta-state.jsonl` | Modify (via MCP tool, not direct edit) | 1 entry's `status` + `last_verified_at` fields | Entry #9 transitions `stale → active` |

No source file changes. No test file changes.

## Test Scenario Matrix (deep mode)

| # | Scenario | Expected | Verification |
|---|----------|----------|--------------|
| 1 | Pre-step: `mcp__learning-loop__mastra_meta_state_list --id meta-260618T0558Z-...` returns `status: stale`, `version: 10` | Before phase 5 | Pre-condition |
| 2 | Pre-step: `sha256sum tools/learning-loop-mastra/mastra/create-loop-tool.js` returns `a4921a9418784b238b60fc94e2e1b5777934c0a5b308330eb4a405c0a498b8f7` | Before phase 5 | Fingerprint match |
| 3 | Pre-step: `grep -E "status\|last_verified_at" tools/learning-loop-mastra/core/meta-state.js` (line 259-270) confirms deny-list does NOT include `status` or `last_verified_at` | Before phase 5 | Deny-list audit |
| 4 | `mcp__learning-loop__mastra_meta_state_patch --id meta-260618T0558Z-... --entry_kind finding --patch '{"status":"active","last_verified_at":"<ISO>"}' --_expected_version 10` returns `{patched: true}` | After invocation | Patch success |
| 5 | Post-step: `mcp__learning-loop__mastra_meta_state_list --id meta-260618T0558Z-...` returns `status: active`, `version: 11` | After phase 5 | Status transition |
| 6 | `mcp__learning-loop__mastra_meta_state_check_grounding --id meta-260618T0558Z-...` returns `status: grounded, hash match` | After phase 5 | Fingerprint still valid |
| 7 | Cold-tier regression test (`cold-tier-regression.test.cjs`) GREEN | After phase 5 | No downstream regression |
| 8 | `pnpm test` GREEN across all 13 namespaces | After phase 5 | No regression |
| 9 | Fingerprint `sha256:a4921a94...` unchanged | Before + after | No drift |

## Function/Interface Checklist (deep mode)

- [ ] `meta_state_patch` op shape verified (flat fields at op's top level, NOT wrapped in `{patch: {...}}` — per Plan 1 Phase 6 red-team correction)
- [ ] CAS version (`_expected_version`) matches current entry version (10)
- [ ] Re-patch response includes `version: 11` (post-patch increment)
- [ ] Cold-tier regression test passes (entry #9 now `active` + grounded)
- [ ] No fingerprint drift detected (existing fingerprint remains valid)

## Dependency Map (deep mode)

**Depends on:**
- Plan 6 (DONE) — moved the file; repointed the entry's `evidence_code_ref` to `mastra/create-loop-tool.js`; verified the fingerprint is still grounded
- Plan 1 (DONE) — the `IMMUTABLE_PATCH_FIELDS` deny-list is the safety guarantee for `meta_state_patch` mutations

**Does not depend on:**
- Phase 1/2/3/4 of this plan — I-2 ships independently

**Does not block:**
- Anything (registry lifecycle action; closes Plan 6's deferred acceptance criterion)

## Implementation Steps

### Step 1: Pre-condition verification

```bash
# Verify the entry is currently stale + read current version
mcp__learning-loop__mastra_meta_state_list --id meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop
# Expected: status: "stale"; version: 10; code_fingerprint: "sha256:a4921a9418784b238b60fc94e2e1b5777934c0a5b308330eb4a405c0a498b8f7"

# Verify the file exists at the repointed path + SHA-256 matches
sha256sum tools/learning-loop-mastra/mastra/create-loop-tool.js
# Expected: a4921a9418784b238b60fc94e2e1b5777934c0a5b308330eb4a405c0a498b8f7

# Verify deny-list does NOT include status or last_verified_at
sed -n '259,270p' tools/learning-loop-mastra/core/meta-state.js
# Expected: shows 10 fields (id, version, created_at, created_by, code_fingerprint, consolidated_into, acked_at, resolved_at, resolved_by, resolution) — does NOT include status or last_verified_at
```

**If any of the above fails:** STOP. Investigate before proceeding.

### Step 2: Capture current ISO timestamp

```bash
date -u +"%Y-%m-%dT%H:%M:%S.000Z"
# Example output: 2026-06-26T06:25:00.000Z
```

Capture this value for the patch's `last_verified_at` field.

### Step 3: Invoke `meta_state_patch`

```bash
mcp__learning-loop__mastra_meta_state_patch \
  --id "meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop" \
  --entry_kind "finding" \
  --patch '{"status":"active","last_verified_at":"<ISO from Step 2>"}' \
  --_expected_version 10
```

**Expected response:**
```json
{
  "patched": true,
  "id": "meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop",
  "version": 11
}
```

**If response is `{patched: false, reason: "version_mismatch"}`:** the entry was concurrently modified (version is no longer 10). Re-read the entry via `meta_state_list`, increment `_expected_version`, and retry.

**If response is `{patched: false, reason: "denied_field"}`:** the deny-list has changed since the scout verification. Re-verify deny-list and choose an alternative field set.

### Step 4: Verify the status transition

```bash
mcp__learning-loop__mastra_meta_state_list --id meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop
# Expected: status: "active"; last_verified_at: "<ISO from Step 2>"; version: 11
```

### Step 5: Verify the fingerprint is still grounded

```bash
mcp__learning-loop__mastra_meta_state_check_grounding --id meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop
# Expected: status: "grounded"; fingerprint matches file content (a4921a94...)
```

### Step 6: Run cold-tier regression test

```bash
node --test tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js 2>&1 | tail -10
# Expected: all mechanism_check=true findings grounded (entry #9 now `active` + grounded)
```

### Step 7: Run full `pnpm test` (expect GREEN)

```bash
pnpm test 2>&1 | tail -10
# Expected: all 13 namespaces GREEN
```

## Success Criteria

- [ ] Step 1 pre-conditions verified (entry is stale v10, file exists, SHA-256 matches, deny-list excludes status/last_verified_at)
- [ ] Step 2 ISO timestamp captured
- [ ] Step 3 `meta_state_patch` invocation succeeds; response includes `patched: true` + `version: 11`
- [ ] Step 4 `meta_state_list` confirms `status: "active"` + `last_verified_at: <ISO>` + `version: 11`
- [ ] Step 5 `meta_state_check_grounding` returns `status: "grounded"`
- [ ] Step 6 cold-tier regression test GREEN
- [ ] Step 7 `pnpm test` GREEN across all 13 namespaces

## Risk Assessment

- **R-Phase5-A:** Entry version is not 10 (concurrent modification). **Mitigation:** Step 1 reads current version; Step 3 uses `_expected_version: 10`; on mismatch, retry with new version.
- **R-Phase5-B:** Deny-list has changed since scout verification (`status` added). **Mitigation:** Step 1 grep audits deny-list at plan-execution time (not at plan-authoring time); if changed, abort and re-plan.
- **R-Phase5-C:** File modified post-Plan-6, SHA-256 no longer matches stored fingerprint. **Mitigation:** Step 1 sha256sum check catches this BEFORE invoking the tool. If drift detected, refresh fingerprint via `meta_state_refresh_fingerprint` first, THEN patch.
- **R-Phase5-D:** Patch op shape mismatch (fields wrapped in `{patch: {...}}` instead of flat). **Mitigation:** Plan 1's Phase 6 red-team correction noted the flat shape; Step 3 uses the correct shape.
- **R-Phase5-E:** Other concurrent writers update entry #9 between Step 1 and Step 3. **Mitigation:** CAS via `_expected_version`; on mismatch, retry once with fresh version. If still mismatching, abort and investigate.

## Revision notes

This phase was redesigned on 2026-06-26 (post red-team review) to use `meta_state_patch` instead of `meta_state_re_verify`. The red-team surfaced that entry #9 has no `verification.steps` field, so `meta_state_re_verify` returns `no_verification_steps` error. The redesign:
- Removes the `META_STATE_VERIFY_EXEC=1` env var dependency (no longer needed)
- Uses `meta_state_patch` directly (verified that `status` + `last_verified_at` are NOT on the deny-list)
- Keeps CAS protection via `_expected_version: 10`

This change closes the same acceptance criterion (entry #9 transitions `stale → active`) via a more direct mechanism. The fingerprint-grounding check (Step 5) is the substantive invariant; the patch just updates the status lifecycle.