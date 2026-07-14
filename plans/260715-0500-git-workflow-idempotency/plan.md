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

**Change 1 — True no-op in `upsertFileIndexEntry`** (`core/meta-state.js:679`). Today every upsert rewrites the whole `file-index.jsonl` and re-stamps `updated_at` on all 47 rows even when no `code_fingerprint` changed → dirty tree after every `pnpm test` → "5 of the last 7 commits are `chore(loop): refresh fingerprint index`". Skip the rewrite when `map.get(key) === hash`. This makes re-seed git-idempotent **and** keeps `file-index.jsonl` SHA stable so the cold-tier cache key PR #58 just wired up actually stays warm **on no-change re-seeds after the first cold build**. The cache key is `sha256(contents)` (`loop-introspect-cache.js:35-40`), the cache file is gitignored (`.gitignore:33`), so first post-merge CI run always builds cold; subsequent no-change runs stay warm. Registry churn that adds/removes cited paths still shifts seed iteration order → SHA changes → cache miss. Verified: `findings_regrounded` (`meta-state-refresh-file-index-tool.js:79-83`) is registry-derived, not write-derived, so its semantics do not change — only the JSDoc "always stamp" contract changes.

**Change 2 — Commit/regen split for `file-index.jsonl`.** It is a pure regen artifact (recomputable via `seed-file-index.mjs`). Gitignore it + `git rm --cached` so it stops dirtying the tree and stop producing churn commits. CI already runs `pnpm test` (which seeds) — but `pnpm test:cold-session` runs *before* the seed in `.github/workflows/test.yml`, so the seed must be hoisted ahead of cold-session to avoid an empty index (M2 risk B, made concrete). The new CI seed step passes `--root=$GITHUB_WORKSPACE` explicitly (the script's `resolveRoot()` default is not safe in CI without `GATE_ROOT`) and must never run with `SKIP_PRESEED=1` set in the workflow env.

**Finding 1 — REFRAME (kept open).** `meta-state.jsonl` is full-rewrite with in-place mutations (`meta-state.js:71`, `:1288`), so `merge=union` is **unsafe** (would duplicate mutated entry ids and corrupt the registry) — this rules out the only "code-free" parallel-PR mitigation that would also preserve in-PR commits. The remaining safe parallel-PR fix (post-merge logging) directly contradicts the operator's human-in-the-loop cross-session handoff (raising a finding in a branch so a later session picks it up). The file is therefore asked to serve two incompatible targets; the finding is **reframed to name that tension and kept OPEN** (version 2, patched 2026-07-15), not accepted-as-fixed. Operating compromise: keep in-PR commits (Target A wins) + manual `git merge-file --union` for the rare parallel-append case (Target B friction). True resolution = a future architectural split (separate true-append-only change-log file), deferred. **`runtime-state.jsonl merge=union` ships in Phase 3** (Validation Session 1): `.gitattributes` entry as defense in depth — `runtime-state.jsonl` is true append-only so the merge is safe; tiny diff; cheap to revert.

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
2. A code edit to one cited file → `file-index.jsonl` (still tracked during Phase 1 verification) is rewritten, but Phase 1's no-op guard means only changed-hash re-seeds trigger a rewrite; no-code-change re-seeds are byte-stable (per `meta-state.js:699-701` all rows get a fresh `updated_at` on changed writes — the existing re-stamp-everything contract is preserved, not narrowed).
3. After Phase 2: `git status` never reports `file-index.jsonl`; a fresh clone + `pnpm test` regenerates a full index; `pnpm test:cold-session` passes against a seeded index (CI ordering fixed).
4. No regression in `file-index.test.js`, cold-tier-regression, grounding, or gate tests.
5. `meta-260715T0349Z` resolved (fixed) AFTER preflight (`meta_state_query_drift` clean + `meta_state_refresh_file_index` for edited paths); `meta-260709T1017Z` patched to reframe the two-target mismatch and kept OPEN (version 2), with a change-log recording the architectural-tension decision. PROCESS_HINTS row 8 patched (NOT appended) with the untracked-regen-artifact fact; length-assertion test stays at `=== 9`.

## Notes

- Mode: default + `--tdd` (tests-first per phase). No `--hard`/`--deep`, so red-team and validation are **not** auto-run; they are offered at the post-plan handoff.
- Convention: no new MCP tools, no new scripts (matches PR #58). Change 1 is ~3 lines + JSDoc; Change 2 is `.gitignore` + `git rm --cached` + a CI step reorder.
- **Validation Session 1 (2026-07-15):** all 3 phases ship in ONE PR (commit order Phase 1 → 2 → 3). PR surface: ~30 lines code + 1 workflow step + 1 file-entry gitignore + 1 metadata-fingerprint refresh + 1 registry resolve + 2 change-logs + 1 PROCESS_HINTS patch + 1 .gitattributes.

## Validation Log

### Session 1 — 2026-07-15
**Trigger:** Post-red-team critical-questions interview before `/ck:cook` handoff. 5 questions asked across validation settings (mode=prompt, questions=3-8).

#### Questions & Answers

1. **[Risks]** Phase 2 Risk 4 — `seed-file-index.mjs` honors `SKIP_PRESEED` at line 38-41, so the new CI step is NOT exempt. If any CI env var sets `SKIP_PRESEED=1`, the seed silently exits 0 and reintroduces the empty-index failure. How should Phase 2 harden against this?
   - Options: Wrap with `env -u SKIP_PRESEED` | Add `--force` flag to script | Document-only
   - **Answer:** Wrap with `env -u SKIP_PRESEED`
   - **Rationale:** zero script changes, smallest diff, explicit at call site.

2. **[Architecture]** PR strategy — the plan has 3 phases. How should they ship?
   - Options: Two PRs (Phase 1+2, then Phase 3) | One PR (all 3 phases) | Three PRs
   - **Answer:** One PR (all 3 phases)
   - **Rationale:** smaller total cycle time; commit order Phase 1→2→3 keeps review surface linear.

3. **[Scope]** Phase 3 C1 — refine `meta_state_refresh_file_index` to return `status: "no-op"` on an unchanged path?
   - Options: Ship C1 (status only) | Skip C1
   - **Answer:** Ship C1 (status only)
   - **Rationale:** `cache_hit: false` contract preserved; small signal improvement.

4. **[Scope]** Phase 3 C2 — local `pnpm test:cold-session` does NOT seed before running. After Phase 2's gitignore, fresh-clone local runs hit an empty index. Fix?
   - Options: Prepend seed to test:cold-session | Document-only | Skip
   - **Answer:** Prepend seed to test:cold-session
   - **Rationale:** symmetry with `pnpm test`; only after reading `cold-session-discoverability.test.cjs` to confirm no empty-index assertion.

5. **[Scope]** Phase 3 C3 — `runtime-state.jsonl merge=union` (true append-only, safe). No observed parallel-append conflict yet. Ship?
   - Options: Skip C3 (YAGNI) | Add .gitattributes now
   - **Answer:** Add .gitattributes now
   - **Rationale:** defense in depth; tiny diff; cheap to revert.

#### Confirmed Decisions
- SKIP_PRESEED mitigation: `env -u SKIP_PRESEED` wrap at the CI step call site.
- PR packaging: single PR, fixed commit order (Phase 1 → 2 → 3).
- C1: ship — `status: "no-op"` returned on unchanged path; `cache_hit` unchanged.
- C2: ship — prepend seed prefix to `package.json` `test:cold-session` (after reading the cold-session test for fixture-against-absence assertions).
- C3: ship — `.gitattributes` with `runtime-state.jsonl merge=union` + comment.

#### Action Items
- [x] Phase 2 Implementation Step 3: `env -u SKIP_PRESEED` wrap + comment.
- [x] Phase 2 Risk Assessment 4: rewrite with chosen mitigation.
- [x] Phase 3 Section C: convert three optional refinements to REQUIRED with Validation Session 1 attribution.
- [x] Phase 3 Implementation Steps: commit order Phase 1 → 2 → 3.
- [x] Phase 3 Risk Assessment: add RISK 4 (single-PR complexity), refactor RISK 3 (C2 fixture conflict now required).
- [x] Plan-level Notes: single-PR packaging note.

#### Impact on Phases
- **Phase 2:** RISK 4 mitigation now concrete (`env -u` wrap); Implementation Step 3 carries the rationale.
- **Phase 3:** Section C promoted to "Required refinements (Validation Session 1)" with all three shipped; Implementation Steps 4-6 finalized; Risk Assessment adds RISK 4 (single-PR complexity); success criteria now demand C1/C2/C3 outcomes (not "if C1/C2/C3").

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-..., phase-02-..., phase-03-...
- Decision deltas checked: 5 (Validation Session 1 answers)
- Reconciled stale references: 6
  - Phase 2 Risk 4: "Pick one before merging" → concrete `env -u SKIP_PRESEED` mitigation.
  - Phase 3 Section C header: "Optional refinements (decide per-item)" → "Required refinements (Validation Session 1 — all three shipped)".
  - Phase 3 RISK 4: "scope creep via C3" → C3 ships (defense in depth).
  - Phase 3 Overview: removed "optional `runtime-state.jsonl merge=union` YAGNI-flagged add-on"; now C3 SHIPS.
  - Plan.md Finding 1 paragraph: "Optional: `merge=union` for `runtime-state.jsonl`" → "ships in Phase 3 (Validation Session 1)".
  - Plan-level Notes: added single-PR packaging line.
- Unresolved contradictions: 0

## Red Team Review

### Session — 2026-07-15
**Reviewers:** Security Adversary (Fact Checker), Failure Mode Analyst (Flow Tracer), Assumption Destroyer (Scope Auditor)
**Findings:** 15 (15 accepted, 0 rejected)
**Severity breakdown:** 5 Critical, 5 High, 5 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Phase 2 Risk 4 + new CI seed step claim "does not honor `SKIP_PRESEED`" is factually wrong — `seed-file-index.mjs:38-41` honors it | Critical | Accept | Phase 2 |
| 2 | Phase 3B PROCESS_HINTS row at `loop-introspect.js:137` already exists (PR #58); appending a 10th row breaks `length === 9` assertion | Critical | Accept | Phase 3 |
| 3 | Phase 1 acceptance criterion #2 ("unchanged rows' `updated_at` preserved") is unsatisfiable by the stated implementation — `meta-state.js:699-701` re-stamps all rows on any write | Critical | Accept | Phase 1 |
| 4 | Phase 3A `meta_state_resolve` will hit the consult-gate orphan-evidence rule (`gate-logic.js:661-721` + `meta-state-resolve-tool.js:84-117`) without preflight | Critical | Accept | Phase 3 |
| 5 | Cold-tier cache "stays warm" overstated — cache key is `sha256(contents)` per `loop-introspect-cache.js:35-40`, not git blob; registry churn shifts seed iteration order | Critical | Accept | plan.md, Phase 1 |
| 6 | Phase 3 "4-file parity mirror" misattributes arrays (HINT_KEY_MAP_PROCESS lives in `loop-get-instruction-tool.js:24,50`, NOT `core/loop-introspect.js`) AND count is wrong (only 3 storage sites for PROCESS_HINTS) | High | Accept | Phase 3 |
| 7 | Phase 1 JSDoc step refers to non-existent `@returns` tag at `meta-state.js:673-677` (prose-only convention) | High | Accept | Phase 1 |
| 8 | Phase 2 `.gitignore` comment embeds plan ID — violates stable-code-artifact rule | High | Accept | Phase 2 |
| 9 | Phase 3 C1 changes documented `cache_hit: false` contract (`meta-state-refresh-file-index-tool.js:34`); drop the `cache_hit: true` change, audit consumers, or update description | High | Accept | Phase 3 |
| 10 | Phase 2 CI seed step `run: node .../seed-file-index.mjs` defaults to `resolveRoot()` without passing `--root=`. May fail silently in CI | High | Accept | Phase 2 |
| 11 | Phase 2 `.gitignore` edit + `git rm --cached` must be a single commit in working-tree order (`.gitignore` first) | Medium | Accept | Phase 2 |
| 12 | Phase 1 no-op test asserts bytes+mtime but does NOT verify `_invalidateFileIndexCache` was NOT called; dynamic sibling test `cold-session-discoverability.test.cjs:401-415` was omitted from Phase 3 parity list | Medium | Accept | Phase 1 + Phase 3 |
| 13 | `gate-self-verify.mjs:68,71` is a third regen path the plan did not acknowledge | Medium | Accept | Phase 2 |
| 14 | Phase 2 RISK 1 rationale partially wrong — cold-session tests at `cold-session-discoverability.test.cjs:1-79,30` do NOT read `file-index.jsonl`; seed step is defense-in-depth | Medium | Accept | Phase 2 |
| 15 | Plan says "If `meta_state_resolve` errors on already-terminal" but the tool returns `{ resolved: false, reason: 'already_terminal', current_status }` (no exception) | Medium | Accept | Phase 3 |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-..., phase-02-..., phase-03-...
- Decision deltas checked: 15
- Reconciled stale references: 7
  - Phase 1 acceptance criterion #2 (per-row updated_at) rewritten to align with existing contract at `meta-state.js:699-701` — removed unsatisfiable language.
  - Phase 1 Architecture note: dropped misleading `cache_hit: true` reference; replaced with "Phase 3 refines `status` only, `cache_hit` stays `false` per contract".
  - Phase 2 `.gitignore` comment: removed plan ID; placement moved from `docs/registry-summary.md` neighborhood to `.cold-session-sentinel.json` neighborhood.
  - Phase 2 CI seed step: added `--root=$GITHUB_WORKSPACE`; acknowledged SKIP_PRESEED honored via `seed-file-index.mjs:38-41`.
  - Phase 3 "4-file parity mirror" → "PATCH row 8 (3 storage sites)"; no length assertion bump.
  - Phase 3 C1: dropped `cache_hit: true` change (kept contract `cache_hit: false`); audit no longer needed.
  - Phase 3 preflight added (`meta_state_query_drift` + `meta_state_refresh_file_index`) before `meta_state_resolve`.
- Unresolved contradictions: 0