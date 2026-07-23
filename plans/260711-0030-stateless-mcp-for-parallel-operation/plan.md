---
title: "Stateless MCP adapter for parallel operation"
description: "Make the MCP server a stateless adapter over the file-based core (L1), add cross-process file lock on writeEntry (kills H7 race + 5 transport findings), drop the in-process idempotency cache (was masking silent-persistence-fail), add post-write visibility re-read (kills T4 + T5 + latent C16), ship per-worktree .loop-version + session-id (closes the open Multi-Session Isolation gap and enables safe parallel PR operation), and add cross-process cache invalidation + schema-version-skew detection. Bridge 5 already shipped (status: completed in plan 260613-1853) — no work re-shipped."
status: completed
priority: P1
branch: "main"
tags: [mcp, stateless, parallel-operation, cross-process-lock, schema-version-skew, multi-session-isolation, h7, t4, t5, bridge-5-already-shipped]
blockedBy: []
blocks: ["260709-1237-wire-format-coverage-guardrail"]
created: "2026-07-10T17:32:23.714Z"
createdBy: "ck:plan"
source: skill
related:
  - plans/reports/from-predict-debate-to-operator-stateless-mcp-parallel-260711-0030-report.md (predict report; 5-persona debate)
  - plans/reports/from-root-cause-to-transport-decision-260711-0011-mcp-stateless-adapter-vs-cli-report.md (prior decision report; Unresolved Question #2 — shell-hook-only contract gap)
  - meta-260711T0125Z-docs-runtime-contract-md-has-a-transport-agnostic-contract-g (follow-up finding filed by this plan; shell-hook-only vs Capability 3 contract gap; deferred to follow-up plan per the prior report's recommendation)
  - docs/runtime-contract.md (L2 transport-agnostic contract; Phase 6 adds 1-sentence stateless adapter invariant)
  - plans/reports/from-debugger-to-operator-260710-2350-meta-260619T2233Z-phase1-root-cause-investigation-report.md (Phase 1 root cause)
  - plans/260613-1853-phase-b-bridge-5-core-fix/plan.md (Bridge 5; status: completed; schema as source of truth; this plan builds on it)
  - plans/260709-1237-wire-format-coverage-guardrail/plan.md (wire-format coverage guardrail; ships after this plan)
  - meta-260619T2233Z-the-meta-state-log-change-mcp-tool-can-return-logged-true-an (T4; open; this plan resolves)
  - meta-260626T1419Z-meta-state-supersede-silent-persistence-fail-var (T5; open; this plan resolves)
  - meta-260606T2106Z-agent-called-meta-state-log-change-mcp-tool-5-times-in-succe (T1; predecessor)
  - meta-260606T0155Z-loop-surface-inject-spawnandcall-chicken-egg (T2; fixed in meta-260606T0200Z)
  - meta-260609T2116Z-tools-learning-loop-mastra-server-js-process-env-isolation (T3; change-log; this plan makes moot)
  - meta-260610T1859Z-agent-stuck-in-meta-state-refresh-fingerprint-loop-for-53-mi (T6; partially fixed in loop-design-meta-state-refresh-fingerprint-loop-circuit-breaker)
  - meta-260610T0115Z-meta-state-patch-array-wrap-and-passthrough-recursion-bug (T7; resolved structurally by Bridge 5)
  - docs/architecture.md §315–376 (F1–F13 known issues)
  - docs/architecture.md §378–383 (Multi-Session Isolation gap; this plan resolves)
  - docs/runtime-contract.md § Transport mapping (4 capabilities × 3 transports)
  - docs/loop-engine.md (engine invariant; L1)
  - tools/learning-loop-mastra/core/meta-state.js:535–551 (writeEntry; Phase 1 target)
  - tools/learning-loop-mastra/core/meta-state.js:560–621 (updateEntry; Phase 3 target)
  - tools/learning-loop-mastra/tools/handlers/meta-state-log-change-tool.js:10 (idempotency cache; Phase 2 target)
  - tools/learning-loop-mastra/core/update-entry-helpers.js (applyUpdateAndCheck; Phase 3 helper)
  - tools/learning-loop-mastra/core/inbound-state.js (Phase 5 target)
  - .gitignore:18–20 (`.last-operator-message` gitignore pattern; Phase 4 precedent)
  - .gitignore:21 (`.inbound-stale-surfaced` gitignore pattern; Phase 5 precedent)
---

# Plan: Stateless MCP Adapter for Parallel Operation

## Overview

Make the MCP server a **stateless adapter over the file-based core** (L1). The 7 transport findings audited in `plans/reports/from-predict-debate-to-operator-stateless-mcp-parallel-260711-0030-report.md` (T1–T7) all reduce to "in-process state as correctness surface." Adding a cross-process file lock on `writeEntry` (Phase 1) plus dropping the in-process idempotency cache (Phase 2) plus post-write visibility re-read (Phase 3) closes the silent-persistence-fail class structurally. The per-worktree `.loop-version` file (Phase 4) and per-worktree session ID (Phase 5) close the parallel-operation gaps the prior report didn't address. Phase 6 (formerly Phase 7) closes the originating findings and files the change-log.

**TDD structure (per `--tdd` flag):** Each phase writes the RED regression test first (in a `__tests__/legacy-mcp/<phase>-red.test.cjs` or sibling file), then implements the minimum code that turns RED → GREEN. The existing 862-test suite is the regression guard.

**Bridge 5 already shipped** (status: completed in plan 260613-1853-phase-b-bridge-5-core-fix). The wire-format recursion bug (T7) was closed structurally by Bridge 5's schema-as-source-of-truth work; this plan does NOT re-ship it. No work duplication.

## Context Links

- **Predict report** (5-persona debate): `plans/reports/from-predict-debate-to-operator-stateless-mcp-parallel-260711-0030-report.md`
- **Prior decision report** (Phase 1 → transport decision): `plans/reports/from-root-cause-to-transport-decision-260711-0011-mcp-stateless-adapter-vs-cli-report.md`
- **Phase 1 root cause** (H7 cross-process race hypothesis): `plans/reports/from-debugger-to-operator-260710-2350-meta-260619T2233Z-phase1-root-cause-investigation-report.md`
- **Bridge 5 (already shipped)**: `plans/260613-1853-phase-b-bridge-5-core-fix/plan.md`
- **Wire-format coverage guardrail** (follow-up plan): `plans/260709-1237-wire-format-coverage-guardrail/plan.md`
- **Architecture known issues** (F1–F13): `docs/architecture.md` §315–376
- **Multi-Session Isolation gap** (this plan resolves): `docs/architecture.md` §378–383
- **Transport contract**: `docs/runtime-contract.md` § Transport mapping

## Architecture

### The invariant

> **L2 is a stateless adapter over file-based L1.**

L1 (`tools/learning-loop-mastra/core/`) owns the data model and consistency. L2 (`tools/learning-loop-mastra/mastra/`) owns the tool surface; it holds **no correctness-critical in-process state**. Today L2 grew in-process state (`enqueue` Map, `_idempotencyCache`, LRU cache, long-lived process). The bug is not the abstraction — it is the violation. Fix = enforce the existing layer invariant.

### What changes

| Today | After this plan |
|---|---|
| Per-process `enqueue` Map serializes within process only | Cross-process file lock serializes across processes |
| In-process 60s idempotency cache masks silent-persistence-fail | Dropped; idempotency derived from durable registry (`id` + `created_at`) |
| Handler trusts `await writeEntry(...)` and constructs `{logged: true, ...}` unconditionally | Handler re-reads registry after `writeEntry` and asserts entry visible; if absent, returns structured error |
| Marker file (`.last-operator-message`) shared across all sessions in same project | Marker file scoped per worktree (`${sessionId}` suffix) |
| No version declaration between worktrees | `.loop-version` file in each worktree; `meta_state_log_change` rejects unknown schema branches |
| Sidecar cache + LRU are correct within process | Same correctness across processes via file mtime+size checks under lock |

### Architectural decisions

| Decision | Choice | Rationale |
|---|---|---|
| File locking primitive | **`proper-lockfile`** (npm pkg, wraps `fs.openSync(O_EXCL)` retries) | Smallest dependency; cross-platform (Win/Mac/Linux); WSL2-safe; precedent: `tools/learning-loop-mastra/core/bound-artifacts.js:72` already warns about poisoning without "single-writer queue." |
| Lock scope | **Registry file** (`meta-state.jsonl`) only | Read-modify-write races are the issue; LRU/sidecar invalidation happens inside the same critical section |
| Lock location | **`core/meta-state.js`** (L1) | Transport-correct: any L2 transport (MCP, library-import, future shell-hook-only) gets the lock for free |
| Idempotency after Phase 2 | **Dedupe via registry**, not cache | The registry's `id` + `created_at` is the source of truth; replay protection via `meta_state_list({id:...})` post-write |
| `.loop-version` file path | `<root>/.loop-version` | Per-worktree; gitignored (same pattern as `.last-operator-message`) |
| Session ID generation | **Worktree-aware**: `git rev-parse --show-toplevel` → sha256 prefix | A worktree is identified by its git toplevel; if absent (no git), fall back to `${pid}-${starttime}` |
| Cache invalidation trigger | **File mtime+size check on every read** | Same pattern as today's LRU cache; cross-process correct because every writer bumps mtime |
| Schema-version-skew detection | **Reject** writes with `schema_branch` not in current registry's `metaStateEntrySchema` discriminator union | Fails loudly; agent sees structured error; cross-worktree confusion is bounded |

## Phases

| Phase | Name | Status | TDD Color | Dependencies |
|-------|------|--------|-----------|--------------|
| 1 | [phase-01-cross-process-file-lock](./phase-01-phase-01-cross-process-file-lock.md) | Pending | RED (1 test) → GREEN | — |
| 2 | [phase-02-drop-in-process-idempotency-cache](./phase-02-phase-02-drop-in-process-idempotency-cache.md) | Pending | RED (2 tests) → GREEN | Phase 1 |
| 3 | [phase-03-post-write-visibility-reread](./phase-03-phase-03-post-write-visibility-reread.md) | Pending | RED (3 tests) → GREEN | Phase 2 |
| 4 | [phase-04-per-worktree-loop-version](./phase-04-phase-04-per-worktree-loop-version.md) | Pending | RED (2 tests) → GREEN | Phase 3 |
| 5 | [phase-05-per-worktree-session-id](./phase-05-phase-05-per-worktree-session-id.md) | Pending | RED (2 tests) → GREEN | — (parallel to 1–4) |
| ~~6~~ | ~~phase-06-cross-process-cache-invalidation~~ | **REMOVED** | n/a (no-op) | n/a |
| 6 | [phase-07-close-findings-and-changelog](./phase-07-phase-07-close-findings-and-changelog.md) | Pending | CLOSE | Phases 1–5 |

**Total effort estimate:** ~5.5h (RED tests ~1.5h, GREEN implementation ~2.5h, validation + change-log ~1.5h; Phase 6 deleted)

> **Phase 6 removed:** Red-team review (3-reviewer consensus) found `tools/learning-loop-mastra/core/loop-introspect-cache.js:31-45` already validates the sidecar cache by `registry_sha256`; `read-registry-cache.js:21-38` already validates the LRU cache by mtime+size under the Phase 1 lock. The original Phase 6 work was a no-op.

## Dependencies

### Outgoing

- **Blocks** `plans/260709-1237-wire-format-coverage-guardrail/` — that plan depends on the file lock being present for its concurrency tests.

### Incoming

- **None.** This plan is foundational — it ships the lock + idempotency drop + post-write re-read + per-worktree primitives that other plans can build on.

### Already-shipped (NOT re-shipped)

- **Bridge 5** (schema as source of truth): status `completed` in `plans/260613-1853-phase-b-bridge-5-core-fix/plan.md`. The wire-format recursion bug (T7) is structurally closed. This plan does NOT re-implement Bridge 5.

## Acceptance Criteria

- [ ] H7 cross-process race is impossible: 2 child processes firing parallel `meta_state_log_change` from independent Node processes → 0 entries lost (Phase 1 RED test passes)
- [ ] In-process idempotency cache removed: 2 calls within 60s with identical args write 2 entries (Phase 2 RED test passes)
- [ ] Post-write visibility re-read: if `writeEntry` returns without persisting, the handler returns a structured error (Phase 3 RED test passes)
- [ ] T4 (`meta-260619T2233Z`) and T5 (`meta-260626T1419Z`) resolved via `meta_state_supersede` → change-log entries (Phase 6)
- [ ] Multi-Session Isolation gap closed: marker file scoped per session; 2 sessions in same project don't share state (Phase 5 RED test passes)
- [ ] `.loop-version` file gitignored (Phase 4)
- [ ] Schema-version-skew detection: write rejected with structured error if `schema_branch` unknown (Phase 4 RED test passes)
- [ ] Existing 862-test suite still passes (no regressions)
- [ ] `loop_describe` cold tier still loads from `records/meta/.cache/loop-describe-cold.json` (cross-process correctness for sidecar cache)
- [ ] Phase 6 change-log entry files via `meta_state_log_change` with `consolidates: meta-260619T2233Z,meta-260626T1419Z`

## Files Modified Summary

### Create

- `tools/learning-loop-mastra/__tests__/legacy-mcp/cross-process-file-lock.test.cjs` (Phase 1 RED)
- `tools/learning-loop-mastra/__tests__/legacy-mcp/drop-idempotency-cache.test.cjs` (Phase 2 RED)
- `tools/learning-loop-mastra/__tests__/legacy-mcp/post-write-visibility-reread.test.cjs` (Phase 3 RED)
- `tools/learning-loop-mastra/__tests__/legacy-mcp/per-worktree-loop-version.test.cjs` (Phase 4 RED)
- `tools/learning-loop-mastra/__tests__/legacy-mcp/per-worktree-session-id.test.cjs` (Phase 5 RED)
- `tools/learning-loop-mastra/core/registry-lock.js` (Phase 1; thin wrapper around `proper-lockfile`)
- `tools/learning-loop-mastra/core/worktree-version.js` (Phase 4; reads/writes `.loop-version`)
- `tools/learning-loop-mastra/core/worktree-session-id.js` (Phase 5; derives session ID from worktree)

### Modify

- `tools/learning-loop-mastra/core/meta-state.js` (Phases 1, 3, 4: writeEntry + updateEntry + metaStateEntrySchema)
- `tools/learning-loop-mastra/core/update-entry-helpers.js` (Phase 3: extend applyUpdateAndCheck to re-read)
- `tools/learning-loop-mastra/tools/handlers/meta-state-log-change-tool.js` (Phases 2, 3: drop cache + add re-read)
- `tools/learning-loop-mastra/tools/handlers/meta-state-refresh-file-index-tool.js` (Phase 2: extend scope per Finding 15)
- `tools/learning-loop-mastra/tools/handlers/meta-state-supersede-tool.js` (Phase 3: add re-read)
- `tools/learning-loop-mastra/tools/handlers/meta-state-resolve-tool.js` (Phase 3: add re-read; closes latent C16)
- `tools/learning-loop-mastra/tools/handlers/meta-state-re-verify-tool.js` (Phase 3: add re-read)
- `tools/learning-loop-mastra/hooks/universal/inbound-gate.js:60` (Phase 5: per-worktree marker write; CORRECTED per Finding 2)
- `tools/learning-loop-mastra/core/inbound-state.js` (Phase 5: per-worktree marker read)
- `tools/lib/resolve-root.js` (Phase 1: restrict GATE_ROOT to canonical test dir per Finding 5)
- `.gitignore` (Phase 1: add `.meta-state.lock`; Phase 4: add `.loop-version`)
- `docs/architecture.md` §378–383 (Phase 5: flip "Multi-Session Isolation" from "open" to "resolved")
- `docs/runtime-contract.md` §3 (Phase 2: add trust-boundary note per Finding 3)
- `docs/runtime-contract.md` §"The 4 capabilities" (Phase 6: prepend 1-sentence stateless adapter invariant)
- `tools/scripts/enable-operator-mode.sh` (Phase 6: mark as legacy / no-op)
- `.env.example:29-32` (Phase 6: remove stale `OPERATOR_MODE=` block)

### Delete

- `_idempotencyCache` references in `meta-state-log-change-tool.js` (Phase 2)

## Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| File lock contention under high concurrency | Medium | Lock scope is registry file only; release immediately after rename; `proper-lockfile` default timeout is 10s |
| Bridge 5 already-shipped confusion | Low | plan.md frontmatter `related` lists 260613-1853 explicitly; Phase 6 verifies no duplicate work |
| Schema-version-skew false positives | Low | Only reject when `schema_branch` is explicitly declared; backwards-compat: omit branch = current branch accepted |
| Migration of existing per-worktree state | Medium | `.loop-version` is generated lazily on first read (no migration); session ID falls back to `${pid}-${starttime}` for non-git dirs |
| Test runtime overhead (cross-process tests fork Node) | Low | Use `--experimental-vm-modules` or child_process spawn; one-time ~5s per test |

## Open Questions

None at plan-creation time. The two operator-flagged open questions from the predict report are resolved:

1. **`.loop-version` gitignored?** — **YES**, same pattern as `.last-operator-message` (`.gitignore:18–20`). Per-worktree runtime state should not be committed; committing it would conflate "this branch's L2 version" with "this branch's loop code."
2. **Ship Bridge 5 in same plan?** — **Bridge 5 already shipped** (status: completed in plan 260613-1853). No work duplication; this plan builds on Bridge 5's schema-as-source-of-truth work, doesn't re-ship it.

### Deferred to follow-up finding (not open for THIS plan)

- **Shell-hook-only contract gap** (Capability 3 vs "no tool channel" underspecification). Filed as `meta-260711T0125Z-docs-runtime-contract-md-has-a-transport-agnostic-contract-g` (status: open, severity: warning). Pre-existing L2 design question raised in `plans/reports/from-root-cause-to-transport-decision-260711-0011-mcp-stateless-adapter-vs-cli-report.md` Unresolved Question #2. This plan's scope is the wired MCP+hooks transport; the contract gap is a separate design question for any future non-MCP transport. Resolution requires an operator decision on (a) read-only shell-hook-only vs (b) CLI-as-tool-channel.

## Post-Plan Handoff

After all phases complete + Phase 6 change-log filed, recommend `/ck:cook plans/260711-0030-stateless-mcp-for-parallel-operation/plan.md` for implementation. The plan is small enough to cook directly without further red-team or validation gates (those ran in the predict report + Bridge 5 already-shipped context).

## Red Team Review

### Session — 2026-07-11
**Reviewers:** Security Adversary · Failure Mode Analyst · Assumption Destroyer · Scope & Complexity Critic (full panel, 4 lenses per 6+ phases rule)
**Findings:** 25 unique after dedup; 15 surfaced (capped per workflow)
**Severity breakdown:** 3 Critical · 8 High · 4 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Phase 6 references dissolved `OPERATOR_MODE=1` gate; closeout silently fails | Critical | Accept | Phase 6 risk assessment + Step 6.0 preflight |
| 2 | Phase 5 modifies wrong file (`inbound-state.js` has no writer; actual writer is `inbound-gate.js:60`) | Critical | Accept | Phase 5 target file list + Architecture |
| 3 | Phase 2 drops `_idempotencyCache` without replacement → registry poisoning by untrusted agent | Critical | Accept | Phase 2 trust-boundary documentation |
| 4 | Symlink attack on `.claude/coordination/.registry.lock` widens file-overwrite surface | High | Accept | Phase 1 — move lock to `<root>/.meta-state.lock` |
| 5 | TOCTOU between `resolveRoot()` and `writeEntry` — `root` is caller-controlled | High | Accept | Phase 1 — restrict GATE_ROOT to canonical test dir |
| 6 | `git rev-parse` PATH-hijackable in Phase 5 | High | Accept | Phase 5 — use absolute git binary path |
| 7 | `.loop-version` lazy-create race + supply-chain poisoning | High | Accept | Phase 4 — move lazy-create inside `withRegistryLock`; Zod-validate |
| 8 | **Phase 6 is a no-op** (sidecar cache already validates by sha256) | High | Accept | **DELETE Phase 6** |
| 9 | `.registry.lock` not in `.gitignore` | High | Accept | Phase 1 — add to `.gitignore` |
| 10 | Lock directory not pre-created — `proper-lockfile` throws ENOENT on first call | High | Accept | Phase 1 — `mkdirSync(dirname(lockPath), { recursive: true })` in `withRegistryLock` |
| 11 | Phase 5 ignores multi-surface iteration — one session ID maps to 3 surfaces | High | Accept | Phase 5 — per-surface scoped ID |
| 12 | Phase 1 `stale: 5000` steals lock from slow legitimate writers | Medium | Accept | Phase 1 — reduce `BATCH_SIZE_LIMIT` to 100 OR raise `stale` to 30s with `realpath: true` |
| 13 | Phase 3 RED test uses ESM namespace mutation pattern that won't work | Medium | Accept | Phase 3 — restructure RED test (delete registry between write and assert; or refactor handler) |
| 14 | RED test may pass without lock on fast filesystems | Medium | Accept | Phase 1 — `setTimeout(50)` in critical section OR 50 writes/child |
| 15 | Phase 2 sibling `cache_hit` anti-pattern in `meta-state-refresh-file-index-tool.js` | Medium | Accept | Phase 2 — extend scope OR file follow-up plan |

**Rejected findings:** 10 (lower-priority or already-addressed; full list in `reports/from-red-team-to-planner-consolidated-findings-260711-0050-report.md`).

### Whole-Plan Consistency Sweep

After red-team edits, re-read plan.md and every phase-*.md file. Reconcile:
- ✅ Phase 6 row marked REMOVED in plan.md Phases table
- ✅ Phase 7 frontmatter updated to `phase: 6` (renumbered after Phase 6 deletion)
- ✅ All "Phase 6" references in plan.md replaced with skip-notation
- ✅ Cross-references between phases consistent (Phase 7 depends on Phases 1–5, not 1–6)