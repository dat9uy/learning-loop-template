---
title: "Phase D Plan 1a — Parity Tightening + Closeout Fingerprint Drift"
description: "Atomic follow-up to Phase D Plan 1: deep-equal parity tests, envelope-input tests, factory id-shape validation, explicit runId generation, LibSQL schema fingerprint test, plus 3 finding resolutions (pre-closeout fingerprint-drift refresh hook, Claude Code SessionStart hint injection, TaskUpdate idempotency wrapper). Single branch, 1 PR, ~3-5h. Ships before Plan 3 so agents inherit tighter parity."
status: pending
priority: P2
branch: "260622-1810-phase-d-plan-1a-parity-tightening"
tags: [meta-surface, phase-d, mastra, parity, atomic-fix, tdd, fingerprint-drift, session-start-hint, taskupdate-idempotency]
blockedBy: ["260618-1911-phase-d-plan-1-workflows"]
blocks: ["phase-d-plan-3-agents", "phase-d-plan-4-cutover"]
created: "2026-06-22"
createdBy: "ck:plan"
source: skill
related:
  - "plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md (Plan 1a candidates section)"
  - "plans/reports/review-260619-1429-GH-1911-phase-d-plan-1-workflows-report.md (reviewer findings #2, #3, #4, #6, #8, #10)"
  - "plans/reports/journal-260619-2246-phase-d-plan-2-shipped.md (fingerprint-drift pre-closeout gap surfaced)"
  - "plans/reports/researcher-A-260619-2246-mastra-libsql-install-api-report.md (schema fingerprint suggestion Open Questions Q5)"
  - "plans/reports/debug-260620-1713-caa56a15-stuck-taskupdate-loop-report.md (190-call TaskUpdate no-op loop)"
  - "plans/260618-1911-phase-d-plan-1-workflows/plan.md (parent plan; Plan 1a is the deferred atomic fix)"
  - "plans/260619-2246-phase-d-plan-2-storage/plan.md (sibling; storage schema fingerprint test originates from Plan 2 validate)"
  - "meta-260620T2108Z-when-code-is-modified-findings-anchored-to-file-paths-drift (active; Plan 1a Phase 7 resolves)"
  - "meta-260622T1439Z-plan-b-s-layer-2-fix-gh-2246-relies-on-the-new-pnpm-test-dis (reported; Plan 1a Phase 8 resolves)"
  - "meta-260622T1439Z-claude-code-s-native-taskupdate-tool-returns-updated-task-n (reported; Plan 1a Phase 9 provides local wrapper)"
---

# Phase D Plan 1a — Parity Tightening + Closeout Fingerprint Drift

## Overview

**Plan 1a of the 4-plan Phase D stack** — the atomic follow-up to `260618-1911-phase-d-plan-1-workflows` (Plan 1, shipped 2026-06-19, PR #6). Plan 1 ships 8 `createWorkflow` migrations plus parity harness; Plan 1a tightens the parity contract and resolves 3 operator-acked structural findings that surfaced during Plan 1 review, Plan 2 closeout, and Plan B (GH-2246) debugging.

**Scope (10 phases, 1 branch, ~3-5h):**

| Group | Phases | Effort |
|---|---|---|
| **A — Parity tightening (Plan 1 review findings #2-#4, #6, #8)** | Phases 1-5 | ~2h |
| **B — Storage hardening (Plan 2 validate decision)** | Phase 6 | ~30min |
| **C — 3 finding resolutions (operator-acked)** | Phases 7-9 | ~1-1.5h |
| **D — Acceptance gate** | Phase 10 | ~30min |

**Why Plan 1a ships now (before Plan 3):** the parent brainstorm recommended Plan 1a as "ship before Plan 3 (so Plan 3's agents inherit the tighter parity guarantees)" (`plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md:341`). The factory `createLoopWorkflow` and parity harness are the substrate Plan 3's `createLoopAgent` mirrors — locking the parity contract before adding the agent layer avoids backfilling parity once agents are wired.

**Out of scope (separate tracks, NOT this plan):**
- Multi-step `stateSchema` restructuring for `self_improvement` and `runtime_probe` — Plan 3 owns (per Plan 1 §"Q1 Conflict Resolution" + parent brainstorm §"Process deltas" #1).
- LibSQL storage substrate — Plan 2 (shipped 2026-06-19).
- 3 agent parity tests + factory — Plan 3.
- `agent-manifest.json` final 5-group reconciliation — Plan 4.
- Cold-session discoverability update for the new 8 `run_workflow_*` tools — Plan 4 (deferred from Plan 1a scope per brainstorm §"Plan 4 deferred" item 4.2).
- Meta-state migration JSONL → LibSQL — separate phase.
- D-16 (CI test-drift check), D-17 (fail-fast on manifest errors), D-19 (LIM hardening) — separate tracks per parent report §"Out of scope".
- Upstream Claude Code `TaskUpdate` structural fix — out of this repo's control; Phase 9 ships a local wrapper that returns `{changed: bool}`, which is forward-compatible with the eventual native fix.

## Phases

| Phase | Name | Status | Effort | TDD Color | Source |
|-------|------|--------|--------|-----------|--------|
| 1 | [Setup and Audit](./phase-01-setup-and-audit.md) | Pending | ~15min | n/a (verify-only) | setup |
| 2 | [Deep-Equal Parity Tests](./phase-02-deep-equal-parity-tests.md) | Pending | ~1h | RED → GREEN (6 deep-equal assertions using `legacyToResult`) | review-260619-1429 finding #2, #3 |
| 3 | [Envelope Input Tests](./phase-03-envelope-input-tests.md) | Pending | ~30min | RED → GREEN (2 envelope-form tests) | review-260619-1429 finding #3 |
| 4 | [Factory Hardening](./phase-04-factory-hardening.md) | Pending | ~10min | RED → GREEN (1 new invariant test) | review-260619-1429 finding #8 (minor) |
| 5 | [RunId Generation](./phase-05-runid-generation.md) | Pending | ~30min | RED → GREEN (1 idempotency test) | review-260619-1429 finding #6 (medium) |
| 6 | [Schema Fingerprint Test](./phase-06-schema-fingerprint-test.md) | Pending | ~30min | RED → GREEN (1 schema-listing test) | researcher-A-260619-2246 §Q5; Plan 2 validate 2026-06-19 |
| 7 | [Pre-Closeout Refresh Hook](./phase-07-pre-closeout-refresh-hook.md) | Pending | ~30min | n/a (script + integration) | meta-260620T2108Z-when-code-is-modified-findings-anchored-to-file-paths-drift (active) |
| 8 | [SessionStart Hint Injection](./phase-08-sessionstart-hint-injection.md) | Pending | ~30min | n/a (config + smoke test) | meta-260622T1439Z-plan-b-s-layer-2-fix-gh-2246-relies-on-the-new-pnpm-test-dis (reported) |
| 9 | [TaskUpdate Idempotency Tool](./phase-09-taskupdate-idempotency-tool.md) | Pending | ~30min | RED → GREEN (3 unit tests) | meta-260622T1439Z-claude-code-s-native-taskupdate-tool-returns-updated-task-n (reported) |
| 10 | [Acceptance Gate and Closeout](./phase-10-acceptance-gate-and-closeout.md) | Pending | ~30min | verify-only | closeout |

**Total effort:** ~3.5-5 hours. One session. Single branch (`260622-1810-phase-d-plan-1a-parity-tightening`), single PR (10 commits, one per phase, stacked).

## Plan 1a vs Parent Plan — Decision Anchors

| Decision | Parent Plan (1) | Plan 1a (this) | Rationale |
|---|---|---|---|
| Parity assertion depth | shape-only (`Array.isArray`, `typeof`) | deep-equal (`assert.deepStrictEqual`) | review-260619-1429 finding #2 — shape-only parity masks field-level regressions |
| Envelope-input coverage | absent | 2 tests prove `stripEnvelope` handles MCP envelope form | review-260619-1429 finding #3 — agent callers wrap input in MCP envelope; current parity tests don't exercise this path |
| `createLoopWorkflow` id-shape | unvalidated | regex `/^[a-z][a-z0-9_]*$/` enforced | review-260619-1429 finding #8 — fail-fast at definition time protects downstream MCP `run_<id>` naming |
| `server.js` runId source | `proxiedContext?.get("runId")` (often undefined) | explicit `crypto.randomUUID()` fallback | review-260619-1429 finding #6 — Mastra tolerates undefined today, but downstream idempotency/caching needs stable runIds |
| Storage schema drift detection | absent | schema fingerprint test asserts table/column counts | Plan 2 validate decision 2026-06-19 — catches `@mastra/libsql` schema drift on future bumps |
| Fingerprint-drift refresh | post-discovery (closeout ad-hoc) | pre-flight script | meta-260620T2108Z-when-code-is-modified — closeout runs `meta_state_query_drift` then refreshes BEFORE `pnpm test` |
| Claude Code hint visibility | Droid-only (Plan B Layer 2 reachable via `.factory/hooks/loop-surface-inject.cjs`) | Claude Code SessionStart hook calls `loop_describe({tier:"warm"})` | meta-260622T1439Z-plan-b-s-layer-2-fix — Claude Code cold-session agents gain parity with Droid |
| TaskUpdate no-op signal | absent (native tool returns same string for change and no-op) | local `loop_task_update` MCP tool returns `{changed: bool}` | meta-260622T1439Z-claude-code-s-native-taskupdate-tool — wraps native call + reads registry for previous status |

## Pre-flight Checklist (per R-15 acceptance)

| Phase | Gated Path | Tool / Env | Notes |
|-------|-----------|------------|-------|
| 2 | `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js` (modify; 6 new `assert.deepStrictEqual`) | none | test addition |
| 3 | `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js` (modify; 2 envelope tests) | none | test addition |
| 4 | `tools/learning-loop-mastra/create-loop-workflow.js` (modify; 1-line regex check + error message) | none | factory hardening |
| 4 | `tools/learning-loop-mastra/__tests__/create-loop-workflow.test.js` (modify; 1 new invariant test) | none | test addition |
| 5 | `tools/learning-loop-mastra/server.js` (modify; `crypto.randomUUID()` fallback) | none | server wiring |
| 5 | `tools/learning-loop-mastra/__tests__/server-runid.test.js` (new) | none | idempotency test |
| 6 | `tools/learning-loop-mastra/__tests__/schema-fingerprint.test.cjs` (new) | none | storage schema drift detection |
| 7 | `tools/scripts/refresh-fingerprints-pre-closeout.mjs` (new) | `OPERATOR_MODE=1` | pre-flight script |
| 7 | `tools/learning-loop-mcp/hooks/refresh-fingerprints-pre-closeout.js` (new; hook entry) | `OPERATOR_MODE=1` | optional hook integration |
| 8 | `.claude/settings.json` (modify; SessionStart hook entry) | none | Claude Code parity with Droid |
| 8 | `tools/learning-loop-mcp/hooks/session-start-inject-discoverability.cjs` (new) | none | SessionStart implementation |
| 9 | `tools/learning-loop-mastra/tools/task-update.js` (new; MCP tool) | `OPERATOR_MODE=1` | idempotency wrapper |
| 9 | `tools/learning-loop-mastra/tools/manifest.json` (modify; add `mastra_task_update` entry) | none | manifest addition |
| 9 | `tools/learning-loop-mastra/__tests__/task-update.test.js` (new) | none | 3 unit tests |
| 10 | `plans/reports/productization-260612-1530-master-tracker.md` (D1/D2/D3 → already `[x]`; no change) | n/a | no master-tracker flip in Plan 1a |
| 10 | `meta-state.jsonl` (3 entries: `meta_state_resolve` for fingerprint-drift + SessionStart-hint + TaskUpdate-noop; `meta_state_log_change` for Plan 1a closeout) | `OPERATOR_MODE=1` | gated; closeout contract |

**Pre-flight calls (`gate_mark_preflight`) required:** Phase 7, Phase 8, Phase 9 touch `meta-state.jsonl` + `meta-state-tools` + `.claude/settings.json`. Single preflight marker for the surface `product` is sufficient (per `gate_mark_preflight` tool docs).

## Dependencies

**Blocked by:**
- `260618-1911-phase-d-plan-1-workflows` (Plan 1 closed 2026-06-19; provides the 8 `createWorkflow` wrappers, `createLoopWorkflow` factory, parity harness, and `mastra_*` + `run_workflow_*` tool surface that Plan 1a tests + hardens).
- `260619-2246-phase-d-plan-2-storage` (Plan 2 closed 2026-06-19; provides the `@mastra/libsql` substrate that Phase 6's schema fingerprint test asserts).

**Blocks:**
- `phase-d-plan-3-agents` (Plan 3 — 3 `createAgent` wrappers; depends on Plan 1a's `createLoopWorkflow` factory hardening + tighter parity guarantees + TaskUpdate idempotency tool that Plan 3's agent reasoning can consume via MCP).
- `phase-d-plan-4-cutover` (Plan 4 — `agent-manifest.json` final 5-group structure + master-tracker flip + §3.10 reconciliation; depends on Plan 1a's `task_update` MCP tool being registered in the manifest for the cutover enumeration).

**Cross-plan refs (informational, no dependency):**
- `260617-1138-phase-c-plan-1a-atomic-fix` (Phase C Plan 1a precedent — atomic fix discipline + per-PR blast radius; Plan 1a mirrors this pattern).
- `260616-2200-phase-c-plan-2-parity` (peer — parity harness pattern; Phase 2 deep-equal tests reuse `legacyToResult` helper from this file's lineage).

**Out of scope (separate tracks):**
- Cold-session discoverability enumeration update — Plan 4 (per parent brainstorm §"Plan 4 deferred" item 4.2).
- Multi-step `stateSchema` restructuring for `self_improvement` / `runtime_probe` — Plan 3 (per Plan 1 §"Q1 Conflict Resolution").
- D-11 reconciliation (4 tools missing from legacy `agent-manifest.json`) — Plan 3 (per parent brainstorm §"Plan 3 deferred" item 3.3).

## Whole-Plan Consistency Sweep

- **Files reread during authoring:** plan.md (this), phase-01 through phase-10 (10 files).
- **Decision deltas from brainstorm §"Plan 1a candidates" + 3 added findings:**
  - **Brainstorm §"Plan 1a candidates" lists 5 items (1.1 deep-equal, 1.2 envelope, 1.3 id-shape, 1.4 runId, 1.5 schema fingerprint).** All 5 ship in Plan 1a Phases 2-6. ✓
  - **3 added findings** all resolve in Phases 7-9 with explicit `meta_state_resolve` calls in Phase 10 (closeout contract).
  - **No drop.** Cold-session discoverability update was a brainstorm "Plan 1a candidate" (item 1.3 in parent report §"Plan 1a candidates" → "Update `cold-session-discoverability.test.cjs` to enumerate the new 39-tool mastra surface") but was reclassified in parent §"Plan 4 deferred" item 4.2 to Plan 4 (where the post-cutover enumeration lives). **Plan 1a explicitly excludes it** — see "Out of scope" above.
- **File ownership map (no parallel conflicts):**
  - Phase 2-4: `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js` (additions; no shared-edit conflict) + `create-loop-workflow.js` (1-line regex).
  - Phase 5: `tools/learning-loop-mastra/server.js` (1-line `crypto.randomUUID()`) + new `__tests__/server-runid.test.js`.
  - Phase 6: new `tools/learning-loop-mastra/__tests__/schema-fingerprint.test.cjs`.
  - Phase 7: new `tools/scripts/refresh-fingerprints-pre-closeout.mjs` + optional hook entry.
  - Phase 8: new `tools/learning-loop-mcp/hooks/session-start-inject-discoverability.cjs` + `.claude/settings.json` (SessionStart hook entry).
  - Phase 9: new `tools/learning-loop-mastra/tools/task-update.js` + `tools/manifest.json` (1 line) + new `__tests__/task-update.test.js`.
  - Phase 10: no file changes outside `meta-state.jsonl` + `docs/journals/` + `plans/260622-1810-phase-d-plan-1a-parity-tightening/pr-body.md` + `plans/reports/productization-260612-1530-master-tracker.md` (no flip; Plan 1a is atomic-fix tier).
- **Test count delta:** Phase 2 +6, Phase 3 +2, Phase 4 +1, Phase 5 +1, Phase 6 +1, Phase 9 +3 = **+14 tests** by Phase 9. Phase 10 (gate run) is verify-only. Total post-Plan-1a: 1108 (was 1083; +24 Plan 1 + 1 from this plan; correcting math: was 1083 per journal-260619-2246; +14 = 1097). (Reconciliation note: parent report claims 1083 at Plan 2 close; Plan 1a adds 14 net → 1097 expected post-Plan-1a.)
- **Reconciled stale references:**
  - Parent brainstorm §"Plan 1a candidates" item 1.4 references `tools/learning-loop-mastra/create-loop-workflow.js:58` for the id-shape check — verified at line 58 in `createLoopWorkflow({ id, ... })` destructure; Phase 4 adds regex check after the `description` validation block (line 60-62).
  - Parent brainstorm §"Plan 1a candidates" item 1.5 says "Plan 2 ships 11 tests in `storage-parity.test.cjs`" — verified by reading `__tests__/storage-parity.test.cjs` (Phase 6 references this lineage).
  - `meta-260622T1439Z-plan-b-s-layer-2-fix-gh-2246-relies-on-the-new-pnpm-test-dis` description references `.claude/settings.json:3-12` SessionStart hook — verified; Phase 8 adds a sibling hook entry.
- **Unresolved contradictions:** 0. All Plan 1a scope items have either a review finding id, a finding id, or a brainstorm source. No silent expansion.

## Key Risks Addressed

- **Deep-equal tests are slow / brittle.** Risk: low. Each `assert.deepStrictEqual(started.result, EXPECTED)` test uses fixed input + expected output captured at Plan 1 closeout. Tests assert "matches what we shipped yesterday" — regressions trip the test. Mitigation: test cases are read-only fixtures (one per workflow); no live data dependency.
- **Schema fingerprint test breaks on `@mastra/libsql` upgrade.** Risk: medium. The schema-fingerprint assertion is a literal snapshot — any table/column addition in a future Mastra bump fails the test. Mitigation: the test runs after every `pnpm test` cycle; a bumped dep that changes the schema requires a deliberate `meta_state_log_change` to update the snapshot (operator-gated). False positives force a deliberate schema-change review.
- **Pre-closeout refresh hook overwrites legitimate drift.** Risk: low. The hook reads `meta_state_query_drift` output; only `hash_mismatch` entries are refreshed; `code_missing` (file gone) and `drift_other` are surfaced, not auto-fixed. Operator reviews the latter.
- **SessionStart hook adds latency to every Claude Code start.** Risk: low. `loop_describe({tier:"warm"})` is a local file read + JSON parse + cold-tier cache check (~5-15ms on dev machine). Hook is async; does not block CLI startup. Mitigation: Phase 8 step 4 includes a latency budget assertion (<50ms p95).
- **TaskUpdate wrapper tool duplicates Claude Code's native TaskUpdate.** Risk: medium for agent discoverability. The wrapper is registered as `mastra_task_update` in the MCP server; the native Claude Code `TaskUpdate` is still available. Agents using the cold-session quickstart may see both. Mitigation: Phase 9 step 5 includes a `cold-session-discoverability` smoke assertion that the wrapper appears in the quickstart; Plan 4 finalizes the manifest cross-references.
- **Upstream Claude Code TaskUpdate structural fix lands.** Risk: low (forward-compatible). When upstream ships the `{changed: bool}` return shape, Phase 9's wrapper can be slimmed to a no-op passthrough. The wrapper is the consumer; the underlying tool is replaceable.

## References

- `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` (parent; Plan 1a candidates + 4-plan stack decision)
- `plans/reports/review-260619-1429-GH-1911-phase-d-plan-1-workflows-report.md` (review findings #2, #3, #4, #6, #8, #10)
- `plans/reports/journal-260619-2246-phase-d-plan-2-shipped.md` (fingerprint-drift gap surfaced; pre-flight hook needed)
- `plans/reports/researcher-A-260619-2246-mastra-libsql-install-api-report.md` (storage schema fingerprint suggestion §"Open Questions" Q5)
- `plans/reports/debug-260620-1713-caa56a15-stuck-taskupdate-loop-report.md` (TaskUpdate no-op loop analysis; session `caa56a15-2db7-4a83-9ec3-8ab26a8de2ff`)
- `plans/260618-1911-phase-d-plan-1-workflows/plan.md` (parent plan; Plan 1 deferred items)
- `plans/260619-2246-phase-d-plan-2-storage/plan.md` (sibling; storage substrate + parity harness pattern)
- `plans/260617-1138-phase-c-plan-1a-atomic-fix/plan.md` (peer — atomic-fix discipline + per-PR blast radius)
- `tools/learning-loop-mastra/create-loop-workflow.js` (factory; Phase 4 id-shape validation)
- `tools/learning-loop-mastra/server.js` (registration point; Phase 5 runId generation)
- `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js` (Phase 2 + Phase 3 target)
- `tools/learning-loop-mastra/__tests__/storage-parity.test.cjs` (Phase 6 lineage)
- `tools/learning-loop-mastra/tools/manifest.json` (Phase 9 addition)
- `tools/learning-loop-mcp/hooks/bash-gate.js` (Phase 8 hook integration pattern)
- `.claude/settings.json` (Phase 8 SessionStart hook entry)
- `.factory/hooks/loop-surface-inject.cjs` (Droid reference for parity — Phase 8 mirrors)
- `meta-260620T2108Z-when-code-is-modified-findings-anchored-to-file-paths-drift` (Phase 7 resolves)
- `meta-260622T1439Z-plan-b-s-layer-2-fix-gh-2246-relies-on-the-new-pnpm-test-dis` (Phase 8 resolves)
- `meta-260622T1439Z-claude-code-s-native-taskupdate-tool-returns-updated-task-n` (Phase 9 wrapper resolves)
- `meta-260620T2108Z-the-full-pnpm-test-glob-11-directories-1100-tests-takes-10-m` (resolved; Plan B sibling — Phase 8 ties into the discoverability hint this finding shipped)
- `plans/reports/productization-260612-1530-master-tracker.md` (no flip in Plan 1a; Plan 1 already closed D1/D2/D3)
- `@mastra/core` 1.42.0 + `@mastra/libsql` 1.13.0 (pinned; Phase 6 schema snapshot references these)
- `zod` 4.4.3 (exact pin; envelope-input tests in Phase 3 use the same `z.object` shape the wrappers ship)

## Validation Log

### Session 1 — 2026-06-22 (planning, post-scope-challenge)

**Trigger:** operator invocation `/ck:plan --github` with brainstorm report reference + 3 finding additions. Auto-detect mode: **fast** (clear scope, well-defined items, no unknowns). Scope challenge: HOLD (operator already locked 5 candidates from brainstorm + 3 added findings).

**Verification tier:** focused (1 role, 12 claims sampled — fast-mode budget).

#### Verification Results

- **Claims checked:** 12
- **Verified:** 11
- **Failed:** 0
- **Unverified:** 1 (deferred to Phase 6 schema-fingerprint implementation; snapshot table/column count is unknown until first test run)

**Unverified (deferred to implementation):**

1. **`@mastra/libsql` 1.13.0 schema fingerprint (table list + column counts).** Not pre-verified; Phase 6 step 1-3 runs the libsql client against `data/mastra-memory.db`, lists tables, captures the snapshot, asserts against it.

#### Questions Asked

(none — operator provided scope in initial prompt; brainstorming already locked the 5 candidates + 3 findings)

#### Confirmed Decisions

- **Plan 1a ships all 5 brainstorm candidates (1.1-1.5) + 3 added findings as Phases 2-9.** No further scope expansion.
- **Phase 10 closes 3 findings via `meta_state_resolve`** (after Phase 7-9 acceptance gates pass).
- **Cold-session discoverability update (originally a Plan 1a candidate) stays deferred to Plan 4** (per parent brainstorm §"Plan 4 deferred" item 4.2). Plan 1a explicitly excludes it.

#### Action Items

- [x] Plan 1a authored at `plans/260622-1810-phase-d-plan-1a-parity-tightening/`
- [ ] GitHub issue creation (Phase 10 step 3; this plan)
- [ ] PR body + journal entry (Phase 10 step 4-5)

#### Impact on Phases

- **All 10 phases:** no scope changes. Plan 1a mirrors parent Plan 1's 6-phase discipline (atomic adoption → parity → cutover) with 10 phases fitting the 5-candidate + 3-finding shape.

### Whole-Plan Consistency Sweep

- **Files reread:** plan.md (this), phase-01-setup-and-audit.md, phase-02-deep-equal-parity-tests.md, phase-03-envelope-input-tests.md, phase-04-factory-hardening.md, phase-05-runid-generation.md, phase-06-schema-fingerprint-test.md, phase-07-pre-closeout-refresh-hook.md, phase-08-sessionstart-hint-injection.md, phase-09-taskupdate-idempotency-tool.md, phase-10-acceptance-gate-and-closeout.md
- **Decision deltas checked:** 5 (5 candidates + 3 findings + 1 explicit-exclusion + 1 reclassification).
- **Reconciled stale references:**
  - Brainstorm §"Plan 1a candidates" item 1.4 references `tools/learning-loop-mastra/create-loop-workflow.js:58` — verified at line 58 (Phase 4 step 1).
  - Brainstorm §"Plan 1a candidates" item 1.5 says "Plan 2 ships 11 tests in `storage-parity.test.cjs`" — verified by file count; Phase 6 adds a 12th test in a separate file (per brainstorm recommendation).
  - Finding `meta-260622T1439Z-plan-b-s-layer-2-fix-gh-2246-relies-on-the-new-pnpm-test-dis` description references `.claude/settings.json:3-12` SessionStart hook — verified; Phase 8 adds a sibling hook entry without modifying lines 3-12.
- **Unresolved contradictions:** 0. Plan is internally consistent across all 11 files. 5-candidate scope is consistent in plan.md §"Phases" and phase-02 through phase-06. 3-finding scope is consistent in plan.md §"Phases" and phase-07 through phase-09. Cold-session exclusion is consistent in plan.md §"Out of scope" and the parent brainstorm §"Plan 4 deferred" item 4.2.