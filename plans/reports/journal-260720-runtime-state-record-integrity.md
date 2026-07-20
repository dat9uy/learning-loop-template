---
title: "Runtime-State Record Integrity — A+B+D ship"
date: 2026-07-20
plan: plans/260719-2201-runtime-state-record-integrity
status: shipped
---

# Runtime-State Record Integrity — A+B+D ship

Session outcome: implemented all three phases of `plans/260719-2201-runtime-state-record-integrity` in
TDD order (B → A → D). Bug C (the sandbox hand-off / same-id correction) was explicitly out of scope
per the plan and remains in `plans/260719-1428-central-skills-management/`.

## What shipped

- **B — read-path consolidation.** `runtime_state_read` migrated from its divergent `readSidecar`
  (throws on `JSON.parse`) onto the shared `readRuntimeStateRows` (skips malformed lines). Dead
  `computeFingerprint` + unused `appendFileSync`/`createHash`/`join`/`SIDECAR_FILENAME` removed.
  Malformed-line regression test added (8/8 read-tool tests green pre-Phase-2; 10/10 post-Phase-2).
- **A — fingerprint v2 + verifyRow + migration.** `computeFingerprint` widened from v1 5-field
  to v2 8-field canonicalized row-integrity hash (`affected_system|kind|id|source_ref|value|delta
  |timestamp|metadata`, metadata canonicalized via recursive sorted keys; arrays preserve order).
  `verifyRow` (v2-only) exported. Wired into `runtime_state_read` (per-row `fingerprint_valid`)
  and `meta_state_dispatch_finding` (fail-closed `corrupt_dispatch_row` refusal in both prepare +
  commit stages — refuses to bind to ghost coords AND refuses to create a duplicate issue on a
  tampered row). Migration script `scripts/migrate-runtime-state-fingerprints.mjs` runs idempotently:
  24/24 rows verify post-migration; re-run prints "already migrated (v2); no-op" (no file change).
- **D — metadata nested-array rejection.** `runtime_state_record`'s `metadata` Zod schema rejects
  nested arrays via `.refine(hasNestedArray)` — the corruption class from the npx-roundtrip row
  (7-deep nested arrays containing a stray `</item>` artifact) is rejected at write time. All 24
  stored rows except the corrupt row 23 pass (row 23's row-24 correction already carries the
  corrected shape; the refine is write-time only — already-stored corrupt data is not retroactively
  rejected).

## Findings resolved

| Bug | id | status |
|-----|-----|--------|
| B | `meta-260719T2145Z-runtime-state-read-diverges-from-the-shared-read-path-runtim` | resolved |
| A | `meta-260719T2144Z-runtime-state-row-fingerprint-omits-affected-system-kind-and` | resolved |
| D | `meta-260719T1858Z-runtime-state-record-s-metadata-param-z-record-z-unknown-acc` | resolved |

3 change-logs logged (one per phase); full registry delta enumerated in the PR body per
`rule-pr-body-registry-deltas`.

## Plan drift — deviations from locked decisions

- **`schemas/runtime-state.schema.json` doc-only tightening BLOCKED.** The `schemas/**` write gate
  has no override path for non-promoted glob rules (`gate_override` only accepts promoted
  rule_ids). The plan explicitly designated this as doc-only (no code consumer; schema-loader
  deleted in Phase A) — the Zod refine is the real enforcement, so the doc-only edit is purely
  spec-honesty with no enforcement semantics. The change is documented in the D-resolution note
  + change-log as "blocked but accepted — the real enforcement lives at the handler". No code
  regression. Operator action: surface this in the PR review if the doc-only tightening matters
  for spec-honesty, otherwise accept the skip as a one-line trade-off.
- **Path resolution in fingerprint test (cosmetic).** Initial test had `../../core/runtime-state.js`
  relative path — wrong (test is at `__tests__/`, not `__tests__/<sub>/`). Same with the migration
  script path — used a hard-coded relative path that fails when the test changes cwd. Resolved by
  resolving `REPO_ROOT` once via `import.meta.url`.

## Tests added

- `runtime-state-fingerprint.test.js` — 11 tests (prod rows 9/10 collision regression, metadata
  key-reorder stability, array-order preservation, sha256-prefix regex, verifyRow round-trip +
  tamper + null + non-string, migration idempotency no-op, v1→v2 re-fingerprint).
- `runtime-state-read-tool.test.js` — 3 added (fresh-row `fingerprint_valid:true` in full +
  compact mode, tampered-row `fingerprint_valid:false`).
- `meta-state-dispatch-finding-tool.test.js` — 1 added (`corrupt_dispatch_row` refusal on tamper).
- `runtime-state-metadata-validation.test.js` — 6 tests (nested-array rejection, scalar
  acceptance, flat-array acceptance, nested-object acceptance, depth-3 rejection, 24-row
  backward-compat with row 23 excluded as write-time-only).

Total: 21 new tests. 2285/457 suites pass post-Phase-3 (was 2264/451 suites pre-Phase-1).

## Risk audit

- Migration atomicity (red-team H1): upheld. Hash widening + `verifyRow` wiring (read tool +
  dispatch guard) + migration script + the migrated `runtime-state.jsonl` all landed together
  via `node scripts/migrate-runtime-state-fingerprints.mjs` after `verifyRow` was wired — no
  intermediate state where `verifyRow` was live against v1 rows.
- Migration safety (red-team M1/M2): temp+rename via `renameSync(tmp, SIDECAR)` (crash-safe);
  idempotency guard skips re-writes when all rows already verify (so CI smoke-runs are safe);
  the migration RUN was a one-time operator step (the committed `runtime-state.jsonl` is the
  result); CI never mutates the real tracked file (the idempotency test uses temp fixtures).
- `supersedes_fingerprint` (row 24 → row 23): now a stale v1 reference. No JS reader (confirmed
  by grep). If C (out of scope) keeps the same-id correction mechanism, it must re-derive
  `supersedes_fingerprint` under v2 or drop the field.

## What I'd do differently next time

- Run `meta_state_relationship_validate({description})` BEFORE writing the resolution note
  to surface orphan-id lint warnings earlier. The D resolution went through 1 round of
  `rule-no-orphaned-evidence` blocking due to fingerprint drift (legitimate — I changed the
  code, so the fingerprint SHOULD drift); the resolution is unblocked by
  `meta_state_refresh_file_index({path, reason})`. Document this consult-gate + fix path in
  the phase plan so future operators don't have to re-discover it.

## Registry deltas (per `rule-pr-body-registry-deltas`)

- **Resolved entries** (3, by id + resolution note):
  - `meta-260719T2145Z-runtime-state-read-diverges-from-the-shared-read-path-runtim` → see D-resolution note in PR.
  - `meta-260719T2144Z-runtime-state-row-fingerprint-omits-affected-system-kind-and` → see D-resolution note in PR.
  - `meta-260719T1858Z-runtime-state-record-s-metadata-param-z-record-z-unknown-acc` → see D-resolution note in PR.
- **New entries** (3, all change-logs):
  - `meta-260720T1040Z-tools-learning-loop-mastra-tools-handlers-runtime-state-read` (mechanical).
  - `meta-260720T1055Z-tools-learning-loop-mastra-core-runtime-state-js` (semantic).
  - `meta-260720T1059Z-tools-learning-loop-mastra-tools-handlers-runtime-state-reco` (surface).
- **No new findings, no promoted rules, no superseded/archived entries.**
