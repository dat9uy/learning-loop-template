---
phase: 1
title: "Grounding probe + corrective batch"
status: pending
priority: P2
dependencies: []
---

# Phase 1: Grounding probe + corrective batch

## Overview

Verify each of the 12 entries' `evidence_code_ref` exists and the stored fingerprint matches the file's current SHA-256. For the 10 `mechanism_check=true` entries, apply a single atomic `meta_state_batch` with 12 ops that set `status: "active"` + `acked_at` + `last_verified_at`. For the 2 `mechanism_check=null` entries (which have no `evidence_code_ref`), file a separate meta-state finding instead of including them in the corrective batch (OO1).

## Requirements

- Functional:
  - All 10 `mechanism_check=true` entries transition `status: stale → active` in a single `meta_state_batch` invocation
  - All 10 entries have `acked_at` + `last_verified_at` set to the same ISO timestamp (the batch timestamp)
  - The 2 `mechanism_check=null` entries are reported as a separate finding (deferred)
  - Registry cache invalidated once (single batch op)
- Non-functional:
  - `_expected_version` per op matches the current entry version (verified via `meta_state_list --compact` at Step 2)
  - Patch payload contains only `status` + `acked_at` + `last_verified_at` (no immutable fields)
  - If any op fails (version mismatch, immutable field), the entire batch rolls back
- TDD gate: `meta_state_list --status stale` returns ≤ 1 entry (the 1 `mechanism_check=false` leftover); `meta_state_list --id <id>` for any swept entry returns `status: active` + `acked_at: <batch-timestamp>`

## Architecture

The `meta_state_batch` MCP tool takes a list of operations and applies them atomically. Per `core/meta-state.js:516-610`:

```javascript
case "update": {
  const idx = entries.findIndex((e) => e.id === op.id);
  if (idx === -1) throw new Error("not_found");
  if (op._expected_version !== undefined) {
    const current = entries[idx].version ?? 0;
    if (current !== op._expected_version) throw new Error("version_mismatch");
  }
  const { op: _op, id: _id, _expected_version, ...patch } = op;
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

Per-op shape:

```json
{
  "op": "update",
  "id": "meta-260606T1830Z-...",
  "_expected_version": <current-version>,
  "status": "active",
  "acked_at": "<ISO>",
  "last_verified_at": "<ISO>"
}
```

The deny-list check (`IMMUTABLE_PATCH_FIELDS` at `core/meta-state.js:259-270`) confirms no immutable fields (`code_fingerprint`, `created_at`, `id`, etc.) are touched. `Object.assign` mutates the entry; `version` increments.

`acked_at` supersedes `created_at` for `checkStaleness` (`meta-state-sweep-tool.js:25-36`), so future sweeps will not re-stale these entries.

## Related Code Files

- Modify: `meta-state.jsonl` (via `meta_state_batch` MCP tool — atomic write)
- Create (Phase 1, separately): 1 new meta-state finding for the 2 mc=null entries' grounding gap
- No code file modifications

## Implementation Steps

### Step 1: Inventory check (read-only, no writes)

```bash
# For each of the 12 entries, verify evidence_code_ref exists + fingerprint matches
# (mc=true entries only; mc=null entries have no evidence_code_ref)
for id in meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois \
          meta-260609T1206Z-handoff-md-the-2026-06-09-mcp-server-stale-code-problem-sect \
          meta-260613T0138Z-vnstock-device-slot-ledger-converted \
          meta-260613T1615Z-import-chain-analysis-is-the-canonical-dead-code-detection-m \
          meta-260614T1236Z-no-mcp-path-exists-to-unarchive-a-meta-state-entry-or-transi \
          meta-260615T1148Z-the-runtime-agnostic-pattern-is-real-in-this-codebase-shim-n \
          meta-260615T1920Z-the-new-stripnodeevalbody-function-in-tools-learning-loop-mc \
          meta-260616T0222Z-inbound-gate-js-still-contains-a-local-ttl-based-staleness-c \
          meta-260616T1453Z-two-more-dead-write-path-entries-in-write-path-patterns-at-t \
          meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop; do
  mcp__learning-loop__mastra_meta_state_check_grounding --id "$id"
done
```

**Expected:** 9 of 10 match (entry #2 `meta-260609T1206Z` already had its fingerprint refreshed in Plan 7 Phase 2 — should still match). If any drifted, refresh first via `meta_state_refresh_fingerprint` (analogous to Plan 7 Phase 2 mechanism).

**Output:** Inline inventory table logged to operator's session transcript.

### Step 2: Read current versions + capture batch timestamp

```bash
BATCH_TS=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
# Read all 10 entries with --compact to get current versions
mcp__learning-loop__mastra_meta_state_list --id meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois,meta-260609T1206Z-handoff-md-the-2026-06-09-mcp-server-stale-code-problem-sect,... --compact
```

**Output:** Map of `id → current_version` for CAS checks.

### Step 3: Audit the patch payload

Before invoking the batch, verify the payload contains only the 3 allowed fields (`status`, `acked_at`, `last_verified_at`). The deny-list (`IMMUTABLE_PATCH_FIELDS`) will catch this at runtime, but pre-flight audit catches it cheaper.

### Step 4: Construct + invoke meta_state_batch

10 ops (one per `mechanism_check=true` entry):

```json
{
  "operations": [
    {"op": "update", "id": "meta-260606T1830Z-...", "_expected_version": <v>, "status": "active", "acked_at": "<BATCH_TS>", "last_verified_at": "<BATCH_TS>"},
    {"op": "update", "id": "meta-260609T1206Z-...", "_expected_version": <v>, "status": "active", "acked_at": "<BATCH_TS>", "last_verified_at": "<BATCH_TS>"},
    ... (8 more) ...
  ]
}
```

```bash
mcp__learning-loop__mastra_meta_state_batch --operations '<json-payload>'
```

**Expected response:** `{ "applied": 10, "failed_at": null }`. If `failed_at: <i>`, retry once with fresh version per Step 2.

### Step 5: Verify

```bash
# Should return 0 or 1 (the mc=false leftover)
mcp__learning-loop__mastra_meta_state_list --status stale --compact
# Spot-check 3 entries
mcp__learning-loop__mastra_meta_state_list --id meta-260606T1830Z-...
mcp__learning-loop__mastra_meta_state_list --id meta-260609T1206Z-...
mcp__learning-loop__mastra_meta_state_list --id meta-260619T2233Z-the-meta-state-log-change-mcp-tool-can-return-logged-true-an
# Run a dry-run sweep to confirm checkStaleness doesn't re-stale
mcp__learning-loop__mastra_meta_state_sweep  # default apply=false
```

### Step 6: Report the 2 mc=null entries (separate finding)

```bash
mcp__learning-loop__mastra_meta_state_report \
  --id "meta-260626T1535Z-the-2-mc-null-stale-entries-have-no-evidence-code-ref" \
  --category "mcp-tool-missing" \
  --severity "warning" \
  --affected_system "meta-state-tools" \
  --description "..."
```

**Required description content:** The 2 `mechanism_check=null` stale entries (`meta-260606T2102Z-agent-used-direct-file-i-o-...`, `meta-260614T1236Z-no-automated-registry-consistency-check-exists-...`) cannot be transitioned to `active` because they have no `evidence_code_ref` field. Plan 7 included them in scope (per operator decision D2) but cannot ground them. Recommend: file grounding work as a separate plan (Plan 8 candidate). Note: this finding itself uses `evidence_code_ref: tools/learning-loop-mastra/core/meta-state.js#metaStateEntrySchema` (the schema field definition) for grounding.

## Success Criteria

- [ ] Step 1 inventory shows all 10 mc=true entries grounded (no fresh drift since Plan 7's fingerprint refresh)
- [ ] Step 2 captures BATCH_TS + current versions for all 10 entries
- [ ] Step 3 patch payload contains only `status`, `acked_at`, `last_verified_at` (no immutable fields)
- [ ] Step 4 `meta_state_batch` returns `{applied: 10, failed_at: null}` (or success after 1 retry)
- [ ] Step 5 `meta_state_list --status stale` returns ≤ 1 entry (only the mc=false leftover)
- [ ] Step 5 dry-run sweep returns `applied: 0` (no transitions proposed — `acked_at` is now the reference)
- [ ] Step 5 spot-check 3 entries: all `status: active`, `acked_at: <BATCH_TS>`, `last_verified_at: <BATCH_TS>`, version incremented
- [ ] Step 6 new meta-state finding filed for the 2 mc=null entries

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| R1 (CAS mismatch) | Per-op `_expected_version`; retry once with fresh version |
| R2 (immutable_field error) | Step 3 audit; deny-list enforced at runtime |
| R3 (drifted fingerprint) | Step 1 inventory catches it; refresh via `meta_state_refresh_fingerprint` first |
| R4 (entries 11-12 can't be transitioned) | Step 6 separates the work; OO1 documents deferral |
| R5 (subsequent sweep re-stales) | `acked_at` supersedes `created_at` in `checkStaleness` — design-level fix |
| R6 (batch rollback leaves registry unchanged) | `meta_state_batch` is all-or-nothing; safe to retry |
