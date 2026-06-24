# Fix Batch Bypass Deny-List — Shipped

**Date:** 2026-06-26
**Branch:** `fix/batch-bypass-deny-list`
**Follow-up to:** `docs/journals/260625-phase-e-plan-1-review-fixes.md`

## Summary

Follow-up to the Phase E Plan 1 review fixes. The review surfaced a `meta_state_batch` bypass of `IMMUTABLE_PATCH_FIELDS` (finding `meta-260625T0255Z-...`) and recommended resolving it via the documented path: add the deny-list check in the batch handler. This branch closes the bypass at the source by moving `IMMUTABLE_PATCH_FIELDS` to `core/meta-state.js` as the single source of truth, then making `metaStateBatch` consult it.

**Net result:** the `meta_state_batch` update op now enforces the same identity/audit-trail invariants as `meta_state_patch`. Two new regression tests guard the invariant. The existing one-time `repoint-fingerprints.cjs` (which exploited the bypass for Phase 6) is marked historical — re-running it now fails with `reason: "immutable_field"`, which is the documented correct behavior.

## Diagnostic (post-mortem)

**Symptom:** `metaStateBatch` `update` op allowed setting `code_fingerprint` (and other immutable fields) via raw `Object.assign(entries[idx], patch)` at `core/meta-state.js:525`. The patch tool's `IMMUTABLE_PATCH_FIELDS` deny-list was never consulted by the batch path.

**Root cause:** the deny-list was defined in `tools/legacy/meta-state-patch-tool.js:6-23` (a tool file), not in `core/meta-state.js` (where the batch function lives). Two mutation surfaces, two enforcement layers — drift-by-design.

**Blast radius:** any caller with MCP access could pin a finding's `code_fingerprint` to a stale hash, suppressing future drift detection. The cold-tier regression test would not detect the pin because it exempts `hash_mismatch` on anchor-based refs (and most of the bypassed fields end up there).

## Fix (option a per the filed finding)

### 1. Moved `IMMUTABLE_PATCH_FIELDS` to `core/meta-state.js`

Single source of truth. Both the patch tool and the batch function import from core. The patch tool re-exports for backward compat with existing test imports (`meta-state-patch-immutable-fields.test.js` continues to work).

### 2. Added deny-list check in `metaStateBatch` `update` case

```js
const { op: _op, id: _id, _expected_version, ...patch } = op;
const denied = Object.keys(patch).filter((k) => IMMUTABLE_PATCH_FIELDS.has(k));
if (denied.length > 0) {
  const err = new Error("immutable_field");
  err.denied_fields = denied;
  throw err;
}
```

The throw triggers the existing `catch (err)` rollback at line 588 — `preBatchContent` is restored, cache is invalidated, and `applied: 0` is returned. All-or-nothing semantics preserved.

**Subtle bug caught during dev:** the initial extraction was `const { _expected_version, ...patch } = op;` which left `patch.op` and `patch.id` populated. The deny-list caught the lookup-key `id` as if it were a user-supplied patch field. Fixed by destructuring `op` and `id` too. The 5 existing batch tests caught this immediately (`write+update+delete atomic` failed with `applied: 0`).

### 3. Added 2 regression tests

In `__tests__/legacy-mcp/meta-state-batch-tool.test.js`:

- **`update op with code_fingerprint in patch is rejected`** — pins a stale `sha256:0000...` fingerprint via batch, asserts the op is rejected with `reason: "immutable_field"`, `denied_fields` includes `code_fingerprint`, and the file is byte-identical post-rollback.
- **`update op with any IMMUTABLE_PATCH_FIELDS key is rejected`** — confirms the deny-list is enforced broadly, not just for `code_fingerprint` (uses `resolved_at`).

### 4. Marked `repoint-fingerprints.cjs` historical

Added a header comment noting:
- The script was executed 2026-06-24 (Phase 6 fingerprint repoint).
- Re-running now fails with `reason: "immutable_field"` because the batch deny-list blocks `code_fingerprint` updates.
- Future repoints should call `meta_state_refresh_fingerprint` per entry (the documented pattern).

The script is preserved for forensic continuity (it's in the plan directory, not in production).

### 5. Refreshed 2 stale fingerprints

After the code change, the cold-tier regression test caught drift on:

- `meta-260614T1236Z-...` (anchored to `meta-state-patch-tool.js` — file changed)
- `meta-260625T0255Z-...` (anchored to `core/meta-state.js:486-565` — file changed)

Both refreshed via `meta_state_refresh_fingerprint`. The new fingerprints match the live files.

## Verification

- `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-batch-tool.test.js` → 7/7 pass (5 existing + 2 new)
- `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-patch-immutable-fields.test.js` → 2/2 pass (backward compat re-export works)
- `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js` → passes
- `pnpm test` → 9/9 globs pass (~1188 tests, ~25s)

## Registry delta

- **1 finding resolved:** `meta-260625T0255Z-the-meta-state-batch-mcp-tool-bypasses-the-immutable-patch-f` (`status: reported → active → resolved`)
- **2 findings refreshed:** `meta-260614T1236Z-...`, `meta-260625T0255Z-...` (code_fingerprint updated to match the new file content)
- **0 entries archived, 0 superseded**

## Files changed

- `tools/learning-loop-mastra/core/meta-state.js` — added `IMMUTABLE_PATCH_FIELDS` export, added deny-list check in `metaStateBatch`, passes `denied_fields` through the catch block
- `tools/learning-loop-mastra/tools/legacy/meta-state-patch-tool.js` — imports `IMMUTABLE_PATCH_FIELDS` from core, re-exports for backward compat
- `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-batch-tool.test.js` — added 2 regression tests
- `plans/260624-2335-phase-e-foundation/scripts/repoint-fingerprints.cjs` — added HISTORICAL header
- `meta-state.jsonl` — ack + refresh + resolve operations
