---
title: "Runtime-State Record Integrity"
description: "Fix three runtime-state record bugs (A+B+D) from the problem-solving report: (A) widen the row fingerprint to a true row-integrity hash + add read-side verifyRow + migrate the existing sidecar to v2 fingerprints; (B) consolidate the read tool's divergent readSidecar onto the shared readRuntimeStateRows + delete dead code; (D) reject nested-array metadata at the record handler + doc-only schema tightening, then resolve the open finding. TDD-structured; C (the sandbox hand-off plan-edit) is out of scope. Adjacent DRY-debt (inbound-state.js + file-readers.js own-parse copies) deferred to a separate pass (tracked in finding meta-260719T2201Z-...)."
status: pending
priority: P1
effort: "1-1.5d"
tags: [runtime-state, fingerprint, integrity, read-path, dry, metadata, validation, tdd]
created: 2026-07-19
---

# Runtime-State Record Integrity

## Overview

`runtime-state.jsonl` is the mutable sidecar for runtime state (ledger events + budget states). A problem-solving report (`plans/reports/problem-solving-260719-2029-runtime-state-records-sandbox-handoff.md`) diagnosed three bugs in its record/read substrate. This plan fixes **A + B + D**. Bug **C** (same-id "correction" rows don't supersede + the sandbox hand-off is unwired) is a plan-edit to `plans/260719-1428-central-skills-management/` Phase 3 and is **out of scope** here.

Findings (opened 2026-07-19):
- **A** — `meta-260719T2144Z-runtime-state-row-fingerprint-omits-affected-system-kind-and` (open) — fingerprint omits `affected_system|kind|metadata`; collides in prod (rows 9/10 share `sha256:93725b69…`; rows 8/11 share `sha256:79249677…`); no read-side verify.
- **B** — `meta-260719T2145Z-runtime-state-read-diverges-from-the-shared-read-path-runtim` (open) — read tool's `readSidecar` throws on a malformed line where the shared `readRuntimeStateRows` tolerates; dead `computeFingerprint` + unused imports.
- **D** — `meta-260719T1858Z-runtime-state-record-s-metadata-param-z-record-z-unknown-acc` (open) — `metadata: z.record(z.unknown())` accepts nested arrays; a corrupt npx-roundtrip row has 7-deep nested arrays. Resolved by this plan.

**Mode:** `--deep --tdd`. Two researchers independently verified the diagnosis, recomputed the prod collisions, and surfaced risks the report under-addressed (the v2-fingerprint migration invalidating all 24 existing stored fingerprints; a third v1-formula copy in `scripts/convert-ledger-to-sidecar.mjs`; two further own-parse copies of the read path). Validation (4 design forks) ran before drafting; red-team ran after.

## Locked decisions (validation, 2026-07-19)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Hash migration | **Rewrite `runtime-state.jsonl`** — recompute all 24 stored fingerprints to v2 in a one-time idempotent migration script; `verifyRow` is v2-only (no version field) | Operator-locked. Simpler `verifyRow`; one tracked-file commit; no dual-formula code. Accepted trade-off: `metadata.supersedes_fingerprint` (row 24 → row 23) becomes a stale v1 reference — no JS reader, and C (out of scope) may retire the same-id correction mechanism anyway. |
| 2 | Corrupt dispatch row | **Fail-closed** — `verifyRow` fails on the existing dispatch row → refuse with `reason:"corrupt_dispatch_row"` + gate-log entry | Avoids binding a finding to ghost issue coords AND avoids creating a duplicate GitHub issue. Surfaces corruption for operator repair. |
| 3 | B scope | **Minimal (read tool only)** — adjacent DRY-debt (`inbound-state.js` fail-open-to-[], `file-readers.js` rows→observations projection) deferred | `inbound-state.js` swap changes inbound-gate behavior (fail-open-to-[] → skip-malformed); `file-readers.js` is a projection (moderate refactor). Too wide for an A+B+D fix plan per operator guidance ("widen B, or update the report and defer"). Deferred to next session, tracked in finding `meta-260719T2201Z-three-own-parse-copies-of-the-runtime-state-jsonl-read-path`. |
| 4 | D validation | **Zod `.refine` rejecting nested arrays at the handler + doc-only schema tightening** | The JSON schema has NO code consumer (schema-loader deleted in Phase A) — the Zod handler schema is the only enforcement point. Backward-compatible: only the corrupt row 23 uses arrays; all 23 legitimate rows pass. |

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | (A) The row fingerprint is a true row-integrity hash covering `affected_system\|kind\|id\|source_ref\|value\|delta\|timestamp\|metadata` (metadata canonicalized), with a read-side `verifyRow` wired into the read tool + dispatch idempotency scan | P1 |
| 2 | (A) All existing rows in `runtime-state.jsonl` carry v2 fingerprints (one-time migration); `verifyRow` returns true for every migrated row | P1 |
| 3 | (B) `runtime_state_read` uses the shared `readRuntimeStateRows`, tolerates malformed lines (no throw), and carries no dead code | P1 |
| 4 | (D) `runtime_state_record` rejects nested-array `metadata` at the handler; the schema documents the contract (doc-only); finding D resolved | P1 |
| 5 | No regression to existing read-tool / dispatch / record-tool tests; runtime-agnostic invariant preserved | P1 |

## Phases

| # | Phase | Status | Risk |
|---|-------|--------|------|
| 1 | [B: Read-path consolidation + dead-code removal](./phase-01-start.md) | Pending | Low (read tool only; tests use temp dirs; no consumer depends on throw-on-malformed) |
| 2 | [A: Fingerprint v2 + verifyRow + migration](./phase-02-a-fingerprint-v2-verifyrow-migration.md) | Pending | Medium (load-bearing hash change; tracked-file migration; dispatch fail-closed behavior change) |
| 3 | [D: Metadata nested-array rejection + finding resolution](./phase-03-d-metadata-nested-array-rejection-finding-resolution.md) | Pending | Low (Zod refine; backward-compatible; resolves open finding) |

**Implementation order: B → A → D.** B first cleans the read tool (deletes the dead `computeFingerprint` copy + swaps to the shared read path); A then widens the hash + wires `verifyRow` onto the cleaned read tool + dispatch + migrates the sidecar; D adds the metadata refine. The report folds the dead-copy deletion into B, so A's read-tool wiring lands on a clean file. A and D are file-independent; D is logically last because A makes corruption hash-visible (the `verifyRow` flag is meaningful only after the v2 migration).

## Dependencies

- **Source diagnosis:** `plans/reports/problem-solving-260719-2029-runtime-state-records-sandbox-handoff.md` (bugs A/B/C/D; this plan implements A+B+D).
- **Related, non-blocking:** `plans/260719-1428-central-skills-management/` (in-progress) — its Phase 3 Q4 ledger-event mechanism (`runtime-state.jsonl` ledger rows for the npx round-trip) is the substrate A+B+D harden. Bug **C** (dropping that hand-off / the same-id correction) is a plan-edit to 260719-1428 and is out of scope here; A+B+D are valuable regardless of whether C keeps or drops the mechanism.
- **Completed predecessor:** `plans/260704-0301-stale-findings-dispatch-handle/` extracted `readRuntimeStateRows` + `appendLedgerEvent` to `core/runtime-state.js` but never migrated the read tool — Phase 1 (B) completes that leftover migration.
- **Deferred (this plan):** adjacent runtime-state read-path DRY-debt — `core/inbound-state.js:18-30` (fail-open-to-[]) + `core/file-readers.js:41-122` (rows→observations projection). Tracked in finding `meta-260719T2201Z-three-own-parse-copies-of-the-runtime-state-jsonl-read-path`; **operator decided to widen B — consolidate both into `readRuntimeStateRows` in a follow-up plan after 260719-2201 ships** (kept out of this plan so the inbound-gate behavior change + the file-readers projection get their own tests).

## Findings resolved / opened by this plan

| Bug | meta-state action | Finding id | Evidence |
|-----|-------------------|-----------|----------|
| A | resolve (after Phase 2) | `meta-260719T2144Z-runtime-state-row-fingerprint-omits-affected-system-kind-and` | `core/runtime-state.js:59`; `runtime-state.jsonl` rows 8-11 collisions |
| B | resolve (after Phase 1) | `meta-260719T2145Z-runtime-state-read-diverges-from-the-shared-read-path-runtim` | `runtime-state-read-tool.js:9-22`; `core/runtime-state.js:27-38` |
| D | resolve (after Phase 3) | `meta-260719T1858Z-runtime-state-record-s-metadata-param-z-unknown-acc` | `runtime-state-record-tool.js:36` |
| (deferred) | opened | `meta-260719T2201Z-three-own-parse-copies-of-the-runtime-state-jsonl-read-path` | `core/inbound-state.js:18`; `core/file-readers.js:41` |

Resolve each finding via `meta_state_resolve` with a resolution note citing the code change; log the system change via `meta_state_log_change` (`change_target`: this plan path). For A, the resolution note must record: legacy `metadata.supersedes_fingerprint` values are v1-formula and not comparable to v2 (audit note, no code reader).

## Success Criteria

- [ ] `computeFingerprint` (exported from `core/runtime-state.js`) hashes `affected_system|kind|id|source_ref|value|delta|timestamp|metadata` with metadata canonicalized (recursive sorted keys; arrays preserve order); two rows differing only in `metadata` produce distinct fingerprints (regression test uses prod rows 9/10).
- [ ] `verifyRow(row) → bool` (v2-only) exported from `core/runtime-state.js`; round-trip via `appendLedgerEvent` verifies true; a tampered row verifies false; null/non-string → false.
- [ ] `runtime_state_read` adds `fingerprint_valid` to each returned row (compact + full); a freshly-written row reports true, a tampered row false.
- [ ] `meta_state_dispatch_finding` (prepare + commit) calls `verifyRow` on the existing dispatch row; on failure refuses with `reason:"corrupt_dispatch_row"` + a gate-log entry (fail-closed).
- [ ] `runtime-state.jsonl` migrated: every row's `fingerprint` recomputed to v2 via the one-time idempotent migration script; `verifyRow` returns true for all rows post-migration; the script is kept for reproducibility.
- [ ] `runtime_state_read` uses `readRuntimeStateRows` (no `readSidecar`); one malformed line is skipped (no throw), `total`/`count` reflect only valid rows; dead `computeFingerprint` + unused imports removed.
- [ ] `runtime_state_record` rejects nested-array `metadata` via Zod `.refine` (the corrupt row 23's shape is rejected; all 23 legitimate stored rows pass); `schemas/runtime-state.schema.json` documents the contract (doc-only).
- [ ] Findings A, B, D resolved via `meta_state_resolve`; system change logged via `meta_state_log_change`.
- [ ] `pnpm test:iter` green; `pnpm exec vitest --changed` green; runtime-agnostic check passes (`check_runtime_agnostic`); no new artifact types; PR body enumerates registry deltas (rule-pr-body-registry-deltas).

## Out of scope (deferred)

- **Bug C** — same-id "correction" rows don't supersede + the sandbox hand-off is unwired. A plan-edit to `plans/260719-1428-central-skills-management/` Phase 3 (drop the Q4 ledger-event hand-off, gate on the F6 hash test). Separate concern; not touched here.
- **Adjacent read-path DRY-debt** — `core/inbound-state.js` + `core/file-readers.js` own-parse copies. Tracked in `meta-260719T2201Z-...`; **B-widening decided as a follow-up plan after 260719-2201** (behavior-change tests required for the inbound-gate swap + the file-readers projection).
- **`scripts/convert-ledger-to-sidecar.mjs:24`** — a third (historical, idempotent, untested) copy of the v1 fingerprint formula. Left as-is with a one-line comment noting it is the legacy v1 shape; not consolidated (rewriting history's fingerprints is out of scope).

## Red Team Review

### Session — 2026-07-20
**Method:** inline 3-lens adversarial review (Security Adversary / Failure Mode Analyst / Assumption Destroyer) after the planned 3-subagent red-team hit a provider rate limit. All load-bearing evidence claims were re-verified directly against the code/data.

**Evidence re-verified (all VERIFIED):**
- Prod collisions: rows 9/10 share `sha256:93725b69…` and rows 8/11 share `sha256:79249677…` under the current 5-field formula (recomputed via `node -e`); the proposed 8-field canonicalized formula produces distinct fingerprints (row9 `e7866a40…` vs row10 `84b8e08f…`; row8 `8a27c9a2…` vs row11 `34fc78f5…`). Metadata key-reorder stability confirmed.
- 24 rows in `runtime-state.jsonl`; only row 23 has nested arrays in metadata (refine backward-compatible). No stored row has `fingerprint:null`.
- `schemas/runtime-state.schema.json` has NO code consumer — only `schema-deletion-coverage.test.js` asserts existence (not validation).
- `supersedes_fingerprint` has zero JS readers. Read-tool `computeFingerprint` (L9) is dead (zero usages).
- The dispatch test file `meta-state-dispatch-finding-tool.test.js` EXISTS (the "if present" hedge was unnecessary).
- The tool manifest carries no inline descriptions for `runtime_state_read`/`runtime_state_record` (no manifest update needed).
- The deferred DRY-debt finding `meta-260719T2201Z-...` is filed (open, `mechanism_check` on).
- Third v1-formula copy confirmed at `scripts/convert-ledger-to-sidecar.mjs` (left as-is + comment).

**Findings (0 Critical, 1 High, 2 Medium, 5 Low):**

| # | Finding | Severity | Disposition | Applied to |
|---|---------|----------|-------------|------------|
| H1 | Phase 2 has a sequencing window: if `verifyRow` wiring ships before the sidecar is migrated, every read returns `fingerprint_valid:false` and the dispatch guard refuses on every existing dispatch row | High | Accept — strengthen to MANDATORY one-atomic-commit | Phase 2 Risk Assessment + Architecture |
| M1 | Migration script read-then-write is not concurrency-safe (a concurrent `runtime_state_record` append during the window is lost) nor crash-safe (mid-write leaves a mixed-state file) | Medium | Accept — atomic temp+rename + "run when quiescent" requirement | Phase 2 Architecture (migration bullet) |
| M2 | Migration RUN (one-time operator step, committed result) vs migration idempotency TEST (temp fixture) were conflated; CI must not mutate the real tracked file | Medium | Accept — clarify RUN vs TEST | Phase 2 Architecture (migration bullet) |
| L1 | Read-tool L24-26 doc-comment + L34 `description` promise "verify row integrity by default" but don't name `fingerprint_valid` | Low | Accept — update both to name `fingerprint_valid` | Phase 2 step 5 |
| L2 | Phase 2 hedged "if present" for the dispatch test file — it EXISTS | Low | Accept — remove hedge | Phase 2 Related Code Files |
| L3 | Recursive sorted-key `canonicalize` is defensive, not strictly needed (single-writer-per-row + stable read-back order; no code reads `supersedes_fingerprint`) | Low | Keep as cheap insurance for a load-bearing hash (5 lines + test) | Phase 2 (no change) |
| L4 | D refine is structural (rejects array-in-array), not content-sanitizing — flat arrays of arbitrary strings still pass | Low | Accept — note in Phase 3 (string-content is the caller's responsibility; out of scope for D) | Phase 3 Architecture |
| L5 | Phase 2 `dependencies: ["1"]` (B→A) is a clean-ordering preference, not a hard technical block (A doesn't touch `readSidecar`) | Low | Keep the ordering | Phase 2 (no change) |

**Key risks addressed:**
- **Atomicity (H1):** Phase 2 now mandates one atomic commit (hash + `verifyRow` + dispatch guard + migration script + migrated `runtime-state.jsonl`); no window where `verifyRow` is live against a v1 sidecar.
- **Migration safety (M1/M2):** temp+rename (crash-safe) + run-when-quiescent (append-safe) + clear separation of the one-time operator RUN from the temp-fixture idempotency TEST.
- **No scope creep:** the dispatch fail-closed guard is fingerprint-INTEGRITY (orthogonal to C's same-id supersession issue); the migration is the mechanism for the operator-locked "rewrite" decision (not gold-plating); the doc-only schema tightening is spec honesty (2 lines).

### Whole-Plan Consistency Sweep
- **Files reread:** plan.md, phase-01-start.md, phase-02-a-fingerprint-v2-verifyrow-migration.md, phase-03-d-metadata-nested-array-rejection-finding-resolution.md (after applying the red-team deltas below).
- **Decision deltas checked:** (a) atomic-commit mandate (H1) — swept Phase 2 Risk Assessment + Architecture migration bullet for a consistent "one commit" framing. (b) migration concurrency/temp+rename (M1) + RUN-vs-TEST (M2) — swept the migration bullet only (single location). (c) `fingerprint_valid` doc-comment (L1) — swept Phase 2 step 5. (d) dispatch-test hedge removed (L2) — swept Phase 2 Related Code Files. (e) D structural note (L4) — swept Phase 3 Architecture. No stale references to the pre-red-team wording remain.
- **Reconciled stale references:** 0.
- **Unresolved contradictions:** 0.

## Validation Log

### Session 1 — 2026-07-19
**Trigger:** `--deep` validation (critical-questions interview). Four design forks surfaced by the two researchers were resolved via an operator interview (AskUserQuestion) before drafting. Decisions are locked in the "Locked decisions" table above. No phase rewrites required — the phases are written against the locked decisions.

<!-- slug: runtime-state-record-integrity -->
