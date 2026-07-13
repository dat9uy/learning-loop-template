---
title: "change-log operation envelope: kind + pre/post counts + content_hash for batch mutations"
description: "Implementation 2 of the assertinvariant resolution (plans/reports/assertinvariant-meta-pattern-260711-0516-resolution-plan-report.md). Add a top-level operation_envelope field on change-log entries with kind, target, pre/post counts, and content_hash. Auto-emitted by meta_state_batch when callers pass the envelope. Close finding meta-260711T0144Z (test-fragility on legacy-mcp migration tests). Extend IMMUTABLE_PATCH_FIELDS to include operation_envelope so a stray meta_state_patch cannot silently overwrite the envelope — same defense principle as the Phase 2 stopgap just landed for entry_kind + status, replaced wholesale by the universal assertinvariant wrapper (Implementation 3)."
status: done
priority: P1
branch: "main"
tags: [meta-state, change-log, operation-envelope, batch-mutation, immutability, IMMUTABLE_PATCH_FIELDS-extension, test-fragility, meta-260711T0144Z, tdd, change-log-backed]
blockedBy: []
blocks: ["260712-0724-assertinvariant-universal-primitive"]
created: "2026-07-12T03:00:00.000Z"
createdBy: "ck:plan"
source: skill
related:
  - plans/reports/assertinvariant-meta-pattern-260711-0516-resolution-plan-report.md (source report; Implementation 2 = this plan)
  - plans/260712-0109-meta-state-patch-entry-kind-invariant/plan.md (Implementation 1 — SHIPPED via PR #51; same defense principle)
  - loop-design-operation-envelope-on-change-log (the source loop-design)
  - loop-design-migration-markers-on-change-log (corrupted-then-repaired sub-piece; now superseded by operation-envelope design)
  - loop-design-assertinvariant-universal-scope (Implementation 3 — universal wrapper replaces the IMMUTABLE_PATCH_FIELDS deny-list)
  - meta-260711T0144Z-tools-learning-loop-mastra-tests-legacy-mcp-lifecycle-migrat (finding this plan closes)
  - tools/learning-loop-mastra/core/meta-state.js:148-189 (metaStateChangeEntrySchema — operation_envelope field placement)
  - tools/learning-loop-mastra/core/meta-state.js:300-312 (IMMUTABLE_PATCH_FIELDS — extension target; red-team verified actual range)
  - tools/learning-loop-mastra/core/meta-state.js:747-845 (metaStateBatch — envelope emit integration point; red-team verified actual range)
  - tools/learning-loop-mastra/core/meta-state.js:773-777 (case "write" — caller-supplied envelope reject; red-team finding 6)
  - tools/learning-loop-mastra/tools/handlers/meta-state-batch-tool.js:9-29 (opSchema — caller-side envelope pass-through)
  - tools/learning-loop-mastra/tools/handlers/meta-state-batch-tool.js:7 (BATCH_SIZE_LIMIT — centralize to core/constants.js; red-team finding 11)
  - tools/learning-loop-mastra/tools/handlers/meta-state-log-change-tool.js:16-31 (MIGRATED_FIELDS + log-change `.strict()` — Phase 1 prerequisite; red-team finding 2)
  - tools/learning-loop-mastra/tools/handlers/meta-state-log-change-tool.js:67-88 (assertWriteVisible pattern reference — red-team finding 1)
  - tools/learning-loop-mastra/core/path-containment.js (target validation reuse — red-team finding 5)
  - tools/learning-loop-mastra/core/operation-envelope.js (new — kind_op_compatibility + content_hash + normalizeLegacyStatus; red-team finding 4 + 8 + 9 + 10)
  - tools/learning-loop-mastra/core/constants.js (new — BATCH_SIZE_LIMIT single source of truth; red-team finding 11)
  - tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-batch-tool.test.js (existing batch-test pattern)
  - tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-patch-entry-kind-invariant.test.js (TDD pattern template)
  - tools/learning-loop-mastra/__tests__/legacy-mcp/lifecycle-migration-finalize.test.js (the actual file for meta-260711T0144Z; brittle assertions already removed per meta-state.jsonl:271 — red-team finding 3)
  - AGENTS.md §6 (Internalization Rule; basis for change-log backing)
  - docs/meta-state-lifecycle.md (change-log = immutable audit; vehicle for history-before-patch)
---

# Plan: change-log operation envelope: kind + pre/post counts + content_hash for batch mutations

## Overview

**Implementation 2** of the assertinvariant resolution report. The `change-log` schema gains a top-level `operation_envelope` field capturing the magnitude of any batch mutation (kind, target, pre/post counts by status+kind, content_hash). `meta_state_batch` auto-emits an envelope-annotated change-log when callers pass the envelope alongside a write/update/archive op. Post-migration tests assert structural invariants via the envelope (closes the test-fragility shape captured in `meta-260711T0144Z`). `operation_envelope` is added to `IMMUTABLE_PATCH_FIELDS` so a stray `meta_state_patch` cannot silently overwrite it — same defense principle as the Phase 2 stopgap just landed for `entry_kind` + `status`, until the universal `assertinvariant` wrapper ships (Implementation 3).

**Scope honesty:** this plan extends `IMMUTABLE_PATCH_FIELDS` beyond the source report's literal Implementation 2 spec. The report's § Unresolved question 6 (now resolved) recommends fixing the patch-tool; the report's Implementation order does not explicitly call for extending the deny-list. **Per operator direction this session:** extend the deny-list for the same defense principle, since the universal wrapper (Implementation 3) will replace it wholesale. Documented scope expansion.

**TDD structure (per `--tdd` flag):** Phase 1 writes RED regression tests first through `withMcpServer`/`callTool` (the schema validation only fires at the MCP layer — direct handler calls bypass Zod), then the minimum code that turns RED → GREEN. Phase 2 wires the batch integration + extends the deny-list + regression.

## The bug chain (motivation)

1. `metaStateChangeEntrySchema` (meta-state.js:148-189) has `change_diff: {added, removed, changed}` arrays — free-form paths. No structural anchor for "how many entries did this batch touch, in what way".
2. Legacy-mcp migration tests (`meta-260711T0144Z`) assert migration invariants via counts on the registry (brittle to seed drift) or absence of specific entries (lose-lose: lose signal if the entry exists; lose signal if it doesn't).
3. Post-migration `meta_state_batch` runs (drift-driven closeouts, consolidations, TTL sweeps, archive waves) all leave a change-log trail, but the change-log's `change_diff` is hand-rolled paths — no field captures "this was a sweep that closed 47 stale findings across 3 affected systems".

**Abstract form:** a structural invariant is encoded as counts (brittle) or absence (lose-lose) instead of as a structured envelope that survives seed drift and is asserted by post-hoc tests.

## Architecture

| Layer | Today | After this plan |
|---|---|---|
| Change-log schema (`metaStateChangeEntrySchema`) | `change_diff: {added, removed, changed}` arrays; no magnitude anchor | + optional top-level `operation_envelope: {kind, target, pre_count, post_count, content_hash}` — kind enum: `migration \| sweep \| closeout \| consolidation \| backfill \| archive-wave \| escalation-batch \| manual-batch`; pre/post each `{total, by_status, by_kind}`; canonical by_status enum `{open, resolved, superseded, archived}`; canonical by_kind enum `{finding, change-log, rule, loop-design}` |
| `meta_state_log_change` MCP tool (`meta-state-log-change-tool.js:16-31`) | Schema built via `metaStateChangeEntrySchema.pick(MIGRATED_FIELDS).shape`; `MIGRATED_FIELDS` does NOT include `operation_envelope`; default strip-on-unknown drops the field silently | `MIGRATED_FIELDS` includes `operation_envelope`; `.strict()` added so unknown fields are rejected (not silently stripped). Without these, RED test (a) cannot go RED — the field never reaches the registry |
| Batch caller | `meta_state_batch` accepts write/update/delete/archive ops; no envelope pass-through | New optional top-level `envelope` field on the batch request (parallel to `operations`); when present, `metaStateBatch` constructs + auto-emits a change-log entry alongside the batch with the envelope populated |
| Batch handler (`metaStateBatch`, meta-state.js:747-845) | Returns `{applied, failed_at, reason}` | Same return; auto-emit appends the envelope to in-memory `entries` BEFORE the file rewrite, then post-rename verifies persistence via `assertWriteVisible`. On silent-persistence-fail (the class closed by `meta_state_log_change` in PR #50), rollback the entire batch AND envelope, return `change_log_not_visible` |
| Patch deny-list (`IMMUTABLE_PATCH_FIELDS`, meta-state.js:300-312) | `entry_kind, status` (Phase 2 stopgap just landed) | + `operation_envelope` — same defense principle, closed until Implementation 3 |
| Write-path deny-list (meta-state.js:773-777, `case "write"`) | `write` op does not consult deny-list; passes any change-log body through | + reject change-log entries with `operation_envelope` (envelope is auto-emit ONLY; caller-supplied envelopes on `write` ops are a forge vector) |
| Helper module | none | New `core/operation-envelope.js` — owns envelope construction, validation, `content_hash` hashing, pre/post counting. Used by `metaStateBatch` to emit and by future tests/callers to assert |
| `BATCH_SIZE_LIMIT` | handler `meta-state-batch-tool.js:7` defaults 500; core `meta-state.js:741` defaults 100 (overridable via env) | Centralize in `core/constants.js`; both files import (single source of truth — eliminates the 250-op caller-vs-100-core reject window) |
| Post-migration tests | Count brittle entry ids (`>= 22` / `>= 229`) | Assert envelope fields directly with **exact equality** from fixture-computed counts (NOT loose `≥ N` bounds — those re-create the brittleness). The lifecycle-migration-finalize.test.js assertions were already removed per `meta-state.jsonl:271`; this plan adds a NEW forward-looking assertion, not a rewrite |

### Architectural decisions

| Decision | Choice | Rationale |
|---|---|---|
| Field placement | Top-level `operation_envelope` on change-log | Report § UQ3 (decision A); keeps `change_diff` as the per-entry detail and envelope as the batch-level magnitude. Top-level = discoverable + reusable across all 8 kinds |
| Kind enum | `migration \| sweep \| closeout \| consolidation \| backfill \| archive-wave \| escalation-batch \| manual-batch` | Report § UQ3; covers all observed batch-mutation shapes + extensibility |
| Pre/post count granularity | `{total, by_status, by_kind}` | Report § UQ3 (decision C); enables test assertions at multiple layers (e.g., "3 stale findings closed" + "0 loop-designs touched") |
| Field name | `content_hash` (NOT `idempotency`) | Red-team finding C4: the field is a content-hash of op-list + entry-id-set + kind + target; it proves "same input → same hash", NOT "this batch was not already applied". Renaming disambiguates; helper description documents the threat model |
| Hash input | SHA-256 of `kind + target + canonicalize(ops) + ":" + preIds.join(",") + ":" + postIds.join(",")` | Includes kind and target (red-team C6 fix) so a `migration` and a `manual-batch` with identical ops + registry state produce distinct hashes |
| Canonical enum keys | `by_status: {open, resolved, superseded, archived}`; `by_kind: {finding, change-log, rule, loop-design}` | Constrained Zod records (`z.record(z.enum([...]), z.number())`), not open dicts (`z.record(z.string(), z.number())`) — fixes legacy `active\|reported\|stale` drift (red-team H1) and on-read validation risk (red-team M2). `buildEnvelope` normalizes legacy statuses to `open` at boundary |
| Helper location | New `core/operation-envelope.js` | Separation of concerns: envelope construction is reusable, batch handler stays a thin orchestrator. Same pattern as the recommended `core/operation-invariant.js` for Implementation 3 |
| Auto-emit trigger | `meta_state_batch` only (not individual write/update calls) | The envelope's value is batch-magnitude; single-entry ops don't need it. Future single-op callers can still log a change-log with `operation_envelope` manually if useful |
| Auto-emit ID rule | `meta-{ISO timestamp}-{6 random hex chars}` + duplicate-id guard before append | Red-team C8: deterministic slug (`slugify(target)`) collides when two batches share a target; timestamp + random suffix gives uniqueness + sub-second sortability |
| Auto-emit ordering | Build envelope → append to in-memory `entries` → `writeFileSync(tmpPath)` → `renameSync` → `invalidateCache` → `assertWriteVisible` (re-read + assert presence) → on failure roll back | Red-team C1: same `assertWriteVisible` pattern as `meta-state-log-change-tool.js:67-88` closes the silent-persistence-fail class. Mirrors PR #50 fix shape |
| Change-log filed BEFORE or AFTER batch? | AFTER (operator-confirmed ordering, same as Implementation 1) | Eliminates audit/reality divergence window: change-log records what actually happened, never a change that didn't land |
| `IMMUTABLE_PATCH_FIELDS` extension | Add `operation_envelope` post-repair of any existing entries; closes `meta_state_batch.update` path | Same pattern as Phase 2 stopgap (`entry_kind + status` added after the Phase 1 repair). Red-team C6: ALSO add a `case "write"` reject — caller-supplied envelopes on writes are a forge vector |
| Kind × op-type compatibility | `buildEnvelope` validates `kind` against ops via `KIND_OP_COMPATIBILITY`: `sweep` requires ≥1 delete; `consolidation` requires ≥1 update; `migration` allows write+update mix; others permissive | Red-team C9: audit-trail forgery via mislabeled batches. Test (e2) RED: `kind:"sweep"` with 0 deletes is rejected with `kind_op_incompatible` |
| `target` validation | Use `core/path-containment.js` + Zod `.regex()` rejecting control chars + `..` segments + length cap (200 chars) | Red-team C5: free-form `target` is a path-injection + control-char attack surface; the loop's existing path-containment helper should be reused |
| `BATCH_SIZE_LIMIT` source | Move to `core/constants.js`; import on both sides | Red-team H2: handler=500 vs core=100 default divergence |
| RED test design | Wrap `callTool` in try/catch for SyntaxError; assert registry state as primary check | Implementation 1 pattern; reinforced by red-team M1 noting the log-change tool's `.strict()` status (now upgraded — fixes C2) |
| Finding closure | `meta-260711T0144Z` resolves after this plan lands | The structural gap (no envelope field) is closed; tests can assert via envelope fields |

## Phases

| Phase | Name | Status | TDD Color | Dependencies |
|-------|------|--------|-----------|--------------|
| 1 | [RED tests + GREEN envelope helper](./phase-01-phase-01-red-tests-and-green-envelope-helper.md) | Completed | RED (4 tests) → GREEN + schema field | — |
| 2 | [Batch integration + IMMUTABLE_PATCH_FIELDS extension + closeout](./phase-02-phase-02-batch-integration-and-stopgap-extension.md) | Completed | GREEN integration + stopgap + regression + change-logs | Phase 1 |

**Total effort estimate:** ~2h (RED tests ~0.5h, GREEN envelope helper + schema ~0.25h, batch integration + stopgap ~0.5h, regression + change-logs + journal ~0.75h).

## Dependencies

### Outgoing

- **`260712-NNNN-assertinvariant-universal-primitive`** (Implementation 3, planned) — `blocks` → this plan's `IMMUTABLE_PATCH_FIELDS` extension is replaced wholesale by the universal `assertinvariant` wrapper.

### Incoming

- **`260712-0109-meta-state-patch-entry-kind-invariant`** (Implementation 1, SHIPPED via PR #51) — established the deny-list extension pattern + change-log ordering + repair mechanism. Same shape, same defense principle.

### Out of scope (deferred — Implementation 3, universal `assertinvariant` wrapper)

- Replacing the Phase 2 `IMMUTABLE_PATCH_FIELDS` stopgap (now including `operation_envelope`) with before/after comparison at both `updateEntry` and the batch path.
- Promoting `rule-assertinvariant-at-boundary`.
- Resolving finding `meta-260712T0053Z` (Implementation 1 finding; closes with Implementation 3).
- Flipping `loop-design-assertinvariant-core-logic-invariant-wrapper` to `inactive` via supersede.

## Acceptance Criteria

- [ ] `metaStateChangeEntrySchema` accepts an optional top-level `operation_envelope` field with the locked shape (Phase 1 GREEN)
- [ ] Invalid envelope shape (e.g., missing `kind`, or unknown kind value) is rejected by Zod (Phase 1 RED — callTool throws SyntaxError; assert registry state)
- [ ] `core/operation-envelope.js` exports `buildEnvelope({ops, preRegistry, postRegistry})` that returns the locked shape with correct `pre_count`, `post_count`, `content_hash` (Phase 1 RED — pure-function test)
- [ ] Idempotency hash is stable across re-runs of the same ops on the same registry snapshot (Phase 1 RED — pure-function test)
- [ ] `meta_state_batch` accepts a top-level `envelope` field in the request (parallel to `operations`); when present, an envelope-annotated change-log is auto-emitted AFTER the batch lands (Phase 2 GREEN)
- [ ] The auto-emitted change-log has `operation_envelope.kind === caller.kind`, `target` reflects the envelope target, `pre_count`/`post_count` reflect the registry before/after the batch (Phase 2 RED — registry-state check)
- [ ] `operation_envelope` is in `IMMUTABLE_PATCH_FIELDS` after Phase 2 (batch hole stopgap; no legitimate caller sets it via patch — envelope construction is auto-emit)
- [ ] NEW forward-looking RED test in `change-log-operation-envelope.test.js` asserts exact pre/post counts against a deterministic fixture (red-team finding 7 fix; the legacy `lifecycle-migration-finalize.test.js` brittle assertions were already removed per `meta-state.jsonl:271` — no rewrite of that file)
- [ ] Each logical change backed by a `meta_state_log_change` filed AFTER the edit lands (2-3 total: schema field, helper module, batch integration + deny-list extension — edit-first, change-log-after, same operator-confirmed ordering as Implementation 1)
- [ ] Existing test suite passes; `pnpm gate:self-verify` passes
- [ ] Finding `meta-260711T0144Z` resolves with `meta_state_resolve` + resolution note citing the change-log entry

## Files Modified Summary

### Create

- `tools/learning-loop-mastra/core/operation-envelope.js` (Phase 1 GREEN — `buildEnvelope`, `validateEnvelope`, kind enum export)
- `tools/learning-loop-mastra/core/operation-envelope.test.js` (Phase 1 RED — pure-function tests for build/validate/content_hash)
- `tools/learning-loop-mastra/__tests__/legacy-mcp/change-log-operation-envelope.test.js` (Phase 1 RED — schema-layer tests via `withMcpServer`/`callTool` + Phase 2 RED — batch-integration tests)

### Modify

- `tools/learning-loop-mastra/core/meta-state.js`:
  - Phase 1: extend `metaStateChangeEntrySchema` (lines 148-189) with optional top-level `operation_envelope`
  - Phase 2: extend `IMMUTABLE_PATCH_FIELDS` (lines 300-312) with `operation_envelope`; wire `metaStateBatch` (lines 747-845) to accept + auto-emit envelope-annotated change-log
- `tools/learning-loop-mastra/tools/handlers/meta-state-batch-tool.js`:
  - Phase 2: extend `schema` (lines 34-42) with optional top-level `envelope` field parallel to `operations`; pass through to `metaStateBatch`
- `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-batch-tool.test.js`:
  - Phase 2: add envelope-emit tests

### Mutated via MCP (no source-file edit)

- `meta-state.jsonl`:
  - Phase 2: 1-3 `meta_state_log_change` entries backing the code changes (schema field, helper module, batch integration + deny-list extension)
  - Phase 2: `meta_state_resolve` on `meta-260711T0144Z` with resolution note citing the change-log entry

## Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Existing change-log entries in registry lack `operation_envelope` field | Low | Field is **optional**; pre-existing entries are valid without it. Backfill NOT required (pre-fix data has no envelope). |
| Idempotency hash collisions across legitimate re-runs | Low | SHA-256 of canonical op-list + entry-id-set is collision-resistant at this scale (millions of ops would need to collide). Documented in `core/operation-envelope.js` JSDoc. |
| `meta_state_batch` envelope pass-through changes the wire format | Medium | Top-level field is **optional**; existing callers without `envelope` get the same behavior as today. Recursive envelope stripper already handles arbitrary envelopes, no new coercion path. |
| `IMMUTABLE_PATCH_FIELDS` extension blocks a future legitimate envelope set via patch | Low | No legitimate caller sets `operation_envelope` via patch — envelope construction is auto-emit from `meta_state_batch`. Implementation 3 replaces the deny-list with a comparison wrapper, eliminating the constraint. |
| Concurrent pre-fix session overwrites the schema field with stale code | Medium | Same as Implementation 1: pull this fix to all concurrent sessions before merging; the schema field is additive (optional), so a pre-fix session simply doesn't see it. |
| Test (b) `callTool` throws `SyntaxError` from `JSON.parse` on non-JSON MCP validation error | High | Phase 1 test (b) wraps `callTool` in try/catch and asserts the **registry state** as the primary check, not `callTool` return value (same pattern as Implementation 1). |
| NEW forward-looking test breaks unrelated tests | Medium | Phase 2 RED captures the deterministic fixture, GREEN asserts exact `deepEqual` on pre/post counts; if the test fails, investigate as either a real bug or a test-shape mismatch. Document the fixture in the test file's header comment. The legacy `lifecycle-migration-finalize.test.js` is unchanged. |

## Open Questions

None at plan-creation time. Decisions settled by operator + red-team:

1. **Field placement** — top-level `operation_envelope` (report § UQ3 decision A).
2. **Kind enum** — 8 kinds (report § UQ3).
3. **Pre/post count granularity** — `{total, by_status, by_kind}` (report § UQ3 decision C).
4. **Helper location** — new `core/operation-envelope.js` (separation of concerns, same pattern as planned `core/operation-invariant.js` for Implementation 3).
5. **Auto-emit trigger** — `meta_state_batch` only (single-entry ops don't need a magnitude envelope).
6. **`IMMUTABLE_PATCH_FIELDS` extension** — include `operation_envelope` (operator direction this session; same defense principle as Phase 2 stopgap).
7. **Change-log timing** — edit-first, change-log-after (operator-confirmed, same as Implementation 1).
8. **Field name** — `content_hash` (red-team C4 — disambiguates from idempotency-as-detection semantics).
9. **Hash input** — includes `kind` + `target` (red-team C6 fix).
10. **Canonical enum keys** — closed enum (red-team H1, M2 fix; not open dicts).
11. **Auto-emit ID rule** — `meta-{ISO timestamp}-{6 random hex}` (red-team C8).
12. **Auto-emit ordering** — build → append → writeFileSync → renameSync → invalidateCache → assertWriteVisible (red-team C1 fix).
13. **`target` validation** — path-containment + control-char reject + length cap (red-team C5).
14. **Kind × op compatibility** — `KIND_OP_COMPATIBILITY` map enforced at `buildEnvelope` (red-team C9).
15. **BATCH_SIZE_LIMIT** — centralize in `core/constants.js` (red-team H2).
16. **Write-path envelope reject** — `case "write"` rejects change-log entries with caller-supplied `operation_envelope` (red-team C6 fix).
17. **MIGRATED_FIELDS + log-change `.strict()`** — required Phase 1 prerequisite (red-team C2).
18. **Test rewrite** — replaced with NEW forward-looking assertion (red-team C3; lifecycle-migration-finalize.test.js brittle assertions already removed per `meta-state.jsonl:271`).

## Red Team Review

### Session — 2026-07-12
**Reviewers:** Security Adversary + Assumption Destroyer (2 reviewers, Light tier — 2-phase plan)
**Findings:** 13 (3 Critical, 6 High, 4 Medium)
**Findings accepted:** 13 | **Findings rejected:** 0

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Auto-emit ordering — `writeFileSync`/`renameSync` failure modes + missing `assertWriteVisible` post-write check (silent-persistence-fail class) | Critical | Accept | Plan § Architectural Decisions (auto-emit ordering); Phase 2 Architecture + Implementation Step 9 |
| 2 | `MIGRATED_FIELDS` in `meta-state-log-change-tool.js:16-26` does NOT include `operation_envelope` — RED tests never go RED through the MCP layer (Zod strip-on-unknown drops the field) | Critical | Accept | Plan § Architectural Decisions (row "meta_state_log_change MCP tool"); Phase 1 Implementation Step 0 (new prerequisite) |
| 3 | "Legacy test rewrite" target file `meta-260711T0144Z-...test.js` does NOT exist — actual file is `lifecycle-migration-finalize.test.js` and brittle assertions were already removed per `meta-state.jsonl:271` | Critical | Accept | Plan § Architectural Decisions (row "Post-migration tests"); Phase 2 Implementation Step 11 replaced with new forward-looking assertion |
| 4 | `idempotency` hash is a content-hash, not an idempotency detector — naming is semantically false | High | Accept | Plan § Architectural Decisions (Field name + Hash input); Phase 1 Architecture + Step 6 RED test (d) |
| 5 | `envelope.target` accepts free-form string with no path/control-char validation — path traversal / shell injection surface in audit trail | High | Accept | Plan § Architectural Decisions (`target` validation); Phase 2 Architecture + new RED test |
| 6 | `IMMUTABLE_PATCH_FIELDS` write-vs-update gap — `case "write"` at meta-state.js:773-777 does NOT consult deny-list; caller-supplied envelopes on `write` ops are a forge vector | High | Accept | Plan § Architectural Decisions (Write-path deny-list + IMMUTABLE_PATCH_FIELDS extension); Phase 2 Implementation Step 10 |
| 7 | Loose `pre_count.total ≥ N` test rewrite re-creates the brittleness the plan's source finding called out — defeats the stated structural-invariant goal | High | Accept | Plan § Architectural Decisions (Post-migration tests); Phase 2 test (h) → exact fixture-based equality |
| 8 | Auto-emit change-log ID generation is unspecified — deterministic slug collides when two batches share a target; duplicate-id silently overwrites | High | Accept | Plan § Architectural Decisions (Auto-emit ID rule); Phase 2 Implementation Step 9 (duplicate-id guard + random suffix) |
| 9 | Kind × op-type mapping is unenforced — caller can label routine batch as `escalation-batch` to forge audit semantics; `manual-batch` looks like operator action | High | Accept (scope-modified) | Plan § Architectural Decisions (Kind × op compatibility); Phase 2 RED test (e2) + `KIND_OP_COMPATIBILITY` in `core/operation-envelope.js` |
| 10 | `pre_count.by_status` keys drift between loop-design description (`active\|reported\|stale`) and current collapsed schema (`open\|resolved\|superseded`) — open `z.record()` accepts any key, breaking test assertions on legacy registry data | High | Accept | Plan § Architectural Decisions (Canonical enum keys); Phase 1 Architecture + Step 5 RED test (c) |
| 11 | `BATCH_SIZE_LIMIT` divergence — handler defaults 500, core defaults 100; calls between 100-500 get misleading `applied:0` without explanation | Medium | Accept | Plan § Architectural Decisions (BATCH_SIZE_LIMIT); Phase 2 new file `core/constants.js` |
| 12 | RED test (b) expects `callTool` to throw SyntaxError on unknown envelope kind, but `meta_state_log_change` picked schema is not `.strict()` — callTool succeeds with stripped field, test fails on wrong assertion | Medium | Accept | Plan § Architectural Decisions (MIGRATED_FIELDS + log-change `.strict()`); Phase 1 RED test (b) design updated |
| 13 | `by_status` / `by_kind` open `z.record()` captures arbitrary keys — auto-emit with legacy keys may fail on registry-read `metaStateEntrySchema` union validation | Medium | Accept | Merged with finding 10 (same canonical-enum fix closes both) |

### Whole-Plan Consistency Sweep

- Files reread: `plan.md`, `phase-01-phase-01-red-tests-and-green-envelope-helper.md`, `phase-02-phase-02-batch-integration-and-stopgap-extension.md`
- Decision deltas checked: 18 (settled in Open Questions + Architectural Decisions)
- Reconciled stale references:
  - `idempotency` → `content_hash` — search all plan files, applied uniformly
  - `envelope.target` validation — added in Plan § Architectural Decisions + Phase 2 Architecture
  - `by_status` open dict → canonical enum — Phase 1 Architecture + Phase 1 Step 5 test
  - `IMMUTABLE_PATCH_FIELDS` location updated 300-308 → 300-312 (drift fixed)
  - `metaStateBatch` location updated 740-845 → 747-845 (drift fixed)
  - `case "write"` deny-list gap — added to Phase 2 Implementation Step 10
  - `MIGRATED_FIELDS` prerequisite — added to Phase 1 Implementation Step 0
  - Test rewrite target `meta-260711T0144Z-...test.js` → replaced with `lifecycle-migration-finalize.test.js` reference + new forward-looking assertion in `change-log-operation-envelope.test.js`
  - `BATCH_SIZE_LIMIT` source → `core/constants.js`
- Unresolved contradictions: 0 — all findings applied; the plan is internally consistent.

## Post-Plan Handoff

After both phases complete + Phase 2 regression passes, recommend `/ck:cook plans/260712-0300-change-log-operation-envelope/plan.md`. The plan is small and well-understood; the same `--tdd` shape as Implementation 1 worked. The next broader step is Implementation 3 (universal `assertinvariant` wrapper), tracked by `loop-design-assertinvariant-universal-scope` — a separate plan that depends on this plan (`blocks` in frontmatter).
