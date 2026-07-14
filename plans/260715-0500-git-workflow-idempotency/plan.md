---
title: "git-workflow idempotency: true no-op + file-index commit/regen split"
description: "Make the loop's git workflow idempotent under async code changes. (1) True no-op in upsertFileIndexEntry so re-seeding with zero code change produces zero git diff and keeps the cold-tier cache warm; (2) gitignore file-index.jsonl as a pure regen artifact + guarantee the seed precedes every consumer in CI. Finding 1 (meta-state.jsonl EOF conflict) is reframed — its description is patched to surface the two-target mismatch (human-in-the-loop cross-session handoff vs parallel-PR async flow) and kept OPEN, NOT accepted-as-fixed; the manual git merge-file --union workaround remains the operating compromise. Resolves meta-260715T0349Z; reframes (keeps open) meta-260709T1017Z. No new MCP tools, no new scripts."
status: pending
priority: P2
branch: "main"
tags: [loop, git-workflow, idempotency, file-index, tdd, runtime-agnostic]
blockedBy: []
blocks: []
created: "2026-07-14T21:10:19.139Z"
createdBy: "ck:plan"
source: skill
---

# git-workflow idempotency: true no-op + file-index commit/regen split

## Overview

Two open findings are one problem: loop-generated artifacts committed to git fight the loop's own regeneration under async writers. This plan fixes the file-index half (finding `meta-260715T0349Z`) with two changes and **reframes** the meta-state half (finding `meta-260709T1017Z`): the finding's description is patched to surface the two-target mismatch (human-in-the-loop cross-session handoff vs parallel-PR async flow) and **kept OPEN** — not accepted-as-fixed, not resolved. The reframe patch was applied 2026-07-15 (finding version 2); Phase 3 records the architectural-tension decision as a change-log and verifies the finding is open + reframed.

**Change 1 — True no-op in `upsertFileIndexEntry`** (`core/meta-state.js:679`). Today every upsert rewrites the whole `file-index.jsonl` and re-stamps `updated_at` on all 47 rows even when no `code_fingerprint` changed → dirty tree after every `pnpm test` → "5 of the last 7 commits are `chore(loop): refresh fingerprint index`". Skip the rewrite when `map.get(key) === hash`. This makes re-seed git-idempotent **and** keeps `file-index.jsonl` SHA stable so the cold-tier cache key PR #58 just wired up actually stays warm. Verified: `findings_regrounded` (`meta-state-refresh-file-index-tool.js:79-83`) is registry-derived, not write-derived, so its semantics do not change — only the JSDoc "always stamp" contract changes.

**Change 2 — Commit/regen split for `file-index.jsonl`.** It is a pure regen artifact (recomputable via `seed-file-index.mjs`). Gitignore it + `git rm --cached` so it stops dirtying the tree and stop producing churn commits. CI already runs `pnpm test` (which seeds) — but `pnpm test:cold-session` runs *before* the seed in `.github/workflows/test.yml`, so the seed must be hoisted ahead of cold-session to avoid an empty index (M2 risk B, made concrete).

**Finding 1 — REFRAME (kept open).** `meta-state.jsonl` is full-rewrite with in-place mutations (`meta-state.js:71`, `:1288`), so `merge=union` is **unsafe** (would duplicate mutated entry ids and corrupt the registry) — this rules out the only "code-free" parallel-PR mitigation that would also preserve in-PR commits. The remaining safe parallel-PR fix (post-merge logging) directly contradicts the operator's human-in-the-loop cross-session handoff (raising a finding in a branch so a later session picks it up). The file is therefore asked to serve two incompatible targets; the finding is **reframed to name that tension and kept OPEN** (version 2, patched 2026-07-15), not accepted-as-fixed. Operating compromise: keep in-PR commits (Target A wins) + manual `git merge-file --union` for the rare parallel-append case (Target B friction). True resolution = a future architectural split (separate true-append-only change-log file), deferred. Optional: `merge=union` for `runtime-state.jsonl` (true append-only, safe) — Phase 3, YAGNI-flagged.

Brainstorm report: `plans/reports/brainstorm-260715-0500-git-workflow-idempotency-report.md` (APPROVED)
Resolves: `meta-260715T0349Z-pretest-seed-dirtying-a-tracked-regen-artifact-on-every-pnpm`
Reframes (patched, kept OPEN — NOT resolved): `meta-260709T1017Z-parallel-prs-that-each-commit-append-only-meta-state-jsonl-c`
Related (out of scope): `meta-260708T0355Z-m2-single-writer-gate-...` (per-file debate for meta-state/runtime-state remains open)

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [True No-Op in upsertFileIndexEntry (TDD)](./phase-01-true-no-op-in-upsertfileindexentry-tdd.md) | Pending |
| 2 | [File-Index Commit/Regen Split](./phase-02-file-index-commit-regen-split.md) | Pending |
| 3 | [Resolve Findings + Optional Union](./phase-03-resolve-findings-optional-union.md) | Pending |

## Dependencies

- **Blocked by:** none. `260714-2012-meta-state-refresh-cache-and-pretest` (the PR #58 pretest-seed plan) is **completed** and is a prerequisite context, not a blocker.
- **Cross-plan:** `260711-0030-stateless-mcp-for-parallel-operation` (pending) is a separate parallel-operation workstream; no blocking relationship — this plan does not depend on MCP statelessness and vice versa.
- **Blocks:** none.

## Acceptance Criteria

1. `pnpm test` run twice in a row with zero code change → `git diff --stat file-index.jsonl` empty (Phase 1).
2. A code edit to one cited file → `file-index.jsonl` (if still tracked during Phase 1 verification) changes only that one row, not all rows.
3. After Phase 2: `git status` never reports `file-index.jsonl`; a fresh clone + `pnpm test` regenerates a full index; `pnpm test:cold-session` passes against a seeded index (CI ordering fixed).
4. No regression in `file-index.test.js`, cold-tier-regression, grounding, or gate tests.
5. `meta-260715T0349Z` resolved (fixed); `meta-260709T1017Z` patched to reframe the two-target mismatch and kept OPEN (version 2), with a change-log recording the architectural-tension decision.

## Notes

- Mode: default + `--tdd` (tests-first per phase). No `--hard`/`--deep`, so red-team and validation are **not** auto-run; they are offered at the post-plan handoff.
- Convention: no new MCP tools, no new scripts (matches PR #58). Change 1 is ~3 lines + JSDoc; Change 2 is `.gitignore` + `git rm --cached` + a CI step reorder.