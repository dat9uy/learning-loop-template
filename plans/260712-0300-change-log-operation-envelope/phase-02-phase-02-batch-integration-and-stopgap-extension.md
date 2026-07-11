---
phase: 2
title: "phase-02-batch-integration-and-stopgap-extension"
status: pending
priority: P1
dependencies: ["phase-01-phase-01-red-tests-and-green-envelope-helper"]
---

# Phase 2: Batch integration + IMMUTABLE_PATCH_FIELDS extension + closeout

## Overview

Wire the envelope into `meta_state_batch`: accept a top-level `envelope` field parallel to `operations`, compute pre/post snapshots inside `metaStateBatch`, and auto-emit an envelope-annotated change-log AFTER the batch lands (operator-confirmed ordering). Extend `IMMUTABLE_PATCH_FIELDS` with `operation_envelope` (same defense principle as Phase 2 stopgap in plan 260712-0109 — closes the batch identity hole until Implementation 3). Rewrite the legacy-mcp migration test (`meta-260711T0144Z` regression) to assert via envelope fields instead of brittle counts. Resolve the finding. File change-logs. Full regression.

## Requirements

- Functional:
  - `meta_state_batch` accepts an optional top-level `envelope` field in the request shape (parallel to `operations`).
  - When `envelope` is present, after a successful batch, an envelope-annotated change-log entry is auto-emitted with `operation_envelope.kind === envelope.kind`, `target === envelope.target`, `pre_count`/`post_count` reflecting the registry before/after the batch, and `content_hash` matching the helper's hash.
  - When the batch fails, NO change-log is emitted (rollback semantics; the audit trail records the failure via `gate-log.jsonl`, not a change-log).
  - `IMMUTABLE_PATCH_FIELDS` includes `operation_envelope` — a `meta_state_batch.update` op with `operation_envelope: ...` is rejected with `immutable_field`.
  - `case "write"` in `metaStateBatch` rejects caller-supplied envelopes on change-log entries — `operation_envelope` is auto-emit ONLY (red-team finding 6).
  - `assertWriteVisible` after `renameSync` re-reads the registry and rolls back on silent-persistence-fail (red-team finding 1; mirrors `meta_state_log_change` pattern).
  - A NEW forward-looking RED test in `change-log-operation-envelope.test.js` asserts exact `deepEqual` of pre/post counts against a deterministic fixture (not loose bounds; red-team finding 7 fix). The legacy `lifecycle-migration-finalize.test.js` brittle assertions were already removed per `meta-state.jsonl:271`; that file is unchanged.
  - `meta-260711T0144Z` resolves with `meta_state_resolve` + resolution note citing the change-log entry.
- Non-functional:
  - `meta_state_batch` envelope-emit is a single change-log per batch (no per-op logs).
  - Auto-emit uses the same `enqueue` + `withRegistryLock` pattern as the batch itself (no race window).
  - The change-log is written via `writeEntry` directly (same path as `meta_state_log_change`); no batch op required.

## Architecture

**Centralized constants (`core/constants.js`)** — new file (red-team finding 11):

```js
// Single source of truth for BATCH_SIZE_LIMIT (red-team finding 11).
// The previous handler=500 vs core=100 default divergence let 100-500 op
// callers get a misleading applied:0 without explanation.
export const BATCH_SIZE_LIMIT = Number(process.env.META_STATE_BATCH_LIMIT) || 500;
```

Import from both `tools/handlers/meta-state-batch-tool.js:7` and `core/meta-state.js:741`; reconcile to 500 as the canonical default.

**Batch caller (`tools/handlers/meta-state-batch-tool.js:34-42`)** — extend `schema`:

```js
schema: {
  operations: z.preprocess(deepStripEnvelope, z.array(opSchema).min(1).max(BATCH_SIZE_LIMIT))
    .describe(`Array of operations to apply...`),
  envelope: z.preprocess(
    deepStripEnvelope,
    z.object({
      kind: z.enum(OPERATION_ENVELOPE_KINDS)
        .describe("Magnitude kind; see loop-design-operation-envelope-on-change-log. Compat with ops is enforced at buildEnvelope (KIND_OP_COMPATIBILITY)."),
      target: z.string().min(1).max(200)
        .regex(/^[^\x00-\x1f\x7f]+$/)  // no control chars
        .regex(/^(?!.*\.\.).*$/)        // no '..' path segments
        .describe("Identifier for the batch's target (e.g., 'drift-closeout-2026-07-12'). Validated for path safety; not a filesystem path."),
    }).optional()
  ).describe("Optional magnitude envelope; when present, an envelope-annotated change-log is auto-emitted after the batch lands. pre_count/post_count are computed from the registry before/after the batch; content_hash is a SHA-256 of kind+target+canonical op-list+entry-id-set (NOT a replay protection). See loop-design-operation-envelope-on-change-log."),
}
```

**Batch handler (`core/meta-state.js:747-845`)** — wire envelope-emit with `assertWriteVisible` pattern:

1. After `withRegistryLock` enters and `readRegistry(root)` populates `entries` (line 759):
   - Snapshot `preRegistry = entries.map(e => ({id:e.id, status:e.status, entry_kind:e.entry_kind}))` (just the fields needed for `pre_count.by_status` / `by_kind`).
2. Run the ops loop (lines 760-836) as today.
3. **Before the file write**, IF `envelope` was passed:
   - Validate `kind` against `KIND_OP_COMPATIBILITY` via `buildEnvelope` (red-team finding 9: throw `kind_op_incompatible` on mismatch).
   - Compute `postRegistry` similarly to `preRegistry`.
   - Generate auto-emit id: `meta-{new Date().toISOString().replace(/[-:.]/g, "")}-{random 6 hex}` (red-team finding 8).
   - **Duplicate-id guard:** if `entries.find(e => e.id === autoEmitId)` already exists, throw `auto_emit_id_collision` and roll back.
   - Build the envelope via `buildEnvelope({kind: envelope.kind, target: envelope.target, ops: operations, preRegistry, postRegistry})`.
   - Append a change-log entry to `entries`: `{id: autoEmitId, entry_kind: "change-log", change_dimension: "mechanical", change_target: envelope.target, change_diff: {added:[], removed:[], changed:[]}, reason: "Auto-emitted by meta_state_batch envelope pass-through (loop-design-operation-envelope-on-change-log).", operation_envelope: builtEnvelope, status: "active", created_at: new Date().toISOString()}`.
4. `writeFileSync(tmpPath, ...)` + `renameSync(tmpPath, path)` + `invalidateCache(root)` (lines 838-841).
5. **`assertWriteVisible` post-rename verification (red-team finding 1):**
   - Re-read registry; verify the auto-emit id is present.
   - On failure: restore `preBatchContent`, `invalidateCache`, return `{applied:0, failed_at:null, reason:"change_log_not_visible"}`.
   - On success: return `{applied: operations.length, failed_at: null}` (today's shape).
6. On any `try/catch` rollback path (lines 824-834) OR `assertWriteVisible` failure: NO change-log is persisted (the in-memory state is gone after rollback restores the file).

**Deny-list extension (`core/meta-state.js:300-312`)** — add `operation_envelope`:

```js
export const IMMUTABLE_PATCH_FIELDS = new Set([
  "code_fingerprint",
  "code_ref",
  "ledger_ref",
  "created_at",
  "version",
  "entry_kind",  // Phase 2 stopgap, plan 260712-0109
  "status",      // Phase 2 stopgap, plan 260712-0109
  "operation_envelope",  // Plan 260712-0300 Phase 2 — same defense principle; replaced by universal wrapper (Implementation 3)
]);
```

**Write-path deny-list enforcement (red-team finding 6)** — extend `case "write"` (meta-state.js:773-777):

```js
case "write": {
  const validation = metaStateEntrySchema.safeParse(op.entry);
  if (!validation.success) throw new Error("validation_failed");
  // Reject caller-supplied envelopes on writes (envelope is auto-emit ONLY;
  // batch handles envelope construction at the auto-emit step).
  // Without this, an attacker writes an op.entry with operation_envelope set,
  // bypassing the deny-list (which only fires on update).
  if (op.entry.entry_kind === "change-log" && op.entry.operation_envelope !== undefined) {
    const err = new Error("immutable_field");
    err.denied_fields = ["operation_envelope"];
    throw err;
  }
  entries.push(validation.data);
  break;
}
```

**Test design (red-team findings 3, 7)** — replaced loose-bound rewrite with **NEW forward-looking assertion**:

The existing `lifecycle-migration-finalize.test.js` already removed brittle `>= 22 open findings` / `>= 229 total entries` assertions per `meta-state.jsonl:271`. Phase 2 adds a NEW forward-looking RED test in `change-log-operation-envelope.test.js` (the file created in Phase 1), not a rewrite of the existing test:

- Pre-populate registry with a deterministic 22-entry migration fixture.
- Run `meta_state_batch` with the migration-kind envelope + ops to flip 2 entries to `resolved`.
- Read the registry; filter for `operation_envelope.kind === "migration"`.
- Assert: **exact** equality of `pre_count` against the fixture-computed expected counts; **exact** equality of `post_count`; `content_hash` matches SHA-256 of the fixture deterministically. NO loose bounds.
- Add a test-file header comment citing the red-team finding + `meta-state.jsonl:271` evidence.

## Related Code Files

- Create: `tools/learning-loop-mastra/core/constants.js` (single source of truth for `BATCH_SIZE_LIMIT`; red-team finding 11)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-batch-tool.js` (lines 9-29, 31-60 — extend opSchema + handler; import `BATCH_SIZE_LIMIT` from `core/constants.js`)
- Modify: `tools/learning-loop-mastra/core/meta-state.js`:
  - Lines 300-312 — extend `IMMUTABLE_PATCH_FIELDS` with `operation_envelope`
  - Lines 747-845 — wire `envelope` arg + auto-emit inside `metaStateBatch` (with `assertWriteVisible` post-rename)
  - Lines 773-777 — extend `case "write"` to reject caller-supplied envelopes (red-team finding 6)
  - Line 741 — import `BATCH_SIZE_LIMIT` from `core/constants.js`
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/change-log-operation-envelope.test.js`:
  - Add Phase 2 tests (batch integration + deny-list extension + auto-emit + assertWriteVisible + write-path reject + target validation + kind×op compatibility + fresh-assertion)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-batch-tool.test.js`:
  - Add envelope-emit tests (positive case + rollback case)
- Reference (no modify needed): `tools/learning-loop-mastra/__tests__/legacy-mcp/lifecycle-migration-finalize.test.js` — already removed brittle assertions per `meta-state.jsonl:271`; Phase 2 verifies this file passes unchanged
- Mutated via MCP (no source-file edit):
  - `meta-state.jsonl`: 2 `meta_state_log_change` entries (batch integration; deny-list extension) + `meta_state_resolve` on `meta-260711T0144Z`

## Implementation Steps

1. **Create** `core/constants.js` with `BATCH_SIZE_LIMIT` (red-team finding 11).
2. **Patch** `tools/handlers/meta-state-batch-tool.js:7` to import `BATCH_SIZE_LIMIT` from `core/constants.js`.
3. **Patch** `core/meta-state.js:741` to import `BATCH_SIZE_LIMIT` from `core/constants.js` (single source of truth).
4. **Read** `core/meta-state.js:747-845` to confirm line range hasn't drifted.
5. **Read** `tools/handlers/meta-state-batch-tool.js:1-60` for the handler shape.
6. **Read** `tools/lib/gate-logging.js` to confirm the gate-log path (`join(root, ".claude", "coordination", "gate-log.jsonl")` — Implementation 1 red-team finding).
7. **Read** `tools/learning-loop-mastra/__tests__/legacy-mcp/lifecycle-migration-finalize.test.js` (the actual file referenced by `meta-260711T0144Z`, per `meta-state.jsonl:271`) to confirm the existing assertions and confirm no rewrite is needed.
8. **Write RED test (e)** in `__tests__/legacy-mcp/change-log-operation-envelope.test.js`:
   - Use `withMcpServer` + `callTool("mastra_meta_state_batch", { operations: [...], envelope: {kind:"migration", target:"test-migration"} })`.
   - Assert: registry contains a change-log with `operation_envelope.kind === "migration"`, `target === "test-migration"`, valid `content_hash`.
   - **RED today**: batch handler doesn't accept `envelope` field.
9. **Write RED test (e2)** in the same file (red-team finding 9):
   - Construct a batch with 0 delete ops + envelope `{kind:"sweep"}`.
   - Assert: batch fails with `kind_op_incompatible`; registry state unchanged.
   - **RED today**: KIND_OP_COMPATIBILITY is not enforced.
10. **Write RED test (e-target-injection)** in the same file (red-team finding 5):
    - Try `envelope.target = "../../../etc/passwd"`.
    - Try `envelope.target = "a\x00b"`.
    - Assert: both are rejected by Zod with `target_invalid`; registry state unchanged.
    - **RED today**: target validation not present.
11. **Write RED test (f)** in the same file:
    - Pass `envelope` + a deliberately failing op (e.g., write with invalid schema).
    - Assert: batch fails; NO change-log with `operation_envelope` is in the registry.
    - **RED today**: same as (e).
12. **Write RED test (f-write-emit)** in the same file (red-team finding 1):
    - Trigger a disk-full simulation (mock `writeFileSync` to throw).
    - Pass valid `envelope`.
    - Assert: batch returns `change_log_not_visible`; registry state unchanged; no auto-emit change-log in registry.
    - **RED today**: no `assertWriteVisible` step.
13. **Write RED test (g)** in the same file:
    - Pass `envelope` + a batch update that tries to set `operation_envelope` on an existing entry.
    - Assert: batch fails with `immutable_field`; registry state unchanged.
    - **RED today**: `IMMUTABLE_PATCH_FIELDS` doesn't include `operation_envelope` yet.
14. **Write RED test (g-write-reject)** in the same file (red-team finding 6):
    - Direct write op with `op.entry.entry_kind = "change-log"` and `op.entry.operation_envelope` set.
    - Assert: batch fails with `immutable_field`; registry state unchanged.
    - **RED today**: `case "write"` doesn't reject caller-supplied envelopes.
15. **Write RED test (h-fresh-assertion)** in the same file (red-team finding 7, replaces the original "rewrite"):
    - Pre-populate registry with a deterministic 22-entry migration fixture.
    - Run `meta_state_batch` with `envelope.kind = "migration"`, `target = "fixture-migration"`, ops to flip 2 entries to `resolved`.
    - Read registry; filter for `operation_envelope.kind === "migration"`.
    - Assert: **exact** `deepEqual(envelope.pre_count, fixture.expected_pre_count)`; **exact** `deepEqual(envelope.post_count, fixture.expected_post_count)`; `content_hash` matches the fixture-deterministic SHA-256.
    - Add a test-file header comment citing the red-team finding + `meta-state.jsonl:271` evidence.
    - **RED today**: batch handler doesn't auto-emit envelope.
16. **GREEN test (e)** — extend `meta-state-batch-tool.js:31-60`:
    - Add `envelope` field to schema (parallel to `operations`).
    - Pass through to `metaStateBatch` in the handler.
17. **GREEN test (e) + (f) + (f-write-emit) + (g)** — extend `meta-state.js:747-845`:
    - Add `envelope` parameter to `metaStateBatch(root, operations, envelope)`.
    - Snapshot `entries` after `readRegistry` (line 759) → `preRegistry`.
    - After the ops loop completes successfully AND the in-memory `entries` is finalized:
      - Generate auto-emit id (red-team finding 8: `meta-{ISO timestamp}-{6 random hex}`).
      - **Duplicate-id guard**: if `entries.find(e => e.id === autoEmitId)` exists, throw `auto_emit_id_collision`.
      - Compute `postRegistry = [...entries]` (before the file rewrite).
      - Call `buildEnvelope({kind: envelope.kind, target: envelope.target, ops: operations, preRegistry, postRegistry})` — this throws `kind_op_incompatible` for mismatch (red-team finding 9).
      - Append a change-log entry to `entries` (same array, before `writeFileSync`).
    - After `writeFileSync` + `renameSync` + `invalidateCache` (lines 838-841), implement `assertWriteVisible` (red-team finding 1):
      - Re-read registry via `readRegistry(root)`.
      - If the auto-emit id is NOT present: restore `preBatchContent`, `invalidateCache(root)`, return `{applied:0, failed_at:null, reason:"change_log_not_visible"}`.
      - On success: return `{applied: operations.length, failed_at: null}` (today's shape).
    - On rollback (any `try/catch` path), NO envelope is built; no change-log is appended (the in-memory state is gone after rollback restores the file).
18. **GREEN test (e-target-injection)** — extend the batch handler's `envelope` Zod schema with `target` validation:
    - `.regex(/^[^\x00-\x1f\x7f]+$/)` rejects control chars.
    - `.regex(/^(?!.*\.\.).*$/)` rejects `..` path segments.
    - `.max(200)` length cap.
    - Zod rejects with `target_invalid`.
19. **GREEN test (g)** — extend `IMMUTABLE_PATCH_FIELDS` at `meta-state.js:300-312`:
    - Add `"operation_envelope"` to the Set.
    - Update the jsdoc above the Set to note the addition (same shape as the Phase 2 stopgap note for `entry_kind + status`).
20. **GREEN test (g-write-reject)** — extend `case "write"` (meta-state.js:773-777):
    - Add the caller-supplied envelope reject check (see Architecture above).
    - Throws `immutable_field` with `denied_fields: ["operation_envelope"]`.
21. **Run** the RED test suite to confirm GREEN:
    - `pnpm test:integration tools/learning-loop-mastra/__tests__/legacy-mcp/change-log-operation-envelope.test.js`
    - `pnpm test:integration tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-batch-tool.test.js`
    - `pnpm test:integration tools/learning-loop-mastra/__tests__/legacy-mcp/lifecycle-migration-finalize.test.js` (unchanged — should pass as-is)
22. **File change-logs** via `mcp__learning-loop__mastra_meta_state_log_change` (operator-confirmed: edit-first, change-log-after):
    - One change-log for the batch integration (code: `core/meta-state.js:747` + `tools/handlers/meta-state-batch-tool.js:31-60` + `core/constants.js`).
    - One change-log for the deny-list extension (code: `core/meta-state.js:300-312` + `case "write"` at line 773-777).
23. **Resolve the finding** via `mcp__learning-loop__mastra_meta_state_resolve`:
    - `id: "meta-260711T0144Z-..."`
    - `resolution: "Closed by operation_envelope field on change-log entries (plan 260712-0300 Phase 2). A NEW forward-looking RED test in change-log-operation-envelope.test.js asserts exact equality of pre_count/post_count against a deterministic 22-entry migration fixture (red-team finding 7 fix — rejected the loose-bound rewrite). content_hash replaces idempotency as the field name (red-team finding 4). Change-log ref: <id from step 22>."`
24. **Run full regression**:
    - `pnpm gate:self-verify` (re-seeds `file-index.jsonl` via `seed-file-index.mjs` per Implementation 1 red-team finding).
    - Existing test suite passes (1776 tests baseline + new envelope tests).

## Success Criteria

- [ ] `BATCH_SIZE_LIMIT` lives in `core/constants.js`; both handler and core import from it (single source of truth).
- [ ] `MIGRATED_FIELDS` includes `operation_envelope`; log-change picked schema is `.strict()` (Phase 1 prerequisite).
- [ ] Test (e): `meta_state_batch` accepts `envelope`; auto-emits an envelope-annotated change-log with correct kind, target, pre/post counts, content_hash.
- [ ] Test (e2): `envelope.kind === "sweep"` with 0 delete ops is rejected with `kind_op_incompatible`.
- [ ] Test (e-target-injection): `target` with control chars or `..` path segments is rejected with `target_invalid`.
- [ ] Test (f): when the batch fails (op-level error), NO envelope-annotated change-log is emitted (rollback semantics).
- [ ] Test (f-write-emit): when `writeFileSync` throws AFTER the ops loop, batch returns `change_log_not_visible`; registry state unchanged.
- [ ] Test (g): `meta_state_batch.update` with `operation_envelope` field is rejected with `immutable_field`; registry state unchanged.
- [ ] Test (g-write-reject): `meta_state_batch.write` with `op.entry.entry_kind === "change-log"` AND `op.entry.operation_envelope` set is rejected with `immutable_field`.
- [ ] Test (h-fresh-assertion): NEW forward-looking test asserts **exact** `deepEqual` of pre/post counts against the deterministic fixture (NOT loose bounds).
- [ ] `IMMUTABLE_PATCH_FIELDS` includes `operation_envelope` after the edit lands.
- [ ] Each logical change backed by a `meta_state_log_change` filed AFTER the edit lands (2 total: batch integration, deny-list extension — edit-first, change-log-after).
- [ ] `meta-260711T0144Z` resolves with `meta_state_resolve` + resolution note citing the change-log entry.
- [ ] `pnpm gate:self-verify` passes; existing test suite passes; new envelope tests pass.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Auto-emit change-log race with concurrent batch ops | `metaStateBatch` runs inside `withRegistryLock`; the auto-emit appends to the same in-memory `entries` array before the file rewrite, atomically |
| Auto-emit id collision when two batches share a target within the same second | Red-team finding 8 fix: timestamp + 6 random hex chars. Duplicate-id guard throws `auto_emit_id_collision` if collision detected (astronomically rare at 6 hex) |
| `writeFileSync`/`renameSync` failure after ops loop completes | Red-team finding 1 fix: `assertWriteVisible` re-reads after rename + rolls back entire batch on silent-persistence-fail. Mirrors `meta_state_log_change` pattern |
| Caller-supplied envelope on write op (forges audit trail) | Red-team finding 6 fix: `case "write"` reject check. Envelope is auto-emit ONLY; write with envelope is invalid |
| `envelope.target` path traversal or shell injection | Red-team finding 5 fix: regex rejects control chars + `..` segments; length cap; `path-containment.js` integration if target looks like a path |
| Caller passes `envelope.kind` that mismatches ops | Red-team finding 9 fix: `KIND_OP_COMPATIBILITY` enforced by `buildEnvelope` throws `kind_op_incompatible` |
| `meta_state_log_change` MCP tool path silently strips `operation_envelope` | Phase 1 prerequisite (red-team finding 2): add to `MIGRATED_FIELDS` + `.strict()` |
| Test (h-fresh-assertion) fixture approach adds brittleness to a different layer | Fixture is the source of truth (deterministic seed); counts are computed from the fixture, not hand-picked. NO loose bounds in this test |
| Legacy `active\|reported\|stale` registries break `by_status` test assertions | Phase 1 RED test (d-normalize) covers normalization; `buildEnvelope` calls `normalizeLegacyStatus` at the boundary |
| `BATCH_SIZE_LIMIT` env override path changes | Centralize to `core/constants.js` so both sides read the same source; env override is read once at module load (preexisting behavior preserved) |
| `IMMUTABLE_PATCH_FIELDS` extension blocks a future legitimate `operation_envelope` set via patch | No legitimate caller sets it via patch — envelope construction is auto-emit. Implementation 3 replaces the deny-list with a comparison wrapper, eliminating the constraint |
| Phase 2 acceptance depends on Phase 1 GREEN | Phase 1 must complete + tests GREEN before Phase 2 begins. `dependencies: ["phase-01-phase-01-red-tests-and-green-envelope-helper"]` in frontmatter enforces this |
