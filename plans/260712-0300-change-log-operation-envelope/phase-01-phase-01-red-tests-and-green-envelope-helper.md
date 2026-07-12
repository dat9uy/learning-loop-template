---
phase: 1
title: "phase-01-red-tests-and-green-envelope-helper"
status: pending
priority: P1
dependencies: []
---

# Phase 1: RED tests + GREEN envelope helper

## Overview

Write RED regression tests for the new `operation_envelope` field on change-log entries, then turn them GREEN with the minimum code: extend `metaStateChangeEntrySchema` with the optional envelope field and create `core/operation-envelope.js` with `buildEnvelope`, `validateEnvelope`, and the kind enum export. No batch-handler wiring in this phase (Phase 2).

## Requirements

- Functional:
  - `metaStateChangeEntrySchema` accepts an optional top-level `operation_envelope` with the locked shape.
  - Invalid envelope shape is rejected by Zod (missing `kind`, unknown kind value, malformed `pre_count`/`post_count`).
  - `core/operation-envelope.js` exports:
    - `OPERATION_ENVELOPE_KINDS` — string array of the 8 kinds (frozen export for caller-side validation).
    - `buildEnvelope({kind, target, ops, preRegistry, postRegistry})` — returns the locked shape with correct counts + content_hash.
    - `validateEnvelope(envelope)` — pure-function validator; returns `{ok: true, envelope}` or `{ok: false, reason}`.
- Non-functional:
  - Idempotency hash is SHA-256 of the canonical op-list + entry-id-set; stable across re-runs on the same registry snapshot.
  - Helper has zero side effects (pure function, no I/O, no registry mutation).

## Architecture

**Schema extension (`meta-state.js:148-189`)** — add to `metaStateChangeEntrySchema`:

```js
operation_envelope: z.object({
  kind: z.enum(OPERATION_ENVELOPE_KINDS).describe("..."),
  target: z.string().min(1).max(200)
    .regex(/^[^\\x00-\\x1f\\x7f]+$/)  // no control chars
    .regex(/^(?!.*\\.\\.).*$/)        // no '..' path segments
    .describe("..."),
  pre_count: z.object({
    total: z.number().int().nonnegative(),
    by_status: z.record(z.enum(["open", "resolved", "superseded", "archived"]), z.number().int().nonnegative()),
    by_kind: z.record(z.enum(["finding", "change-log", "rule", "loop-design"]), z.number().int().nonnegative()),
  }).describe("Registry snapshot before the batch"),
  post_count: z.object({
    total: z.number().int().nonnegative(),
    by_status: z.record(z.enum(["open", "resolved", "superseded", "archived"]), z.number().int().nonnegative()),
    by_kind: z.record(z.enum(["finding", "change-log", "rule", "loop-design"]), z.number().int().nonnegative()),
  }).describe("Registry snapshot after the batch"),
  content_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/)
    .describe("Content-hash of kind + target + canonicalized op-list + entry-id-set; same input → same hash. NOT a replay protection — replay detection belongs elsewhere."),
}).optional().describe("Optional magnitude envelope for batch mutations; see loop-design-operation-envelope-on-change-log")
```

**Helper module (`core/operation-envelope.js`)** — five exports:

```js
export const OPERATION_ENVELOPE_KINDS = Object.freeze([
  "migration", "sweep", "closeout", "consolidation",
  "backfill", "archive-wave", "escalation-batch", "manual-batch",
]);

// Per-kind compatibility rules (red-team finding 9 fix).
// Enforced at buildEnvelope; mismatch throws kind_op_incompatible.
export const KIND_OP_COMPATIBILITY = Object.freeze({
  "migration":         { requiredOps: [], disallowedOps: [] },
  "sweep":             { requiredOps: ["delete"],   disallowedOps: [] },
  "consolidation":     { requiredOps: ["update"],   disallowedOps: [] },
  "closeout":          { requiredOps: ["update"],   disallowedOps: [] },
  "backfill":          { requiredOps: ["write"],    disallowedOps: [] },
  "archive-wave":      { requiredOps: ["archive"],  disallowedOps: [] },
  "escalation-batch":  { requiredOps: [], disallowedOps: [] },
  "manual-batch":      { requiredOps: [], disallowedOps: [] },
});

export function buildEnvelope({ kind, target, ops, preRegistry, postRegistry }) { /* ... */ }
export function validateEnvelope(envelope) { /* ... */ }
export function normalizeLegacyStatus(status) { /* ... */ }  // active|reported|stale → "open"
```

**Content-hash construction** (renamed from `idempotency` per red-team finding 4):
1. Canonicalize the op-list: sort by `op.id` (or by `op.entry.id` for write ops), then JSON.stringify with stable key order.
2. Canonicalize the registry snapshots: extract entry-id sets, sort lexicographically, JSON.stringify.
3. Concatenate: `kind + ":" + target + ":" + opList + ":" + preIds.join(",") + ":" + postIds.join(",")`.
4. SHA-256 → `sha256:<hex>`.

**MCP tool patch (Phase 1 prerequisite, red-team finding 2):** `meta-state-log-change-tool.js`:
- Add `operation_envelope: true` to `MIGRATED_FIELDS` (lines 16-26).
- Add `.strict()` to the picked schema so unknown fields are rejected, not silently stripped.
- Without this, RED test (a) cannot go RED — the field never reaches the registry.

## Related Code Files

- Create: `tools/learning-loop-mastra/core/operation-envelope.js`
- Create: `tools/learning-loop-mastra/core/operation-envelope.test.js`
- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/change-log-operation-envelope.test.js` (Phase 1 portion — schema tests)
- Modify: `tools/learning-loop-mastra/core/meta-state.js` (lines 148-189 — extend schema)

## Implementation Steps

0. **Phase 1 prerequisite (red-team finding 2)** — patch `tools/learning-loop-mastra/tools/handlers/meta-state-log-change-tool.js`:
   - Add `operation_envelope: true` to `MIGRATED_FIELDS` (lines 16-26).
   - Add `.strict()` to the schema built via `.pick(MIGRATED_FIELDS).shape` so unknown fields are rejected (not silently stripped).
   - Without this, RED test (a) never reaches RED state — the field is stripped before the registry sees it.
1. **Read** the change-log schema at `core/meta-state.js:148-189` and confirm the line range hasn't drifted.
2. **Read** the envelope-stripper at `core/envelope-stripper.js` to confirm the recursive strip pattern (the envelope field must round-trip through `deepStripEnvelope` without coercion artifacts).
3. **Write RED test (a)** in `__tests__/legacy-mcp/change-log-operation-envelope.test.js`:
   - Use `withMcpServer` + `callTool("mastra_meta_state_log_change", { ... envelope_field ... })`.
   - Expect: callTool succeeds; registry contains the change-log with `operation_envelope.kind === "migration"`, `target === "test-target"`, valid `content_hash`.
   - **RED today** (post-prerequisite): Zod rejects unknown field `operation_envelope` (the schema still doesn't have the field). MIGRATED_FIELDS update in step 0 is necessary but not sufficient.
4. **Write RED test (b)** in the same file:
   - Pass `operation_envelope: { kind: "unknown-kind", ... }`.
   - Expect: callTool throws SyntaxError from non-JSON MCP validation error; registry state unchanged.
   - Wrap `callTool` in try/catch + assert registry state (Implementation 1 pattern). After step 0's `.strict()` upgrade, the path throws as predicted.
   - **RED today**: same as (a) — unknown field rejected; envelope-specific reason not surfaced.
5. **Write RED test (c)** in `__tests__/core/operation-envelope.test.js` (pure-function test):
   - Call `buildEnvelope({ kind: "migration", target: "t1", ops: [...], preRegistry: [...], postRegistry: [...] })`.
   - Assert returned shape has correct `pre_count.total` (= preRegistry.length), `post_count.total` (= postRegistry.length), `content_hash` matches `^sha256:[a-f0-9]{64}$`.
   - Assert `by_status` only contains canonical keys (`{open, resolved, superseded, archived}`); assert `by_kind` only contains canonical keys (`{finding, change-log, rule, loop-design}`).
   - **RED today**: `buildEnvelope` does not exist (import throws).
6. **Write RED test (d)** in the same pure-function file:
   - Build envelope twice with the same input; assert `content_hash` is identical.
   - Build envelope twice with a different `ops` arg; assert `content_hash` differs.
   - Build envelope twice with different `kind` (same ops + registry); assert `content_hash` differs (red-team finding 6).
   - **RED today**: `buildEnvelope` does not exist.
7. **Write RED test (d-normalize)** in the same file:
   - Pre-populate registry with legacy `status: "active"` and `status: "stale"` entries (matches pre-migration state).
   - Call `buildEnvelope`.
   - Assert `pre_count.by_status` has only canonical keys; the legacy entries contribute to the `open` bucket via `normalizeLegacyStatus`.
   - **RED today**: `buildEnvelope` does not exist; without explicit normalization, registry-shape-dependent snapshot drift occurs.
8. **GREEN test (a)** — extend `metaStateChangeEntrySchema` at `core/meta-state.js:148-189`:
   - Add the `operation_envelope` field with the locked shape (see Architecture above).
   - Import `OPERATION_ENVELOPE_KINDS` from `core/operation-envelope.js` for the enum.
   - Note: create the helper file FIRST (step 9), then add the schema field — the schema imports the kind enum.
9. **GREEN test (c) + (d) + (d-normalize)** — create `core/operation-envelope.js`:
   - `OPERATION_ENVELOPE_KINDS` frozen export (use `Object.freeze([...])`).
   - `KIND_OP_COMPATIBILITY` frozen export (per-kind op-type rules; red-team finding 9).
   - `buildEnvelope({kind, target, ops, preRegistry, postRegistry})`:
     - Validate `kind` against `KIND_OP_COMPATIBILITY` against `ops`; throw `kind_op_incompatible` on mismatch.
     - Compute `pre_count` + `post_count` from the registry arrays, normalizing legacy statuses via `normalizeLegacyStatus`.
     - Compute `content_hash` from `kind + target + canonicalized ops + entry-id sets`.
     - Return the locked shape.
   - `validateEnvelope(envelope)`:
     - Re-run `metaStateChangeEntrySchema.shape.operation_envelope.safeParse(envelope)`.
     - Return `{ok: true, envelope: parsed}` or `{ok: false, reason}`.
   - `normalizeLegacyStatus(status)`:
     - Map `active|reported|stale → "open"`; return `status` unchanged for canonical keys.
10. **Run** the RED test suite to confirm GREEN:
    - `pnpm test:unit tools/learning-loop-mastra/core/operation-envelope.test.js`
    - `pnpm test:integration tools/learning-loop-mastra/__tests__/legacy-mcp/change-log-operation-envelope.test.js`
11. **Verify** no regressions:
    - `pnpm test:unit tools/learning-loop-mastra/core/meta-state.test.js` (the existing change-log schema tests must still pass — schema extension is additive).
    - `pnpm test:integration tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-batch-tool.test.js` (batch path untouched in this phase).
    - `pnpm test:integration tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-log-change-tool.test.js` (the `.strict()` upgrade must not break existing log-change tests).

## Success Criteria

- [ ] Step 0 prerequisite: `MIGRATED_FIELDS` includes `operation_envelope`; picked schema is `.strict()`.
- [ ] Test (a): `meta_state_log_change` accepts `operation_envelope` field; registry round-trips it correctly.
- [ ] Test (b): `meta_state_log_change` rejects `operation_envelope.kind === "unknown-kind"`; registry state unchanged; callTool throws SyntaxError as predicted.
- [ ] Test (c): `buildEnvelope` returns correct shape with valid `pre_count`, `post_count`, `content_hash`; canonical enum keys only.
- [ ] Test (d): `buildEnvelope` content-hash is stable across re-runs of the same input; differs when input changes; differs when `kind` changes (same ops + registry).
- [ ] Test (d-normalize): legacy `active|reported|stale` entries normalize to `open` in `by_status`.
- [ ] Existing `core/meta-state.test.js`, `meta-state-batch-tool.test.js`, `meta-state-log-change-tool.test.js` tests still pass (`.strict()` upgrade + additive schema extension).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Schema `.omit` mismatch with envelope field | Phase 1 only adds the field; no existing field is omitted. `meta_state_patch` on change-log is handler-level immutable today (meta-state-patch-tool.js:56-59), so `buildPatchSchemaFor` for `change-log` doesn't need updating in this phase |
| `OPERATION_ENVELOPE_KINDS` enum drift between schema and helper | Single source of truth: helper exports the frozen array, schema imports it. No copy-paste |
| Idempotency hash instability due to op order | Canonicalize: sort by `op.id` (or `op.entry.id`) before hashing. Documented in helper JSDoc |
| Test (b) `callTool` throws SyntaxError | Same pattern as Implementation 1: wrap in try/catch + assert registry state |
| Phase 1 leaves Phase 2 integration half-built | Phase 2 phase file explicitly continues from here; Phase 1 acceptance does not include "auto-emit on batch" |
