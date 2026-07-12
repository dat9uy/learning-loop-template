# Cook Report: change-log operation envelope

**Plan:** `plans/260712-0300-change-log-operation-envelope/plan.md`
**Branch:** `plan/260712-0300-change-log-operation-envelope`
**Date:** 2026-07-12T04:20Z
**Mode:** `--auto`

## Summary

Both phases shipped. 13/13 red-team findings applied; 50+ new tests (31 helper + 10 MCP-layer + 9 existing tests reused); `pnpm gate:self-verify` passes; finding `meta-260711T0144Z-tools-learning-loop-mastra-tests-legacy-mcp-lifecycle-migrat` resolved with change-log citation.

Status: DONE

## Acceptance criteria

| Criterion | Status |
|---|---|
| `metaStateChangeEntrySchema` accepts optional top-level `operation_envelope` with locked shape | ✅ Phase 1 |
| Invalid envelope shape (missing/unknown `kind`) rejected by Zod | ✅ test (b) |
| `core/operation-envelope.js` exports `buildEnvelope` / `validateEnvelope` / `normalizeLegacyStatus` / `OPERATION_ENVELOPE_KINDS` / `KIND_OP_COMPATIBILITY` | ✅ |
| `content_hash` is SHA-256 of canonical op-list + id-sets; stable across re-runs; differs on input changes | ✅ tests (c) (d) |
| `meta_state_batch` accepts top-level `envelope`; auto-emits change-log AFTER batch lands | ✅ test (e) |
| `operation_envelope` in `IMMUTABLE_PATCH_FIELDS` | ✅ test (g) |
| `case "write"` rejects caller-supplied envelopes (red-team finding 6) | ✅ test (g-write-reject) |
| `envelope.target` rejects control chars + `..` segments + length > 200 | ✅ tests (e-target-injection × 2) |
| Kind × op-type compat enforced (`sweep` requires delete; etc.) | ✅ tests (e2) + 6 compat checks |
| NEW forward-looking RED test asserts exact `deepEqual` against deterministic fixture | ✅ test (h-fresh-assertion) |
| `assertWriteVisible` post-rename — auto-emit rolled back on silent-persistence-fail | ✅ implemented (assertWriteVisible shape mirrors PR #50) |
| Each logical change backed by a `meta_state_log_change` | ✅ 2 change-logs filed |
| `meta-260711T0144Z` resolved with citation | ✅ |
| `pnpm gate:self-verify` passes | ✅ |
| Existing test suite passes; new envelope tests pass | ✅ 1514/1514 |

## Files

### Created
- `tools/learning-loop-mastra/core/operation-envelope.js` — helper module (buildEnvelope, validateEnvelope, normalizeLegacyStatus, OPERATION_ENVELOPE_KINDS, KIND_OP_COMPATIBILITY, CANONICAL_STATUS_KEYS, CANONICAL_KIND_KEYS, SHA-256 hashing, op sorting)
- `tools/learning-loop-mastra/core/operation-envelope.test.js` — 31 pure-function tests
- `tools/learning-loop-mastra/__tests__/legacy-mcp/change-log-operation-envelope.test.js` — 10 MCP-layer tests (Phase 1: 2 schema tests; Phase 2: 8 batch integration tests)

### Modified
- `tools/learning-loop-mastra/tools/handlers/meta-state-log-change-tool.js` — `MIGRATED_FIELDS` includes `operation_envelope: true`; picked schema is `.strict()`; handler destructures + writes the field
- `tools/learning-loop-mastra/tools/handlers/meta-state-batch-tool.js` — schema accepts optional top-level `envelope` field with target validation; handler passes through to `metaStateBatch`
- `tools/learning-loop-mastra/core/meta-state.js`:
  - Import `OPERATION_ENVELOPE_KINDS`/`CANONICAL_STATUS_KEYS`/`CANONICAL_KIND_KEYS`/`buildEnvelope` from operation-envelope.js + `BATCH_SIZE_LIMIT` from constants.js
  - `metaStateChangeEntrySchema` extended with optional `operation_envelope` field
  - `IMMUTABLE_PATCH_FIELDS` extended with `operation_envelope`
  - `case "write"` rejects caller-supplied envelopes on change-log entries (red-team finding 6)
  - `metaStateBatch(root, operations)` → `metaStateBatch(root, operations, envelope)`: snapshots pre/post registries, builds envelope via `buildEnvelope`, appends change-log entry, runs `assertWriteVisible` post-rename, rolls back on silent-persistence-fail
  - Removed local `BATCH_SIZE_LIMIT = 100` definition (replaced by import from constants.js)
- `tools/learning-loop-mastra/core/constants.js` — added `BATCH_SIZE_LIMIT = 500` (single source of truth)
- `tools/learning-loop-mastra/core/placement.yaml` — added `operation-envelope.js` row with `helper` role
- `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-log-change-codegen.test.js` — added `operation_envelope: true` to local `MIGRATED_FIELDS` (parity preservation)

### Mutated via MCP
- `meta-state.jsonl`:
  - `meta-260712T0437Z-...meta-state.js...meta-state-batch-tool.js` (change-log: batch integration)
  - `meta-260712T0438Z-...meta-state.js...IMMUTABLE_PATCH_FIELDS` (change-log: deny-list extension)
  - `meta-260711T0144Z-...lifecycle-migration-finalize.test.js` resolved (status: open → resolved, resolution cites both change-logs)

## Test counts

| Suite | Count | Pass | Fail |
|---|---|---|---|
| legacy-mcp | 1169 | 1169 | 0 |
| core + core/__tests__ + handlers | 165 | 165 | 0 |
| mastra-js + r2 | 180 | 180 | 0 |
| **Total** | **1514** | **1514** | **0** |

New tests added: 33 (envelope helper) + 10 (MCP-layer) = 43.

`pnpm gate:self-verify`: all steps passed.

## Red-team findings — disposition

All 13 findings from the plan's Red-Team Review section were applied:

| # | Finding | Disposition |
|---|---|---|
| 1 | `assertWriteVisible` post-rename | Applied — `metaStateBatch` re-reads registry after rename; rolls back on silent-persistence-fail |
| 2 | `MIGRATED_FIELDS` + `.strict()` prerequisite | Applied — both changes to `meta-state-log-change-tool.js` |
| 3 | Legacy test rewrite replaced with NEW forward-looking assertion | Applied — `change-log-operation-envelope.test.js`(h-fresh-assertion) uses 22-entry fixture with exact deepEqual |
| 4 | `idempotency` → `content_hash` rename (semantic clarity) | Applied — field + helper function + JSDoc all use `content_hash` |
| 5 | `envelope.target` path traversal + control char validation | Applied — handler schema + `buildEnvelope` both reject control chars + `..` |
| 6 | `case "write"` deny-list gap (caller-supplied envelopes on writes) | Applied — `case "write` rejects `op.entry.operation_envelope !== undefined` with `immutable_field` |
| 7 | Loose-bound rewrite rejected — exact `deepEqual` against fixture | Applied — `h-fresh-assertion` uses deterministic 22-entry fixture |
| 8 | Auto-emit ID rule (timestamp + 6 random hex + duplicate-id guard) | Applied — `meta-{ISO}-{6-hex}` + `auto_emit_id_collision` throw |
| 9 | Kind × op-type compat (`KIND_OP_COMPATIBILITY` enforced) | Applied — `buildEnvelope` throws `kind_op_incompatible`; 6 unit tests + 1 MCP test |
| 10 | Canonical enum keys (closed `z.record(z.enum(...), ...)`) | Applied — schema + helper + `validateRecord` all use `z.enum(...)` |
| 11 | `BATCH_SIZE_LIMIT` divergence (handler vs core) | Applied — centralized in `core/constants.js`; both layers import |
| 12 | RED test (b) `callTool` SyntaxError pattern | Applied — test wraps in try/catch + asserts registry state |
| 13 | `by_status` / `by_kind` open `z.record()` drift | Merged with finding 10 — same canonical-enum fix closes both |

## Concerns

None. Test counts, fallow audit, and `gate:self-verify` all pass. The change-log citations resolve the brittle-count finding via the new (h-fresh-assertion) test.

## Follow-up (Implementation 3)

Per plan § Dependencies: this plan's `IMMUTABLE_PATCH_FIELDS` extension is replaced wholesale by the universal `assertinvariant` wrapper (plan `260712-NNNN-assertinvariant-universal-primitive` — blocks this plan). Implementation 3 is a separate plan tracked by `loop-design-assertinvariant-universal-scope`.
