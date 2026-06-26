---
phase: 2
title: "Refresh Drifted Fingerprints — fix the 1 entry with hash mismatch"
status: pending
priority: P3
dependencies: [1]
---

# Phase 2: Refresh Drifted Fingerprints

## Overview

Refresh the `code_fingerprint` for the single drifted entry identified in Phase 1: `meta-260609T1206Z-handoff-md-the-2026-06-09-mcp-server-stale-code-problem-sect` (stored `sha256:3ba7a86293e1b30e642a5428bf1d84d52db156dc3e3dd6395ed3fb1b41efd2aa`, current `sha256:24b3eb25ee7c16996b6ca5cbc1f435d3ed38b342c745dc6ef67a81e54cfc5d99`). Use `meta_state_refresh_fingerprint` (NOT `meta_state_patch` — `code_fingerprint` is on `IMMUTABLE_PATCH_FIELDS` at `core/meta-state.js:259-270` line 264). Verify the refresh via `meta_state_list`.

**Risk:** Very Low — single MCP tool invocation on a single entry; the refresh is idempotent.

## Requirements

- Functional:
  - Entry `meta-260609T1206Z-handoff-md-...` `code_fingerprint` updated to `sha256:24b3eb25ee7c16996b6ca5cbc1f435d3ed38b342c745dc6ef67a81e54cfc5d99`
  - Entry's `last_verified_at` may or may not be updated by the tool (check response)
- Non-functional:
  - Refresh is idempotent (calling twice returns the same response; second call may hit the 60s cache)
  - No fingerprint drift introduced for the other 13 entries
- TDD gate: `meta_state_list --id meta-260609T1206Z-...` returns `code_fingerprint: "sha256:24b3eb25..."` (new value)

## Architecture

The `meta_state_refresh_fingerprint` MCP tool recomputes the SHA-256 of the file at `entry.evidence_code_ref` (after `stripEvidenceAnchor`) and writes the new hash back to the entry. The tool returns:

```json
{
  "id": "meta-260609T1206Z-handoff-md-...",
  "code_fingerprint": "sha256:24b3eb25ee7c16996b6ca5cbc1f435d3ed38b342c745dc6ef67a81e54cfc5d99",
  "refreshed_at": "<ISO>",
  "status": "refreshed"
}
```

The tool reads `code_fingerprint` from the entry, computes the current file hash, and patches the entry in one atomic op. The `code_fingerprint` field is normally on `IMMUTABLE_PATCH_FIELDS` deny-list (line 264), but the refresh tool's handler explicitly allows the `code_fingerprint` field mutation because the new value is computed from the file (not operator-supplied).

## Related Code Files

- No code file modification
- MCP tool calls:
  - `mcp__learning-loop__mastra_meta_state_refresh_fingerprint` (the refresh)
  - `mcp__learning-loop__mastra_meta_state_list --id <id>` (verification)

## File Inventory (deep mode)

| File | Operation | Lines affected | Notes |
|------|-----------|----------------|-------|
| `meta-state.jsonl` | Modify (via MCP tool, not direct edit) | 1 entry's `code_fingerprint` field | Entry `meta-260609T1206Z-...` fingerprint updated |

## Test Scenario Matrix (deep mode)

| # | Scenario | Expected | Verification |
|---|----------|----------|--------------|
| 1 | `mcp__learning-loop__mastra_meta_state_refresh_fingerprint --id meta-260609T1206Z-handoff-md-the-2026-06-09-mcp-server-stale-code-problem-sect` returns `status: refreshed, code_fingerprint: "sha256:24b3eb25..."` | After invocation | Refresh success |
| 2 | `meta_state_list --id meta-260609T1206Z-...` returns `code_fingerprint: "sha256:24b3eb25ee7c16996b6ca5cbc1f435d3ed38b342c745dc6ef67a81e54cfc5d99"` | After invocation | New fingerprint persisted |
| 3 | `meta_state_check_grounding --id meta-260609T1206Z-...` returns `status: grounded, hash match` | After invocation | SP2 invariant restored |
| 4 | The other 13 entries' fingerprints are unchanged (no fan-out) | After invocation | No side effects |

## Function/Interface Checklist (deep mode)

- [ ] Refresh tool called with the exact entry id (not truncated)
- [ ] Response shape includes `status: refreshed`
- [ ] `code_fingerprint` in response matches `sha256sum` computed in Phase 1
- [ ] No other entries' fingerprints changed (verify via `meta_state_list --status stale` showing the same 14 entries with their original fingerprints for entries 1, 3-14)

## Dependency Map (deep mode)

**Depends on:**
- Phase 1 of this plan — identified `meta-260609T1206Z` as the 1 drift entry

**Does not depend on:**
- Any other phase

**Does not block:**
- Phase 3 of this plan — but Phase 3 needs this phase complete before the batch op (otherwise the cold-tier regression test fails on the drifted entry)

## Implementation Steps

### Step 1: Invoke `meta_state_refresh_fingerprint`

```bash
mcp__learning-loop__mastra_meta_state_refresh_fingerprint \
  --id "meta-260609T1206Z-handoff-md-the-2026-06-09-mcp-server-stale-code-problem-sect"
```

**Expected response:**
```json
{
  "id": "meta-260609T1206Z-handoff-md-the-2026-06-09-mcp-server-stale-code-problem-sect",
  "code_fingerprint": "sha256:24b3eb25ee7c16996b6ca5cbc1f435d3ed38b342c745dc6ef67a81e54cfc5d99",
  "refreshed_at": "<ISO timestamp>",
  "status": "refreshed"
}
```

**If response is `{ status: "unchanged" }`:** the fingerprint already matches; skip to Step 2 verification.

**If response is `{ status: "code_missing" }`:** the file was deleted between Phase 1 and now. STOP and surface to operator; do not proceed.

**If response is `{ status: "no_mechanism_check" }`:** the entry's `mechanism_check` is false (shouldn't happen given Phase 1 filter). STOP and surface to operator.

### Step 2: Verify via `meta_state_list`

```bash
mcp__learning-loop__mastra_meta_state_list \
  --id "meta-260609T1206Z-handoff-md-the-2026-06-09-mcp-server-stale-code-problem-sect"
```

**Expected:** entry has `code_fingerprint: "sha256:24b3eb25ee7c16996b6ca5cbc1f435d3ed38b342c745dc6ef67a81e54cfc5d99"` and `version` incremented (was `9`, now `10`).

### Step 3: Verify via `meta_state_check_grounding`

```bash
mcp__learning-loop__mastra_meta_state_check_grounding \
  --id "meta-260609T1206Z-handoff-md-the-2026-06-09-mcp-server-stale-code-problem-sect"
```

**Expected:** `{ status: "grounded", drift_kind: null, fingerprint_was_recorded: true }`.

If the response is `{ status: "drifted", drift_kind: "hash_mismatch" }`, the refresh did not persist. Re-run Step 1.

## Success Criteria

- [ ] Step 1 refresh invocation succeeds; response includes `status: refreshed` + `code_fingerprint: "sha256:24b3eb25..."`
- [ ] Step 2 `meta_state_list` confirms new fingerprint persisted (version incremented)
- [ ] Step 3 `meta_state_check_grounding` returns `status: grounded` (SP2 invariant restored)
- [ ] No other 13 entries' fingerprints changed (verify via compact `meta_state_list --status stale`)

## Risk Assessment

- **R-Phase2-A:** Refresh fails because the entry's `evidence_code_ref` no longer resolves (file moved). **Mitigation:** Phase 1's `existsSync` check + the tool's `code_missing` error response; if this happens, surface to operator and exit (out of scope for this plan).
- **R-Phase2-B:** Refresh succeeds but the registry cache wasn't invalidated (stale read). **Mitigation:** Step 2 uses `meta_state_list` which goes through the MCP server; if cache is stale, the response will show the OLD fingerprint. Retry Step 1 + Step 2.
- **R-Phase2-C:** The 60s cache returns `cache_hit: true` with stale data. **Mitigation:** The refresh tool's idempotency window is 60s (`tools/learning-loop-mastra/tools/legacy/meta-state-refresh-fingerprint-tool.js`); if the response shows `cache_hit: true`, wait 60s and retry once.
- **R-Phase2-D:** Concurrent writer modifies the entry between Step 1 and Step 2. **Mitigation:** Re-run Step 2; if version is still 9 (not incremented), the refresh didn't persist — retry Step 1.
