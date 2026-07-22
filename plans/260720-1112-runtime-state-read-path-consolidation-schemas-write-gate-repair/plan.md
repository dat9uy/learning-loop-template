---
title: "Runtime-state read-path consolidation + schemas write-gate repair"
description: "Resolve two open meta-state findings in one plan. (1) meta-260719T2201Z — B-widening: consolidate the remaining two own-parse copies of the runtime-state.jsonl read path (core/inbound-state.js readSidecar + core/file-readers.js readRuntimeObservations) onto the shared readRuntimeStateRows (core/runtime-state.js:27-38) introduced by plan 260719-2201. (2) meta-260720T1104Z — schemas/** write-gate drift: the gate reason references a non-existent `pnpm validate:records` script and the implied override path is broken for glob rules; repair via preflight-delegation (option 1, mirroring the skills rule) + reason text + doc sweep. TDD-structured; the two fixes are independent (distinct code + test surfaces) and ship as separate commits."
status: completed
priority: P2
effort: "1-1.5d"
tags: [runtime-state, dry, read-path, write-gate, schemas, preflight, gate-logic, tdd]
created: 2026-07-20
blockedBy: []
---

# Runtime-state read-path consolidation + schemas write-gate repair

## Overview

Two open meta-state findings are resolved by independent, TDD-structured fixes that ship as separate
commits in one plan:

- **Finding 1 — `meta-260719T2201Z-three-own-parse-copies-of-the-runtime-state-jsonl-read-path`**
  (`loop-anti-pattern`, subtype `duplicated-runtime-state-read-path`, `affected_system:runtime-state`).
  Plan 260719-2201 (now **completed**, commit `4074432`) consolidated only the read-tool copy of the
  `runtime-state.jsonl` read path onto the shared `readRuntimeStateRows` (`core/runtime-state.js:27-38`).
  Two own-parse copies remain and are consolidated here (the explicitly-deferred B-widening):
  1. `core/inbound-state.js:18-30` `readSidecar` — wraps the whole read in one `try/catch` and
     **fail-opens to `[]`** on a single malformed line → silent total valid-row loss.
  2. `core/file-readers.js:41-122` `readRuntimeObservations` — own per-line `JSON.parse`
     (`try/catch continue`) then projects rows into observation objects. A latent crash: a `null`
     line (`JSON.parse("null") → null`) escapes the inner try and trips the outer catch → `[]`.

- **Finding 2 — `meta-260720T1104Z-the-schemas-write-gate-at-tools-learning-loop-mastra-core-bo`**
  (`gate-logic-bug`, `affected_system:meta-state-tools`). The `schemas/**` write-gate reason
  (`core/bound-artifacts.js:80`) references `pnpm validate:records`, a script **not defined** in
  `package.json` (verified: `grep '"validate:records"' package.json` → 0 matches). The implied
  override path is also broken: `gate_override` requires a *promoted* rule_id, and `schemas/**` is a
  simple-glob block in `BOUND_ARTIFACTS` — not promoted — so `gate_override({rule_id:"schemas/**"})`
  returns `unknown rule_id: schemas/**`. Fix = **option 1** (preflight-delegation, mirroring the
  `skills` rule) + reason repair + stale-doc sweep.

**Correction to the finding's premise:** `loop-introspect.js:89` reads `schemas/*.schema.json` to list
record types, so `schemas/**` is **not** a no-code-consumer sidecar. The gate protects a real code
consumer; option 1 (keep the gate, delegate to a preflight marker) is the correct call, not removal.

**Mode:** `--tdd`. Research was already done by the two reports
(`plans/reports/problem-solving-260719-2029-runtime-state-records-sandbox-handoff.md` and
`plans/reports/schema-drift-260720-1103-schemas-write-gate-deprecated-ref.md`); this plan
scout-verified the evidence against current code and proceeds to TDD + red-team + validation.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `readRuntimeStateRows` is the single read path for `runtime-state.jsonl`; `inbound-state.js` and `file-readers.js` no longer own-parse | P2 |
| 2 | Malformed lines are skipped (not total-loss); a `null` line no longer wipes `readRuntimeObservations` | P2 |
| 3 | `schemas/**` write-gate delegates to a `.loop-preflight-schemas` marker via `gate_mark_preflight({surface:"schemas"})`; reason text points at the canonical workflow | P2 |
| 4 | No live `pnpm validate:records` OR `pnpm check` references remain in `tools/learning-loop-mastra/tools/handlers/**` (covers `references/` + `evals/`) | P2 |
| 5 | Both findings resolved via `meta_state_resolve`; one change-log entry per fix | P2 |

## Phases

| # | Phase | Status | Files |
|---|-------|--------|-------|
| 1 | [Consolidate runtime-state read paths (B-widening)](./phase-01-consolidate-runtime-state-read-paths-b-widening.md) | Pending | `core/inbound-state.js`, `core/file-readers.js` |
| 2 | [Repair schemas write gate (preflight delegation)](./phase-02-repair-schemas-write-gate-preflight-delegation.md) | Pending | `core/bound-artifacts.js`, `core/evaluate-write-gate.js`, `tools/handlers/mark-preflight-complete-tool.js`, 8 reference docs + `evals/evals.json` |
| 3 | [Resolve findings + change-log](./phase-03-resolve-findings-change-log.md) | Pending | meta-state MCP tools only |

## Locked decisions (validation, 2026-07-20)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Finding 2 fix option | **Option 1 — preflight-delegation** (mirror the `skills` rule) | `loop-introspect.js:89` reads `schemas/*.schema.json`, so the gate protects a real consumer — removal is wrong; promotion is flawed (`gate_override` is bash-gate-only and the write-gate's promoted-rules path is unreachable while the block rule exists). Preflight-delegation keeps the audit gate, repairs the override path, and is consistent with `product`/`skills`. |
| 2 | `schemas` rule placement | **Move out of `BOUND_ARTIFACTS`** into a special-cased `schemas` entry in `WRITE_GATE_RULES` (like `skills`) | Preflight-delegating rules are special-cased in `evaluate-write-gate.js`, not data-only `bound-artifacts.js`. Updates the pinned-order test in `bound-artifacts.test.js` (5 simple-glob rules remain). |
| 3 | Finding 1 scope | **Consolidate both copies** (inbound-state + file-readers) | Both deferred explicitly in 260719-2201; now unblocked. `inbound-state` swap is a behavior change (fail-open-`[]` → skip-malformed) with its own tests; `file-readers` is a parse swap that also fixes a latent `null`-line crash. |
| 4 | Stale-doc sweep | **Same commit as the gate reason repair** | The reason text is the source of truth the docs inherit; atomic fix prevents re-drift. Historical references in `plans/**` are left (they are immutable audit artifacts). |

## Cross-plan dependencies

- **Unblocked by:** `plans/260719-2201-runtime-state-record-integrity/` (status: **completed**, commit
  `4074432`) — introduced `readRuntimeStateRows` + `verifyRow` (v2 fingerprint). This plan consumes that
  shared helper. No `blockedBy` recorded (prior plan is terminal).
- **Out of scope:** Bug C (same-id "correction" rows + sandbox hand-off) is a plan-edit to
  `plans/260719-1428-central-skills-management/` Phase 3, tracked separately. This plan does **not**
  touch the same-id correction mechanism or `runtime-state.jsonl` row content.
- **No overlap** with the suggested `260719-1428-central-skills-management` plan's code surfaces.

## Success Criteria

- [ ] `pnpm test` green; `pnpm exec vitest --changed` green for touched files.
- [ ] `readSidecar` absent from `core/inbound-state.js`; `readRuntimeStateRows` imported by both
  `core/inbound-state.js` and `core/file-readers.js` (targeted grep — NOT bare `JSON.parse`, which
  false-matches the gate-marker parse at `inbound-state.js:55`; red-team A4).
- [ ] New tests prove: malformed line skipped (not total-loss) in `inbound-state`; `null` line no
  longer wipes `readRuntimeObservations`; **bash-gate constraint-match flip pinned** (red-team F3/S1);
  corruption-masking (S7) + timestamp-missing (F5) behaviors pinned.
- [ ] `evaluateWriteGate({filePath:"schemas/runtime-state.schema.json"})` blocks without marker
  (surface `"schemas"`, no `pnpm validate:records` in reason) and returns `ok` after
  `gate_mark_preflight({surface:"schemas"})`; `schemas/dist/foo.json` matches the `schemas` rule
  not `build-artifacts` (red-team F4).
- [ ] `grep -rn "validate:records\|pnpm check" tools/learning-loop-mastra/tools/handlers/` → 0
  matches — covers BOTH `references/` and the sibling `evals/` dir (red-team A2/A3).
- [ ] `meta_state_resolve` called on both findings; one `meta_state_log_change` per fix in the PR
  body's registry-deltas section. No `LOOP_SESSION_MODE` precondition (red-team S2/F2/A1).

## Risk Assessment

- **Inbound-gate behavior change** (Finding 1, copy 1): a sidecar that previously wiped to `[]` on one
  malformed line now returns valid rows. Downstream `checkObservationStaleness` may flip a
  previously-stale result to not-stale. Mitigation: explicit before/after test fixture with a
  malformed line + a fresh valid row; red-team reviews the staleness flip.
- **Write-gate rule-order test** (Finding 2): removing `schemas` from `BOUND_ARTIFACTS` breaks the
  pinned-order assertion in `bound-artifacts.test.js`. Mitigation: update the test in the same commit
  (5-rule pinned array + a separate assertion that `schemas` is handled by `evaluateWriteGate`).
- **Doc sweep blast radius**: 8+ live reference files mention `pnpm validate:records`. Replacing with
  the canonical workflow (`meta_state_log_change` for schema changes; the preflight path for gated
  writes) must not break eval assertions in `evals/evals.json`. Mitigation: audit `evals.json` lines
  12/25 before editing; if the eval asserts on the exact string, update the eval fixture in the same
  commit.

## Open questions

1. `change-log-bound-paths.js:46` lists `schemas/**` as a bound path. Confirm it does not depend on
   `schemas` being a simple-glob `BOUND_ARTIFACTS` entry (it is a separate path list; expected
   unaffected — verify during Phase 2).
2. **(Resolved by red-team S4)** `evals/evals.json` lines 12/25 reference `pnpm validate:records`:
   the `runtime-proof-prompt`/`orchestration-prompt` evals test **record-validation hygiene**, NOT
   schemas-gate unlock. Replace with the record-hygiene canonical step (`pnpm test`/MCP record
   tools), NOT the schemas-gate unlock workflow. Phase 2 step 6 provides the exact replacement text.

## Red Team Review

### Session — 2026-07-20
**Findings:** 15 (15 accepted, 0 rejected)
**Severity breakdown:** 1 Critical, 4 High, 10 Medium
**Reviewers:** Security Adversary (Fact Checker), Failure Mode Analyst (Flow Tracer), Assumption Destroyer (Scope Auditor)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `bound-artifacts.test.js:84-101` forbids `globMatch("schemas/**"` in `evaluate-write-gate.js`; Phase 2 re-introduced the literal → blocks green | Critical | Accept | Phase 2 |
| 2 | Phase 3 false premise: `meta_state_resolve` is NOT `LOOP_SESSION_MODE=live`-gated (only consult-gate) | High | Accept | Phase 3 |
| 3 | Phase 1 blast-radius miss: `readRuntimeObservations` also feeds `evaluate-bash-gate.js:73`; constraint-match flips block→ok on malformed+valid sidecar | High | Accept | Phase 1 |
| 4 | `evals/evals.json` conflation (tests record hygiene, not schemas unlock) + path miss (lives in `handlers/evals/`, sibling of `references/`) | High | Accept | Phase 2 |
| 5 | `pnpm check` also non-existent; sweep only catches it co-located with `validate:records`; success grep misses standalone refs | High | Accept | Phase 2 |
| 6 | Phase 1 outer `try/catch` contradiction (Architecture vs Risk); verified `assertinvariantSync` cannot throw | Medium | Accept | Phase 1 |
| 7 | Phase 1 red-test gap: corruption-masking (corrupted latest row + older valid row → silent not-stale) | Medium | Accept | Phase 1 |
| 8 | Phase 1 red-test gap: timestamp-missing row changes the staleness reason string | Medium | Accept | Phase 1 |
| 9 | Doc-sweep conflation: injecting schemas-gate unlock into general record-hygiene docs pollutes the audit trail | Medium | Accept | Phase 2 |
| 10 | Cascade ordering: `schemas` after `BOUND_ARTIFACTS` lets `build-artifacts` shadow `schemas/dist/**`; preflight override silently breaks | Medium | Accept | Phase 2 |
| 11 | Phase 3 revert sequencing: a reverted phase commit leaves a `resolved` finding with no fix in tree | Medium | Accept | Phase 3 |
| 12 | Partial-write race in `mark-preflight` fan-out (pre-existing); one surface marker is sufficient to unlock | Medium | Accept (note) | Phase 2 |
| 13 | `gate_mark_preflight` surface validator is `z.string()`; arbitrary-marker litter vector | Medium | Accept | Phase 2 |
| 14 | Phase 1 success-criteria grep `JSON.parse` false-matches the gate-marker parse at `inbound-state.js:55` | Medium | Accept | Phase 1 |
| 15 | `bound-artifacts.test.js` header L9-10 + title L31 still say "6 simple-glob rules" after the move to 5 | Medium | Accept | Phase 2 |

**Key corrections folded in:**
- Phase 2 matcher uses `globMatch(SCHEMAS_GLOB, …)` (not the literal) → the no-inline-literals test stays green (F1).
- Phase 2 `schemas` rule inserted BEFORE `...BOUND_ARTIFACTS` to preserve first-match precedence over `build-artifacts` (F4).
- Phase 2 `gate_mark_preflight` validator tightened to `z.enum(["product","skills","schemas"])` (S6).
- Phase 1 keeps the outer `try/catch` as defensive; `assertinvariantSync` verified non-throwing (F6).
- Phase 1 adds red tests for bash-gate constraint flip (F3), corruption-masking (S7), timestamp-missing (F5); targeted grep replaces bare `JSON.parse` (A4).
- Phase 2 categorizes the doc sweep: schemas-gate-unlock docs vs general record-hygiene docs; `evals.json` → record-hygiene canonical step, NOT schemas unlock (S4/S5/A2/A3).
- Phase 3 drops the `LOOP_SESSION_MODE=live` precondition; adds revert/reopen sequencing (S2/F2/A1, F7).

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-…`, `phase-02-…`, `phase-03-…`
- Decision deltas checked: 11 (schemas rule placement + matcher constant + cascade order + enum validator; outer try/catch kept; bash-gate red test + corruption/timestamp red tests + targeted grep; doc-sweep categorization + evals.json path + pnpm check sweep; LOOP_SESSION_MODE removed; revert/reopen step; bound-artifacts test 6→5).
- Reconciled stale references:
  - `plan.md` Success Criteria grep widened to `handlers/` + `pnpm check`; bare `JSON.parse` → targeted `readSidecar`/`readRuntimeStateRows`.
  - `plan.md` Phases table Phase 2 files line now includes `evals/evals.json`.
  - `plan.md` Open question 1 (evals.json) resolved + renumbered.
  - `phase-01` Architecture/Requirements/Related/Steps/Success/Risk all reflect the 3 new red tests + outer-try/catch resolution + bash-gate consumer.
  - `phase-02` Architecture/Related/Steps/Success/Risk reflect F1 matcher constant + F4 cascade + S6 enum + S4/S5/A2/A3 categorized sweep + A5b test header.
  - `phase-03` Requirements/Architecture/Steps/Success/Risk reflect LOOP_SESSION_MODE removal + F7 revert/reopen.
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-07-20
**Verification pass:** Skipped (guard) — `## Red Team Review` already present with verification evidence from 3 reviewers (Fact Checker / Flow Tracer / Scope Auditor); no `[UNVERIFIED]` tags.
**Questions asked:** 4 | **Answered:** 4 | **Failed claims:** 0

| # | Decision | Choice | Notes |
|---|----------|--------|-------|
| 1 | Corruption signal when a malformed line is skipped (red-team S7) | **Accept silent skip** | `readRuntimeStateRows` returns just rows; an older valid row may satisfy freshness and mask corruption. Trade-off pinned in a red test. No API change. (Chose recommended over the `skippedMalformed` envelope, which would touch every caller — wider than the B-widening scope.) |
| 2 | `pnpm check` sweep scope (red-team A3) | **Sweep both now** | Replace both `validate:records` AND `pnpm check` across all `handlers/` files in the same commit. Both are non-existent in `package.json` and share the same doc set — atomic fix prevents re-drift. Success grep checks both tokens. |
| 3 | Phase 3 timing relative to phase commits (red-team F7) | **After full PR final** | Resolve + change-log only after the full PR is post-CI-green, pre-merge. Revert-safe: a reverted phase commit never leaves a `resolved` finding with no fix in the append-only registry. |
| 4 | `gate_mark_preflight` surface validator (red-team S6) | **Tighten to `z.enum`** | `z.string()` → `z.enum(["product","skills","schemas"])` in the same commit the tool is already being edited. Closes the arbitrary-marker litter vector. |

**Propagation:** All four answers confirm the options already encoded in the phases during red-team application → no phase edits required. Phase 1 step 4 (S7) = accept; Phase 2 step 6 (A3) = sweep both; Phase 3 step 5 (F7) = after full PR final; Phase 2 Architecture (S6) = `z.enum`.

### Whole-Plan Consistency Sweep (post-validation)
- Files reread: `plan.md`, `phase-01-…`, `phase-02-…`, `phase-03-…`
- Decision deltas checked: 4 (all confirmed-accepted; none flip a prior red-team decision)
- Reconciled stale references: 0 (all four answers match the red-team-applied option — no term/scope renames)
- Unresolved contradictions: 0

<!-- slug: runtime-state-read-path-consolidation-schemas-write-gate-repair -->