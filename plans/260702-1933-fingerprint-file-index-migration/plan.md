---
title: "Fingerprint File-Index Migration: per-finding hash to path-keyed shared index"
description: "Migrate the meta-state code-fingerprint mechanism from a per-finding stored hash to a shared path-keyed file-index sidecar, so a cited-file edit re-grounds all anchored findings in one operation (O(findings/file) -> O(1)). Vestigial migration leaves the per-record field as dead-data fallback; checkGrounding stays a pure function (index passed via codeContext). Substrate (JSONL vs DB) is out of scope."
status: pending
priority: P2
branch: "main"
tags: [meta-state, fingerprint, grounding, file-index, vestigial-migration, tdd]
blockedBy: []
blocks: []
created: "2026-07-02T14:35:46.745Z"
createdBy: "ck:plan"
source: skill
---

# Fingerprint File-Index Migration: per-finding hash to path-keyed shared index

## Overview

The meta-state grounding mechanism stores each `mechanism_check:true` finding's cited-file SHA-256 **on the finding** (`code_fingerprint`). When a cited file changes, every finding anchored to it must be individually re-hashed and re-written — O(findings_per_file) per edit, paid by the operator (24 refresh + 11 patch calls in the Phase D incident). This plan migrates that hash to a **shared, path-keyed sidecar** (`file-index.jsonl`) so one file change -> one index update -> all anchored findings re-grounded.

**Approach:** Frame A (file-index), substrate deferred. **Migration shape:** vestigial — repoint `checkGrounding` to the index, stop writing the per-record field, leave it as dead-data fallback, mark `@deprecated`. No rewrite of audit-immutable resolved findings; rollback = one-commit revert.

**Source of truth:** `plans/reports/brainstorm-260702-1933-code-fingerprint-file-index-report.md`. **Loop-design:** `loop-design-code-fingerprint-file-index-path-keyed-shared-hash-vestigial`. **Finding closed:** `meta-260624T1920Z-code-fingerprint-mechanism-is-o-n-per-cited-file-change-each`.

### Key design reconciliation (verified during planning)

The brainstorm report sketched "the sidecar is read **inside** `checkGrounding`." The codebase contradicts that sketch: `checkGrounding` is a **documented pure function** (`check-grounding.js` header: *"pure function (no subprocess)"*) and **30 unit tests** lock its contract, several by passing a bare `entry` with `entry.code_fingerprint` and asserting `grounded`. Reading a sidecar file inside it would (a) violate the purity invariant, (b) break those unit tests, and (c) break the cold-tier test which calls `checkGrounding(finding, { root })` with no sidecar.

**Resolution (takes precedence over the report's sketch):** the index is **passed into** `checkGrounding` via `codeContext.fileIndex` (a `Map<strippedPath, hash>`); the pure function stays pure. Baseline resolution becomes `validated(codeContext.fileIndex?.get(strippedPath)) ?? entry.code_fingerprint ?? null` — the per-record field becomes a **fallback** (both branches validated against `TERMINAL_HASH_REGEX`). This preserves every existing `check-grounding.test.js` unit test (they pass no `fileIndex` → fallback → byte-identical to today).

**Red-team correction (the cold-tier test is NOT "unchanged"):** the cold-tier regression test calls `checkGrounding(finding, { root })` with no index. Today that's green because `refresh_fingerprint` keeps the per-record field fresh. After Phase 4 stops writing the per-record field and Phase 5 stops the auto-record path, the fallback becomes **frozen-stale** (for files edited post-migration) or **undefined** (for new findings) → the test would see `hash_mismatch` (fail) or `hash_match: null`→`grounded` (mask drift). So the cold-tier test gets a **surgical update**: load `readFileIndex(root)` and pass `fileIndex` in `codeContext`. It still asserts the same grounding invariant (`grounded`) — now via the authoritative path instead of the stale fallback. The acceptance criterion is "passes **with the index loaded**," not "unchanged." A dedicated O(1) regression test (Phase 5) separately locks the one-refresh-re-grounds-all invariant.

This is a refinement of the data-model, not a reversal: the path-keyed shared index + vestigial per-record field stand. The *mechanical* location of the sidecar read moves from inside the pure function to each caller, to honor the verified purity invariant. Per the review rules, the verified invariant wins over the report's unverified sketch. **Red-team also found two more readers of the per-record field the original plan omitted** — `gate-logic.js#checkResolutionEvidence` (the `rule-no-orphaned-evidence` gate) and `query_drift`'s tool layer — both must be repointed alongside `checkGrounding`.

## Phases

| Phase | Name | Status | TDD focus |
|-------|------|--------|-----------|
| 1 | [Index Foundation](./phase-01-index-foundation.md) | Pending | sidecar read/write helpers + seed (additive, no behavior change) |
| 2 | [Hash Cache](./phase-02-hash-cache.md) | Pending | `(path, mtime, size)` cache in tool layer (additive) |
| 3 | [Repoint CheckGrounding](./phase-03-repoint-checkgrounding.md) | Pending | index via codeContext + fallback; 30 unit tests + cold-tier (index-loaded) green |
| 4 | [Refresh Tool](./phase-04-refresh-tool.md) | Pending | `meta_state_refresh_file_index`; **remove** `refresh_fingerprint` + retarget refs; optional `reason` |
| 5 | [Vestigial Deprecation](./phase-05-vestigial-deprecation.md) | Pending | `@deprecated`, block patches, retire backfill script, seed all, measure O(1), resolve finding |
| 6 | [Field Strip](./phase-06-field-strip.md) | Pending | strip `code_fingerprint` values from all findings (keep schema field); re-verify cold-tier |

## Dependencies

- **None blocking.** All sibling plans are `completed` (`260602-sp2-check-grounding` introduced the mechanism; `260610-1900-meta-state-refresh-loop-circuit-breaker` touched the refresh loop). No cross-plan `blockedBy`/`blocks` to wire.
- **In-scope contract:** `checkGrounding` pure-function signature stays backward-compatible (`codeContext.fileIndex` is additive, optional). The 30 `check-grounding.test.js` unit tests pass **unchanged** (no `fileIndex` → fallback). The cold-tier regression test is **surgically updated** to load `readFileIndex(root)` (see Red-team correction above) — same grounding invariant, authoritative path. **Three readers of the per-record baseline must all be repointed:** `checkGrounding` (Phase 3), `gate-logic.js#checkResolutionEvidence` (Phase 3), and `query_drift`'s tool layer (Phase 3).

## Acceptance criteria (the finding's bar)

- [ ] `loop-design` entry exists (filed by the brainstorm).
- [ ] All `mechanism_check:true` findings move off per-record fingerprints (index authoritative for every cited path; per-record field vestigial fallback) — without rewriting audit-immutable resolved findings.
- [ ] All 30 `check-grounding.test.js` unit tests pass **unchanged** (purity invariant honored via `codeContext.fileIndex`; no `fileIndex` → fallback → byte-identical to today).
- [ ] `cold-tier-regression.test.js` passes **with the index loaded** — surgical update: `readFileIndex(root)` + pass `fileIndex` in `codeContext`. Same `grounded` invariant via the authoritative path.
- [ ] **Dedicated O(1) regression test** (Phase 5): seed an index, edit a fixture file, call `refresh_file_index` once, assert all K anchored findings `grounded` via `checkGrounding` with the loaded index AND `drifted` without it.
- [ ] Per-file-change cost O(findings_per_file) -> O(1): **measured** — editing `gate-logic.js` (4 anchored findings) requires 1 `meta_state_refresh_file_index` call, after which all 4 are `grounded` via `checkGrounding` with the loaded index.
- [ ] **All three baseline readers repointed** to the index: `checkGrounding`, `gate-logic.js#checkResolutionEvidence`, `query_drift` tool layer.
- [ ] `file-index.jsonl` protected by the write gate (no direct Edit/Write) — mirroring `meta-state.jsonl`.
- [ ] Index baseline validated against `TERMINAL_HASH_REGEX` (H-2 defense preserved on the index path).
- [ ] **`meta_state_refresh_fingerprint` removed**; all 9 code refs + 4 AGENTS.md refs retargeted to `meta_state_refresh_file_index` (Q3); `meta_state_patch` blocks `code_fingerprint` (CV-B); `backfill-mechanism-check.mjs` retired (CV-A).
- [ ] **Phase 6 field-strip:** `code_fingerprint` values stripped from all findings (schema field kept `@deprecated`); cold-tier (index-loaded) + 30 unit tests still green.
- [ ] Finding `meta-260624T1920Z-...` resolved with a `meta_state_log_change` recording the design change (incl. the alias removal + field-strip exception).

## Out of scope

- **Storage substrate** (JSONL vs DB for meta-state). Deferred; triggers documented in the brainstorm report (>50 MB registry, >1 concurrent writer process, >50 ms write latency).
- Removing the vestigial `code_fingerprint` field from existing findings (left as dead-data fallback; a later cleanup pass may strip it after one release cycle — open question Q1).
- Cross-process write locking (`flock`); the single-writer (MCP server) contract already holds. Documented as a substrate trigger if a 2nd writer is ever introduced.

## Red Team Review

### Session — 2026-07-02
**Reviewers:** Security Adversary (Fact Checker), Failure Mode Analyst (Flow Tracer), Assumption Destroyer (Scope Auditor) — Full tier, 3 reviewers for 5 phases.
**Findings:** 22 raw → 15 distinct (deduplicated, capped). **15 accepted, 0 rejected.**
**Severity breakdown:** 4 Critical, 6 High, 5 Medium.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Cold-tier test must load the index (not "unchanged") — acceptance bar was self-contradictory | Critical | Accept | plan.md criteria; Phase 3, 5 |
| 2 | `checkResolutionEvidence` (gate-logic.js:692) reads per-record field directly — never repointed; CI gate fails post-migration | Critical | Accept | Phase 3 |
| 3 | Index key divergence: lookup uses relative path, auto-populate uses absolute `absPath` → lookup misses → drift masked | Critical | Accept | Phase 1, 3, 5 |
| 4 | `file-index.jsonl` NOT protected by the write gate → direct-write poisoning, zero audit trail | Critical | Accept | Phase 1 |
| 5 | `query_drift` tool builds `codeContext` with no `fileIndex` → false drift on every edited file | High | Accept | Phase 3 |
| 6 | Phase 3 snippet bypasses `TERMINAL_HASH_REGEX` for the index baseline → corrupt index → false drift (drops H-2 defense) | High | Accept | Phase 1, 3 |
| 7 | Manifest entry must declare `pathFields: []` or `validateToolManifest` crashes the MCP server at boot | High | Accept | Phase 4 |
| 8 | Hash cache keyed on `(path, mtime)` omits `size` — stale-hash window on same-mtime writes (read-registry-cache uses mtime+size) | High | Accept | Phase 2 |
| 9 | The O(1) win is never locked by an automated regression test — cold-tier bypasses the index → win can silently degrade to O(N) with no CI signal | High | Accept | Phase 5 |
| 10 | Shared index amplifies refresh blast radius: no auth gate, no caller identity in the audit log | High | Accept | Phase 4 |
| 11 | `readFileIndex` uncached disk read on every `check_grounding` call — should reuse `readRegistryWithCache` (mtime+size LRU) shape | Medium | Accept | Phase 1, 3 |
| 12 | `loop_introspect` + `sweep` display stale per-record `code_fingerprint`; `self-improvement-agent.js:24` keys "REFUSE resolve when stale" off it → agent refuses to resolve any edited finding | Medium | Accept | Phase 5 |
| 13 | `refresh_fingerprint` idempotency cache key `_cacheKey(id, entry.code_fingerprint)` becomes static after repoint → stale cached results | Medium | Accept | Phase 4 |
| 14 | Auto-populate failure (disk full / rename fails) leaves a finding permanently `grounded` with no baseline → drift masked; no documented recovery | Medium | Accept | Phase 5 |
| 15 | Rollback produces N transient false-drift signals; seed partial-failure has no completeness verification | Medium | Accept | Phase 5 |

**Dropped (lowest value):** "readFileIndex should skip malformed lines to match `_readAndParseRegistry`'s resilience" — the registry reader has NO such resilience (it throws on malformed JSON); corrected in Phase 1 to state the skip is NEW behavior, not a match.

**Key design delta from the red-team:** the plan's original acceptance criterion "cold-tier test passes **unchanged**" was self-contradictory (proven by 3 reviewers independently). It is replaced by "passes **with the index loaded**" — a surgical update to the cold-tier test (load `readFileIndex`, pass `fileIndex`) that exercises the authoritative path. The data-model decision (path-keyed shared index, vestigial per-record field) stands; the fixes are plan-doc + scope corrections, not a reversal.

### Whole-Plan Consistency Sweep
- **Files reread:** plan.md, phase-01-index-foundation.md, phase-02-hash-cache.md, phase-03-repoint-checkgrounding.md, phase-04-refresh-tool.md, phase-05-vestigial-deprecation.md
- **Decision deltas checked:** 9 (cold-tier "unchanged"→"index loaded"; cold-tier test added to Phase 3 modify list; `checkResolutionEvidence` added to Phase 3 modify list; `query_drift` added to Phase 3 modify list; canonical relative key via `canonicalIndexKey` in Phases 1/3/5; write-gate rule in Phase 1; `TERMINAL_HASH_REGEX` validation in Phases 1/3; `size` in cache key in Phase 2; `pathFields:[]` + audit identity + re-keyed idempotency in Phase 4; display surfaces + agent instructions + auto-populate/rollback recovery + O(1) test + second `code_fingerprint` schema field in Phase 5)
- **Reconciled stale references:** 0 remaining. The phases table and acceptance criteria in plan.md match the updated phase files; no phase file retains the old "unchanged" cold-tier claim or omits the repointed readers; the "no new write surface" framing in plan.md's reconciliation is preserved (the write-gate rule adds a gate entry, not a new write surface).
- **Unresolved contradictions:** 0. Plan is consistent and ready for implementation pending the Open Questions below.

### Open questions (carried)
- **Q1** — deprecate vs later-strip the vestigial `code_fingerprint` (default: leave; revisit after one release cycle).
- **Q2** — index covers resolved/superseded cited paths (cold-tier grounds `mechanism_check:true` regardless of status, now via the loaded index). Requirement, not open.
- **Q3** — `meta_state_refresh_fingerprint` back-compat: keep as thin alias indefinitely, or sunset after N releases? (default: keep + document deprecation).
- **Q4 (red-team F10 follow-up)** — require a `reason` argument on `refresh_file_index` (mandatory acceptance trail), or keep it optional? Default: optional; revisit if drift-masking incidents occur.

## Validation Log

### Validation Session 1 — 2026-07-02

#### Verification Results
- **Tier:** Full (5 phases). The red-team already ran Fact Checker, Flow Tracer, and Scope Auditor with evidence (see Red Team Review above); this step was limited to the uncovered **Contract Verifier** role (enumerate ALL callers/readers of changed signatures) + `[UNVERIFIED]` resolution.
- **Contract Verifier — readers/writers of `code_fingerprint` (production):** enumerated 10 sites. Plan covers 8 (refresh-fingerprint F13, check-grounding Phase 3, gate-logic F2, check-grounding-tool Phase 5, loop-introspect F12, sweep F12, query-drift F5, check-grounding pure fn). **2 GAPS found** → became interview questions CV-A, CV-B (resolved below): `backfill-mechanism-check.mjs` (writes the field) and `meta-state-patch-tool.js` (forwards `code_fingerprint` patches).
- **Contract Verifier — callers of `checkGrounding`:** 2 production (check-grounding tool Phase 3, query-drift F5) + tests (cold-tier F1; `path-containment-audit-sites.test.js` calls `checkGrounding(entry,{root,now})` with no `fileIndex` → relies on the fallback being byte-identical → preserved, no change needed).
- **Contract Verifier — removal blast radius of `meta_state_refresh_fingerprint`** (per Q3 decision): manifest.json:46, build-meta-state-tools.js:12/73, self-improvement-agent.js:4/12/18, loop-introspect.js:99, meta-state-report-tool.js:44, refresh-fingerprints-pre-closeout.mjs:6/48, + 3 test files + AGENTS.md:92/170/246/271. All retarget cleanly to `refresh_file_index`. Historical `meta-state.jsonl` change-logs + `AGENTS.old.*` are immutable audit history — not edited; the Phase 5 closeout `meta_state_log_change` records the removal.
- **Claims checked:** 14 | **Verified:** 12 | **Gaps (→ interview):** 2 | **Unverified:** 0 | **`[UNVERIFIED]` tags:** 0.

#### Interview decisions (7 questions)
| # | Decision | Effect |
|---|---|---|
| CV-B | **Block `code_fingerprint` patches** in `meta_state_patch` post-deprecation (+ test) | Add `meta-state-patch-tool.js` to Phase 5 modify list; reject/drop the field with a deprecation warning |
| CV-A | **Retire `backfill-mechanism-check.mjs`** (its job is done; the index owns the hash) | Note in Phase 5; remove the legacy writer |
| F10 | **Optional `reason` arg** on `refresh_file_index`, recorded in the gate log with caller identity | Phase 4 (already drafted); confirmed optional, not mandatory |
| Q1 | **Strip the field in this plan** — add **Phase 6** | New Phase 6 (field-strip) |
| Q1-scope | **Strip VALUES from all findings (incl. terminal), KEEP the schema field** (`@deprecated`, optional) | Phase 6 strips values; the function's fallback code + 30 in-memory unit tests stay valid; rollback can't restore values (gone) — recorded as an accepted trade-off |
| Q2 | **Seed ALL `mechanism_check:true` paths incl. terminal** | Phase 5 seed script seeds all; after Phase 6 strips per-record values, terminal findings have no fallback → index entries keep the cold-tier test honest |
| Q3 | **Remove `meta_state_refresh_fingerprint` in this plan**, repoint all references to `refresh_file_index` | Phase 4 expands: remove the tool + retarget the 9 code refs + 4 AGENTS.md refs (blast radius enumerated above) |

#### Consequences of the Phase-6 strip decision (recorded, accepted by the user)
- **Rollback narrows:** once Phase 6 strips per-record values, the one-commit rollback can no longer restore per-record baselines (they're gone). Rollback reverts the *code* (checkGrounding repoint, tool removal) but the stripped values stay stripped → re-seed `code_fingerprint` is no longer possible; findings ground via the index or `hash_match:null`→`grounded` (file exists). Accepted: the index is the authoritative baseline by Phase 6.
- **F14 dual-path fallback weakens:** the auto-populate bootstrap that wrote `entry.code_fingerprint` on upsert failure loses its target (field stripped). F14 becomes: on upsert failure, log prominently + retry; no per-record bootstrap. Documented in Phase 5/6.
- **Audit-immutability exception:** stripping values from resolved/superseded findings mutates terminal records. This is an intentional, logged exception (the `meta_state_log_change` closeout records it), reversing the brainstorm's "no rewrite of audit-immutable findings" principle per explicit user decision.

### Whole-Plan Consistency Sweep (post-validation, post-propagation)
- **Files reread:** plan.md, phase-01-index-foundation.md, phase-02-hash-cache.md, phase-03-repoint-checkgrounding.md, phase-04-refresh-tool.md, phase-05-vestigial-deprecation.md, phase-06-field-strip.md.
- **Decision deltas propagated:** 7 (CV-B patch block → Phase 5; CV-A script retire → Phase 5; F10 optional reason → Phase 4; Q1+scope Phase-6 strip → new Phase 6; Q2 seed-all-incl-terminal → Phase 5; Q3 alias removal → Phase 4 rewrite). Each applied to its phase file; plan.md acceptance criteria + phases table updated to add Phase 6; the carried-open-questions list resolved.
- **Re-sweep verification (grep):** no live "keep as thin alias" claim (the only hits are the reconciliation records in this Log); no live "leave the field indefinitely" claim; Phase 4 explicitly negates the old alias framing ("NOT kept as a back-compat alias"); Phase 6 file present and referenced from the phases table + criteria; CV-B/CV-A/Q2/Q3 reflected in Phase 5 (18 marker refs).
- **Unresolved contradictions:** 0. Plan is consistent and ready for implementation pending the resolved open questions below.
