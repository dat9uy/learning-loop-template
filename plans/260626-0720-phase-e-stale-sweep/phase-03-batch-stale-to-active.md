---
phase: 3
title: "Batch Stale → Active — atomic transition of 14 entries via meta_state_batch"
status: pending
priority: P3
dependencies: [1, 2]
---

# Phase 3: Batch Stale → Active

## Overview

Construct a single `meta_state_batch` payload with 14 `update` ops (one per entry from Phase 1's inventory) and invoke the tool once. Each op sets `status: "active"` and `last_verified_at: <ISO>` with per-op CAS `_expected_version`. The batch tool's all-or-nothing rollback semantics (`core/meta-state.js:516-538`) ensure either all 14 transitions succeed or none do.

**Risk:** Low — single atomic MCP tool call; CAS per op catches concurrent writers; patch payload restricted to non-immutable fields.

## Requirements

- Functional:
  - All 14 entries transition `status: stale → active` in a single `meta_state_batch` invocation
  - All 14 entries have `last_verified_at` set to the same ISO timestamp (captured at Phase 3 Step 1)
  - Registry cache invalidated once (single `meta_state_batch` call = single cache invalidation)
- Non-functional:
  - `_expected_version` per op matches the current entry version (verified via `meta_state_list --compact` at Phase 3 Step 2)
  - Patch payload contains only `status` + `last_verified_at` (verified via deny-list audit at Phase 3 Step 3)
  - If any op fails (version mismatch, immutable field), the entire batch rolls back
- TDD gate: `meta_state_list --status stale` returns 2 entries (the 2 mechanism_check=false leftovers); `meta_state_list --id <id>` for any swept entry returns `status: active` + `last_verified_at: <ISO>`

## Architecture

The `meta_state_batch` MCP tool takes a list of operations and applies them atomically. Per `core/meta-state.js:516-569`:

```javascript
case "update": {
  const idx = entries.findIndex((e) => e.id === op.id);
  if (idx === -1) throw new Error("not_found");
  if (op._expected_version !== undefined) {
    const current = entries[idx].version ?? 0;
    if (current !== op._expected_version) throw new Error("version_mismatch");
  }
  // Strip op discriminator + lookup id + CAS version before checking
  // the deny-list and applying.
  const { op: _op, id: _id, _expected_version, ...patch } = op;
  // Enforce the same IMMUTABLE_PATCH_FIELDS deny-list
  const denied = Object.keys(patch).filter((k) => IMMUTABLE_PATCH_FIELDS.has(k));
  if (denied.length > 0) {
    const err = new Error("immutable_field");
    err.denied_fields = denied;
    throw err;
  }
  Object.assign(entries[idx], patch);
  entries[idx].version = (entries[idx].version ?? 0) + 1;
  break;
}
```

So an `update` op shape is:

```json
{
  "op": "update",
  "id": "meta-...",
  "_expected_version": <current-version>,
  "status": "active",
  "last_verified_at": "<ISO>"
}
```

After stripping `op`, `id`, `_expected_version`, the remaining fields (`status`, `last_verified_at`) become the `patch` object. The deny-list check confirms no immutable fields are touched. `Object.assign` mutates the entry; `version` increments.

## Related Code Files

- No code file modification
- MCP tool calls:
  - `mcp__learning-loop__mastra_meta_state_list --compact` (Step 2 — read current versions)
  - `mcp__learning-loop__mastra_meta_state_batch` (Step 4 — the batch op)

## File Inventory (deep mode)

| File | Operation | Lines affected | Notes |
|------|-----------|----------------|-------|
| `meta-state.jsonl` | Modify (via MCP tool, not direct edit) | 14 entries' `status` + `last_verified_at` + `version` fields | All-or-nothing atomic update |

## Test Scenario Matrix (deep mode)

| # | Scenario | Expected | Verification |
|---|----------|----------|--------------|
| 1 | Pre-step: `meta_state_list --status stale --compact` returns 14 entries (Phase 1 + Phase 2 complete) | Before batch | Pre-condition |
| 2 | Pre-step: `meta_state_list --id <id> --compact` for each of the 14 entries returns current version (Phase 3 Step 2) | Before batch | CAS version audit |
| 3 | Pre-step: deny-list audit (Step 3) confirms `status` and `last_verified_at` are NOT in `IMMUTABLE_PATCH_FIELDS` | Before batch | Deny-list verification |
| 4 | `meta_state_batch` invoked with 14 `update` ops; response `{ applied: 14, failed_at: null }` | After batch | Atomic success |
| 5 | `meta_state_list --status stale --compact` returns 2 entries (the 2 mechanism_check=false leftovers) | After batch | Status transition count |
| 6 | `meta_state_list --id <id> --compact` for any swept entry returns `status: active` + `last_verified_at: <ISO>` + `version: <current+1>` | After batch | Per-entry verification |
| 7 | If any op returns `version_mismatch`, the entire batch rolls back (no entries transitioned) | Failure path | All-or-nothing rollback |

## Function/Interface Checklist (deep mode)

- [ ] 14 `update` ops constructed; each op has `op`, `id`, `_expected_version`, `status`, `last_verified_at`
- [ ] `_expected_version` per op matches the current entry version (read at Step 2)
- [ ] Patch payload contains only `status` + `last_verified_at` (no `code_fingerprint`, no `version`, no `id`)
- [ ] `last_verified_at` is the SAME ISO timestamp across all 14 ops (captured at Step 1)
- [ ] `meta_state_batch` payload size is < BATCH_SIZE_LIMIT (500); we use 14, so well within
- [ ] `meta_state_batch` invoked exactly ONCE (no per-op fallback in this plan)

## Dependency Map (deep mode)

**Depends on:**
- Phase 1 (DONE) — inventory of 14 entries with current versions
- Phase 2 (DONE) — refreshed `code_fingerprint` for entry `meta-260609T1206Z`

**Does not depend on:**
- Any other plan

**Does not block:**
- Phase 4 of this plan — Phase 4 is verification + audit (depends on Phase 3)

## Implementation Steps

### Step 1: Capture ISO timestamp

```bash
date -u +"%Y-%m-%dT%H:%M:%S.000Z"
# Example output: 2026-06-26T14:00:00.000Z
```

Capture this value. It will be the `last_verified_at` for all 14 entries.

### Step 2: Read current versions for CAS

For each of the 14 entries, read the current `version` (from Phase 1's `meta_state_list` call, which returned `version` for each entry). Expected versions (as of 2026-06-26 13:46):

| Entry | Current version |
|-------|-----------------|
| `meta-260606T1830Z-context-pollution-...` | 9 |
| `meta-260609T1206Z-handoff-md-...` | 10 (incremented by Phase 2 refresh) |
| `meta-260613T0138Z-vnstock-device-...` | 6 |
| `meta-260613T1615Z-import-chain-...` | 7 |
| `meta-260614T1236Z-no-mcp-path-...` | 9 |
| `meta-260615T1148Z-the-runtime-...` | 7 |
| `meta-260615T1920Z-the-new-strip-...` | 8 |
| `meta-260616T0222Z-inbound-gate-...` | 5 |
| `meta-260616T1453Z-two-more-dead-...` | 5 |
| `meta-260618T0558Z-post-migration-...` | 14 |
| `meta-260619T2233Z-the-meta-state-...` | 4 |
| `meta-260619T2237Z-the-meta-state-...` | 5 |
| `meta-260623T1542Z-the-pr-body-...` | 3 |
| `meta-260624T1920Z-code-fingerprint-...` | 2 |

If any version differs, re-fetch via `meta_state_list --id <id> --compact` and use the actual current value. CAS must match exactly.

### Step 3: Deny-list audit

```bash
sed -n '259,270p' tools/learning-loop-mastra/core/meta-state.js
```

Expected: 10 fields in `IMMUTABLE_PATCH_FIELDS`:
```text
"id", "version", "created_at", "created_by", "code_fingerprint",
"consolidated_into", "acked_at", "resolved_at", "resolved_by", "resolution"
```

Confirm: `status` and `last_verified_at` are NOT in the deny-list. If they are (deny-list changed since plan authoring), STOP and surface to operator.

### Step 4: Construct batch payload

```json
{
  "operations": [
    {
      "op": "update",
      "id": "meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois",
      "_expected_version": 9,
      "status": "active",
      "last_verified_at": "<ISO from Step 1>"
    },
    {
      "op": "update",
      "id": "meta-260609T1206Z-handoff-md-the-2026-06-09-mcp-server-stale-code-problem-sect",
      "_expected_version": 10,
      "status": "active",
      "last_verified_at": "<ISO from Step 1>"
    },
    ... (12 more entries, same shape) ...
  ]
}
```

For the `meta_state_batch` MCP tool invocation, the schema requires `operations` as an array of 1-500 ops. Wrap in `{ "operations": [...] }`.

### Step 5: Invoke `meta_state_batch`

```bash
mcp__learning-loop__mastra_meta_state_batch \
  --operations '[{"op":"update","id":"meta-260606T1830Z-...","_expected_version":9,"status":"active","last_verified_at":"<ISO>"}, ...]'
```

**Expected response:**
```json
{
  "applied": 14,
  "failed_at": null,
  "results": [
    { "id": "meta-260606T1830Z-...", "patched": true, "version": 10 },
    { "id": "meta-260609T1206Z-...", "patched": true, "version": 11 },
    ... (12 more) ...
  ]
}
```

**Failure paths:**

- `{ applied: 0, failed_at: <N>, reason: "version_mismatch" }`: one op's CAS didn't match (concurrent writer modified that entry). Retry once: re-fetch current versions for the failed entry, update `_expected_version`, re-run the FULL batch (not just the failed entry — the tool rolls back the entire batch).
- `{ applied: 0, failed_at: <N>, reason: "immutable_field" }`: the patch payload contains a field on the deny-list (shouldn't happen given Step 3 audit). Surface to operator; abort.
- `{ applied: 0, failed_at: <N>, reason: "not_found" }`: an entry id doesn't exist (shouldn't happen given Phase 1 verification). Surface to operator; abort.
- `{ applied: 0, failed_at: <N>, reason: "batch_size_exceeded" }`: payload too large (limit 500; we use 14). Surface to operator; abort.

### Step 6: Verify the transition

```bash
mcp__learning-loop__mastra_meta_state_list \
  --status stale \
  --compact true
```

**Expected response:** 2 entries (the 2 mechanism_check=false leftovers: `meta-260606T2102Z-agent-used-direct-file-i-o-...` and `meta-260614T1236Z-no-automated-registry-consistency-check-exists-...`).

If count is not 2, inspect the result and surface the discrepancy. (Possible cause: another writer added a new stale mechanism_check=true entry between Phase 1 and Phase 3 — add it to a follow-up sweep.)

### Step 7: Spot-check 3 entries

```bash
# Spot-check 3 of the 14 entries
mcp__learning-loop__mastra_meta_state_list --id "meta-260606T1830Z-context-pollution-..." --compact false
mcp__learning-loop__mastra_meta_state_list --id "meta-260618T0558Z-post-migration-..." --compact false
mcp__learning-loop__mastra_meta_state_list --id "meta-260624T1920Z-code-fingerprint-..." --compact false
```

**Expected:** each shows `status: "active"`, `last_verified_at: <ISO from Step 1>`, `version: <current+1>`.

## Success Criteria

- [ ] Step 1 ISO timestamp captured
- [ ] Step 2 current versions verified for all 14 entries
- [ ] Step 3 deny-list audit confirms `status` and `last_verified_at` are NOT in `IMMUTABLE_PATCH_FIELDS`
- [ ] Step 4 batch payload constructed with 14 ops
- [ ] Step 5 `meta_state_batch` invocation succeeds; response `{ applied: 14, failed_at: null }`
- [ ] Step 6 `meta_state_list --status stale` returns 2 entries (not 16)
- [ ] Step 7 spot-check 3 entries confirm `status: active` + `last_verified_at: <ISO>` + version incremented

## Risk Assessment

- **R-Phase3-A:** Concurrent writer modifies 1+ entries between Step 2 and Step 5. **Mitigation:** CAS via `_expected_version`; on mismatch, re-fetch the affected entry's current version, retry the FULL batch once. If still failing, surface to operator.
- **R-Phase3-B:** The batch payload accidentally includes a deny-listed field (e.g., `code_fingerprint`). **Mitigation:** Step 3 deny-list audit; the batch tool's handler also checks the deny-list and throws `immutable_field`. If this happens, the entire batch rolls back — no partial state.
- **R-Phase3-C:** The `last_verified_at` ISO timestamp is malformed (e.g., wrong format). **Mitigation:** Step 1 uses `date -u +"%Y-%m-%dT%H:%M:%S.000Z"` which produces a valid ISO 8601 string. If the MCP tool rejects the format, surface to operator.
- **R-Phase3-D:** The batch tool's `BATCH_SIZE_LIMIT` is exceeded (shouldn't happen; we use 14 of 500). **Mitigation:** Verify the count at Step 4; abort if count > 500 (impossible for this plan).
- **R-Phase3-E:** The batch tool's `metaStateBatch` function reads the registry, applies ops, writes the file, but the file write fails (disk full, permissions). **Mitigation:** The tool's enqueue pattern + tmp file rename (`getRegistryPath` + `.tmp` + rename) is atomic; the registry is restored to `preBatchContent` on any failure.
- **R-Phase3-F:** Phase 1 inventory is stale by Phase 3 execution (new stale entries added). **Mitigation:** Step 6's `meta_state_list --status stale --compact` will show the new count; if > 2, file a follow-up sweep plan for the new entries.
