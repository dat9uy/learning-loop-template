---
title: "Rec 5 + Rec 6: legacy/ rename to canonical dirs + L1 memory-substrate paragraph"
description: "Rec 5: rename the live `legacy/` dirs to descriptive canonical names (tools/legacy/→tools/handlers/, hooks/legacy/→hooks/universal/, scout/legacy/→scout/pipeline/, mastra/legacy-handler-adapter.js→mastra/handler-adapter.js) and update every import-path + cross-runtime gate reference in lockstep, so `legacy/` is reserved for dead code and a future cleanup agent cannot mis-delete canonical code on the name. Rec 6: add the 'three stores realize it' half of the memory-substrate statement to docs/loop-engine.md (L1) to close the Rec 7 seam. Operator decision 2026-07-09 (UQ4 = Option A, descriptive subdirs)."
status: pending
priority: P2
branch: "main"
tags: [rec-5, rec-6, legacy-rename, l1-docs, two-surfaces]
blockedBy: []
blocks: []
created: "2026-07-09T00:00:00Z"
createdBy: "ck:plan"
source: skill
---

# Rec 5 + Rec 6: legacy/ rename to canonical dirs + L1 memory-substrate paragraph

## Overview

Two independent cleanups bundled per operator decision 2026-07-09, sourced from
`plans/reports/from-ck-predict-to-operator-260704-0105-direction-gaps-legacy-cleanup-two-surfaces-reframe-report.md`:

- **Rec 5 (legacy rename).** The live canonical code sits in dirs named `legacy/` —
  `tools/learning-loop-mastra/{tools,scout,hooks}/legacy/` and
  `mastra/legacy-handler-adapter.js`. The name is the smell the report flagged: a
  future cleanup agent will mis-delete canonical code on the `legacy/` name. Rename to
  descriptive canonical names (UQ4 = Option A, depth-preserving):

  | Current | New |
  |---|---|
  | `tools/legacy/` | `tools/handlers/` (44 MCP tool handler implementations) |
  | `hooks/legacy/` | `hooks/universal/` (the universal gate hooks — matches `CLAUDE.md`'s "universal hooks" vocabulary) |
  | `scout/legacy/` | `scout/pipeline/` (scout pipeline modules) |
  | `mastra/legacy-handler-adapter.js` | `mastra/handler-adapter.js` |

  Every import-path and cross-runtime gate reference is updated in lockstep so the
  rename is a no-op at runtime. `legacy/` is then reserved for dead code only.

- **Rec 6 (L1 memory-substrate paragraph).** `docs/loop-engine.md:5,40` states
  "the record is the memory" (first half). `architecture.md` (L3) names the three
  stores (`meta-state.jsonl`, `runtime-state.jsonl`, `file-index.jsonl`) but the
  concept surface (L1) never states the second half — "three stores realize it."
  One paragraph in `loop-engine.md` closes the seam (original Rec 7).

**Honest risk reframe (vs. the source report).** The report called Rec 5
"highest-value lowest-risk." The scout found it is a **moderate-risk, coordinated,
cross-runtime rename**, not a trivial rename, for three concrete reasons:

1. **Fail-closed coordination gates (bootstrapping hazard).** There are **4 fail-closed
   wrapper files per runtime** — `bash-coordination-gate.cjs`, `write-coordination-gate.cjs`,
   `inbound-state-gate.cjs`, `recurrence-check-on-start.cjs` (×3 runtimes = **12**, not 9 as
   an earlier draft claimed — red-team correction). Each resolves
   `tools/learning-loop-mastra/hooks/legacy/<gate>.js` at runtime via `execFileSync`, and
   `process.exit(err.status ?? 1)` on a missing path → Claude Code **blocks the next tool
   call**. The inbound wrapper fires on `UserPromptSubmit` *before* any bash tool call can
   be requested, so a stale inbound gate deadlocks the session irrecoverably in-session. If
   `hooks/legacy/` is moved without simultaneously rewriting all 12 line-13 strings, the
   active session **deadlocks** — the fix command itself is gated and cannot run. The
   dir-move + all-12-wrapper rewrite + direct-wire-config rewrite must be one atomic bash
   command (Phase 3). Recovery from partial failure is **out-of-process** (a raw terminal
   not run through the hook shims) — the in-session reverse-`git mv` is itself blocked by
   the broken gates (red-team Finding).
2. **Cross-runtime lockstep.** `hooks/legacy/` is referenced by all 3 runtimes' coordination
   wrappers (`.claude/`, `.factory/`, `.mastracode/`) + the direct-wire configs
   (`.claude/settings.json:12`, `.mastracode/hooks.json`) + `interface/contract.js` (asserts
   runtime configs point at the universal hooks) + the repo-root steering prompts
   (`CLAUDE.md`, `AGENTS.md`). The 12 wrappers are asserted **byte-identical** across
   runtimes by the `shims-in-sync` checklist item (but that check verifies symmetry, not
   path-correctness — Phase 6 adds a "line-13 path exists on disk" assertion). The
   direct-wire configs are repointed in the Phase-3 atomic command (not Phase 2) so a
   concurrent `.mastracode`/fresh-`.claude` session never sees a repointed wire without the
   dir present.
3. **Test-gated + inventory-coupled.** `__tests__/legacy-cleanup.test.cjs` pins
   `tools/legacy/...` and `scout/legacy/run-scout.js` as import targets, and
   `interface/__tests__/contract.test.js` pins `hooks/legacy/` as the *valid* universal-hook
   path. The **test runner itself** (`run-pnpm-test-namespaced.mjs:36`) globs `tools/legacy/*.test.js`
   — after the rename it matches zero files and `node --test` vacuous-passes (exit 0, fail 0),
   silently reporting the `mcp-tools` namespace green with no tests (red-team Finding).
4. **The consumer inventory is large and was initially under-scouted.** A hand-curated list
   was ~50% incomplete (the first scout listed ~9, plus 1 hallucinated entry and wrong line
   numbers). The validation re-scout (2026-07-09) found **126 live consumer files / 324 path
   refs** — ~80 are `__tests__/legacy-mcp/*.test.js` (dynamic imports + `evidence_code_ref`
   strings + fixtures). The complete enumeration is baked into `reports/` (see Validation Log);
   Phase 1 re-verifies it for drift, and Phase 2 applies a **repo-wide scripted `sed`** of the 4
   path-specific patterns (safe: they don't match `adaptLegacyHandler`, the `legacy-mcp` dir
   name, or conceptual status-history comments) rather than 126 per-file Edits.

The rename is still high-value and self-contained; the risk is in execution ordering,
not in unknowns. The phases below make the ordering mechanical.

**Out of scope (explicit non-goals):**
- The `__tests__/legacy-mcp/` directory **name** stays (it refers to the historical
  `learning-loop-mcp`→`mastra` migration, like `legacy-cleanup.test.cjs`; the report's
  Rec 5 list does not include it). Path *strings* inside its test files are updated.
- Dead-code removal (`AGENTS.old`, `trajectory.old`, archived docs, stranded fixtures,
  one-shot migration scripts) is deferred — the rename makes it trivial *after* this
  plan; it is a separate follow-up.
- Conceptual "legacy" mentions (old enum statuses, migration-history comments in
  `core/loop-introspect.js`, `core/meta-state.js`) are NOT path refs and are left
  untouched.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Pre-flight & gate-hazard check](./phase-01-pre-flight-gate-hazard-check.md) | Pending |
| 2 | [Rewrite non-gate consumers to new paths](./phase-02-rewrite-non-gate-consumers-to-new-paths.md) | Pending |
| 3 | [Atomic dir move + coordination-gate rewrites](./phase-03-atomic-dir-move-coordination-gate-rewrites.md) | Pending |
| 4 | [Test contract + fallow baselines + fallout](./phase-04-test-contract-fallow-baselines-fallout.md) | Pending |
| 5 | [Rec 6 L1 memory-substrate paragraph](./phase-05-rec-6-l1-memory-substrate-paragraph.md) | Pending |
| 6 | [Verify full suite + gate smoke + runtime-agnostic audit](./phase-06-verify-full-suite-gate-smoke-runtime-agnostic-audit.md) | Pending |

Phase ordering is load-bearing: Phase 2 (non-gate rewrites) → Phase 3 (atomic move +
gate rewrites) → Phase 4 (baselines/fallout). Phase 5 (Rec 6 docs) is independent and
can run anytime after Phase 1. Phase 6 verifies the whole change. **Do not run the
test suite between Phase 2 and Phase 3** — the tree is intentionally inconsistent
there (consumers point at new paths, dirs still at old). Tests run only in Phase 6.

## Dependencies

**No blocking cross-plan dependencies.** Verified 2026-07-09 against git history:

- The lifecycle arc that recently edited `tools/legacy/*` files — plans `260707-0812`,
  `260708-0833`, `260708-1135`, `260708-1216` — is **fully shipped** via PRs #38–41
  (commits `46a8884`, `7a47fbe`, `e0294b2`, `96bdf34`). Their `plan.md` status fields
  are stale (`pending`/`in_progress`); git shows the code is on `main`. No in-progress
  plan edits the target files. Rec 4 (`260708-2258`) shipped via PR #42
  (`09f7e8a`) — the `workflow_intake_orient`/`workflow_intake_plan` files it deleted are
  gone; this rename does not touch them.
- `260628-1337-fallow-tool-integration-rule-encoding` (status `pending`) references
  `__tests__/legacy-mcp/` (the dir name, which stays) — **no path conflict** with this
  rename. Its status field appears stale (its test file
  `gate-logic-consult-checklist-tool-integration.test.js` exists on disk); if genuinely
  unshipped, its phase-file path refs to `tools/legacy/`/`hooks/legacy/` would go stale
  — Phase 1 step 4 confirms and, if needed, lists it for a path-ref refresh.
- The skill-layer prerequisite (PR #37, `1202514`) shipped; no overlap.

`blockedBy: []`, `blocks: []`.

## Acceptance criteria

- [ ] `git mv` preserves history for all 3 dirs + the adapter file (no copy+delete).
- [ ] Widened residual-path grep (`tools/legacy|hooks/legacy|scout/legacy|legacy-handler-adapter` over the **whole repo**, excluding `node_modules/`, `docs/journals/`, `docs/_archive-260703/`, `gate-log.jsonl`, `meta-state.jsonl`) returns **zero live path refs**; a second scoped grep over `__tests__/legacy-mcp/` returns zero path-string hits (only the bare `legacy-mcp` dir-name token allowed). Survivors reviewed as conceptual-only.
- [ ] All **12** fail-closed coordination wrappers (4 per runtime × 3) point at `hooks/universal/`; the 3 runtime mirrors of each wrapper are byte-identical AND each line-13 path exists on disk.
- [ ] Repo-root steering prompts `CLAUDE.md` + `AGENTS.md` repointed (always-loaded — leaving them stale undercuts the rename's goal).
- [ ] Full test suite green (`pnpm test`), including `legacy-cleanup.test.cjs`, `manifest-arithmetic`, `runtime-agnostic`, `shims-in-sync`, the scout tests, the `interface/__tests__/contract.test.js`, and the `phase-e-shell-restructure` tests.
- [ ] `mcp-tools` namespace reports a **non-zero** test count (vacuous-green guard — `run-pnpm-test-namespaced.mjs:36` repointed).
- [ ] Gate smoke: all **4** gate kinds (bash, write, inbound, recurrence) resolve the new path (direct sample-stdin invocation exit 0); live bash+write gates evaluate on benign calls. Confirms the active session did not deadlock.
- [ ] `check_runtime_agnostic` MCP audit passes (universal-location + shims-in-sync + each wrapper's line-13 path exists on disk).
- [ ] `baselines/fallow/*.json` regenerated to reflect the new paths; fallow green. The regen mechanism is named (CLI subcommand or documented hand-edit).
- [ ] `file-index.jsonl` 14 stale path keys refreshed; `meta_state_query_drift` reports zero false drifts.
- [ ] Rec 6: `docs/loop-engine.md` contains the "three stores realize it" statement (L1), naming `meta-state.jsonl`/`runtime-state.jsonl`/`file-index.jsonl` as the realization, without leaking L3 mechanism detail.
- [ ] `meta_state_log_change` records the rename (Rec 12 trigger: `tools/**`/`core/**` source + the L1 doc changed).

## Open questions

**UQ4 (rename target name) — RESOLVED 2026-07-09, Option A** (descriptive subdirs, depth-preserving). Rationale: matches existing "universal hooks" vocabulary; preserves path depth so every consumer diff stays a single-segment swap; each name describes its dir's real role. Rejected: Option B (flatten hooks/scout — changes depth in every cross-runtime ref + `.fallowrc` globs, larger diff for no concept gain); Option C (tools-only — leaves `hooks/legacy/`, the cross-runtime gate-critical one, still named `legacy/`, so the mis-delete risk the report flagged stays half-alive).

No unresolved questions remain for execution.

## Red Team Review

### Session — 2026-07-09
**Reviewers:** Security Adversary (Fact Checker), Failure Mode Analyst (Flow Tracer), Assumption Destroyer (Scope Auditor), Scope & Complexity Critic (Contract Verifier) — Full tier (6 phases → 4 reviewers).
**Findings:** 15 deduped (14 accepted, 1 user-decision overruled) — 4 Critical, 7 High, 4 Medium. All carried `file:line` evidence (none auto-rejected).
**Unanimous across all 4 reviewers:** the Phase-3 `sed` glob `*-coordination-gate.cjs` missed 6 of 12 fail-closed wrappers (`inbound-state-gate.cjs` + `recurrence-check-on-start.cjs` × 3 runtimes) — execution-fatal as written.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | sed glob misses inbound + recurrence wrappers (6/12); count 12 not 9 | Critical | Accept | Phase 3 (sed all `*.cjs` in each `coordination/hooks/`) + Phase 1/6 (count, smoke) |
| 2 | `create-loop-workflow.js:4` — 3rd adapter importer, missed | Critical | Accept | Phase 1/2 inventory |
| 3 | `run-pnpm-test-namespaced.mjs:36` — `mcp-tools` glob → vacuous green | Critical | Accept | Phase 2 (repoint) + Phase 4/6 (non-zero count) |
| 4 | Phase-3 commit trips `pre-commit` (`pnpm test && pnpm fallow:gate`) on stale baselines | Critical | Accept | Phase 3 (no commit) + Phase 4 (commit after baselines) |
| 5 | Recovery reverse-`git mv` unreachable through broken bash-gate | High | Accept | Phase 3 (out-of-process recovery note) |
| 6 | `interface/__tests__/contract.test.js` pins `hooks/legacy/` as valid | High | Accept | Phase 2 |
| 7 | `interface/{CONTRACT,README,RUNTIME_ONBOARDING}.md` onboarding docs | High | Accept | Phase 2 |
| 8 | `docs/architecture.md:61,115-118,122` live L3 doc | High | Accept | Phase 2 |
| 9 | `CLAUDE.md:3,7` + `AGENTS.md:24,38` repo-root steering prompts | High | Accept | Phase 2 + grep widened (Phase 6) |
| 10 | `file-index.jsonl` 14 stale keys → 14 false drifts | High | Accept | Phase 4 (refresh) + Phase 6 (drift check) |
| 11 | phase-e test files (dynamic import + EXPECTED_FILES + external-refs/fingerprints) | High | Accept | Phase 2 |
| 12 | Drop speculative `gate_override`/TTL/symlink apparatus (gold-plating) | Medium | Accept | Phase 1/3 (gate_check kept; out-of-process recovery; no symlink) |
| 13 | Direct-wire configs repointed in Phase 2 → concurrent `.mastracode` session deadlocks | High | Accept | Phase 3 (move direct-wire repoints into atomic command) |
| 14 | More test/script consumers (`runtime-agnostic`, `bash-gate-decision-visibility`, `gate-recurrence`, `gate-self-verify.mjs`, `probe-mastracode.cjs`) + `placement.md`/`legacy-pins.md` | High | Accept | Phase 2 |
| 15 | Acceptance grep mis-scoped (no archive/journal exclusions; `grep -v "__tests__/legacy-mcp/"` discards whole files; excludes repo root/scripts/file-index) | Medium | Accept | Phase 6 (widened grep + second scoped grep) |
| — | Fallow baseline regen command doesn't exist (only `fallow:gate` audit) | Medium | Accept | Phase 4 (pin mechanism at execution) |
| — | Fabricated line citations (`.factory` spawn test has no legacy refs; `:258` phantom) | Medium | Accept | Phase 1/2 (dropped/corrected) |
| — | Drop negative-case gate smoke (`git mv` can't flip fail-closed→fail-open) | Low | Accept | Phase 6 (positive 4-gate smoke only) |
| — | Split Rec 6 into its own PR | Medium | **Reject (user decision)** | Operator chose to keep Rec 6 bundled ("one clean up plan") |
| — | Collapse 6 phases → ~2 | Medium | **Partial / noted** | Kept 6-phase shape (the Phase 2→3 atomic boundary is load-bearing); applied correctness fixes. Structural simplification deferred as lower-priority. |

**Verified TRUE (no change):** 3-runtime gate mirrors byte-identical; `core/legacy/` genuinely absent (stale-glob fix stands); manifest `file`-field-is-canonical; **`adaptLegacyHandler` symbol-kept is the correct YAGNI call** (red-team confirmed — it names the MCP wire envelope, not the dir).

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01`…`phase-06`.
- Decision deltas applied: 12-wrappers (not 9) everywhere; inventory is a re-grep hypothesis (Phase 1) not a fixed authoritative list; direct-wire configs move to Phase 3 atomic; commit moves to Phase 4; file-index refresh added (Phase 4/6); residual grep widened + second scoped grep (Phase 6); `create-loop-workflow.js:4` + repo-root prompts + `interface/` + phase-e tests + scripts added to Phase 2; `.factory` spawn-test hallucination + `:258` phantom dropped; out-of-process recovery replaces symlink/override apparatus.
- Reconciled stale references: the old "9 coordination-gate files" / `{inbound,recurrence}-coordination-gate.cjs` naming / Phase-3-commit / "do not hand-edit baselines" (now qualified) / negative-case smoke — all updated across `plan.md` + the affected phases.
- Unresolved contradictions: 0.

## Validation Log

### Session 1 — 2026-07-09
**Trigger:** post-red-team validate (critical-questions interview on the rewritten plan). Red-team already ran Full-tier verification, so this pass focused on decision points the rewrite left open.
**Questions asked:** 4

#### Questions & Answers

1. **[Assumptions/Risk]** Phase 4 regenerates `baselines/fallow/*.json`, but the repo only has `fallow:gate` (an audit), no regenerator. How should the plan handle this?
   - Options: Investigate CLI in Phase 1, else hand-edit | Add a regen script (scope expansion) | Block cook until mechanism confirmed
   - **Answer:** Investigate CLI in Phase 1, else hand-edit
   - **Rationale:** keeps scope tight; Phase 1 determines the mechanism so Phase 4 isn't blocked; a regen script is scope expansion (YAGNI for this rename).
   - **Impact:** Phase 1 step 5 added (investigate `fallow` CLI subcommand); Phase 4 records the chosen mechanism in the Rec 12 change-log.

2. **[Risk]** The only recovery from a partial Phase-3 failure is out-of-process (a raw terminal), because in-session tools are gated-dead once gates point at the moved dir. Accept that, or add an in-session safety net?
   - Options: Accept out-of-process recovery only | Pre-stage a symlink safety net
   - **Answer:** Accept out-of-process recovery only
   - **Rationale:** the atomic command makes success the common path; recovery is the rare path; a symlink re-introduces the transient dual-path the rename eliminates (red-team Finding 7 gold-plating).
   - **Impact:** Phase 3 keeps the out-of-process recovery note; no symlink apparatus.

3. **[Assumptions/Scope]** The Phase-2 edit set is grep-determined at execution, not pre-enumerated — accept that, or require a complete enumeration before cook?
   - Options: Accept grep-determined edit set | Re-scout for a complete pre-cook enumeration
   - **Answer:** Re-scout for a complete pre-cook enumeration
   - **Rationale:** the red-team proved the hand-curated inventory was ~50% incomplete; a complete enumeration removes execution-time surprise.
   - **Impact:** the re-scout was performed (validation 2026-07-09): **126 live consumer files / 324 refs** — far larger than first scoped. Phase 2 switched from per-file Edits to a **repo-wide scripted `sed`** (the 4 path patterns are path-specific and safe; ~80 of the 126 are `__tests__/legacy-mcp/*.test.js`). Enumeration baked into `reports/{consumer-file-list.txt,consumer-enumeration-full-grep.txt,pre-cook-consumer-enumeration-126-files-report.md}`; Phase 1 step 2 re-verifies for drift; Phase 2 seds the ~110 non-gate consumers (excluding the 12 wrappers + 2 direct-wire configs → Phase 3, and baselines + file-index → Phase 4).

4. **[Tradeoffs]** Leave the atomic move uncommitted between Phase 3 and Phase 4 (one Phase-4 commit), or add a `SKIP_SIMPLE_GIT_HOOKS=1` checkpoint in Phase 3?
   - Options: Commit only in Phase 4 | SKIP_SIMPLE_GIT_HOOKS checkpoint in Phase 3
   - **Answer:** Commit only in Phase 4
   - **Rationale:** simpler, one clean commit, and the `pnpm test && pnpm fallow:gate` pre-commit passes green only after baselines + file-index are regenerated (Phase 4). The working tree is durable between Phase 3 and 4.
   - **Impact:** Phase 3 has no commit; Phase 4 commits once.

#### Confirmed Decisions
- Fallow baseline regen: investigate CLI in Phase 1, else precise hand-edit (documented in Rec 12 change-log).
- Recovery: out-of-process only; no symlink apparatus.
- Inventory: complete pre-cook enumeration (126 files) baked in; Phase 2 = repo-wide sed.
- Commit: single Phase-4 commit (after baselines + file-index + fallout).

#### Impact on Phases
- Phase 1: step 2 re-verifies the baked-in enumeration (not re-generates); step 5 added (fallow CLI investigation).
- Phase 2: rewritten to a repo-wide scripted sed over ~110 non-gate consumers (excludes 12 wrappers + 2 configs → Phase 3; baselines + file-index → Phase 4); manual special case = `loop-introspect.js:113` stale `core/legacy`.
- Phase 3/4/6: unchanged by validation (red-team already shaped them); Phase 4 records the fallow regen mechanism in the change-log.

### Whole-Plan Consistency Sweep (validate)
- Files reread: `plan.md`, `phase-01`…`phase-06`.
- Decision deltas from this session: (a) inventory is pre-baked (126 files) — Phase 1 re-verifies drift, not re-generates; (b) Phase 2 = repo-wide sed (not per-file Edits); (c) fallow CLI investigation added to Phase 1 step 5; (d) single Phase-4 commit confirmed.
- Reconciled stale references: Phase 1 Overview + step 2 updated from the old "re-grep at execution / ~18 live" framing to the pre-baked 126-file / re-verify-drift framing. The remaining mentions of "9 coordination", ":258", "18 live", "loop-surface-inject-real-spawn", "grep-determined" in `plan.md` are all inside the `## Red Team Review` table / sweep log / `## Validation Log` question text — legitimate audit-trail records of the terms that were fixed, not live claims.
- Unresolved contradictions: 0.