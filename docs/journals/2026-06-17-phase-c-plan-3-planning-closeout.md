# Journal — Phase C Plan 3 Planning Closeout (2026-06-17)

**Session:** 2026-06-17 18:34 → 21:45 Bangkok (Asia/Bangkok)
**Plan:** `plans/260617-1950-phase-c-plan-3-cut-over/`
**Mode:** --hard (2 researchers + red-team + optional validation)
**Outcome:** Plan authored, restructured, ready for `/ck:cook`

## What happened

User invoked `/ck:plan --hard` to plan Phase C Plan 3 (C6+C7 operational flip), the third plan in the Phase C stack. The parent brainstorm (`brainstorm-260616-1530-phase-c-plan-scope-report.md`) and prerequisite brainstorm (`brainstorm-260617-0212-pre-plan-3-prerequisite-fixes.md`) had already locked the scope. Plan 1a + Plan 1b (predecessors) shipped earlier in the same session.

**Workflow steps executed:**

1. **Read context** — master tracker, Plan 1a/1b/2 closeouts, F4 finding, agent manifests, server entry points.
2. **Asked 3 critical questions** via AskUserQuestion:
   - F4 path: Path A (Mastra primary + re-implement hooks) ← operator chose Recommended
   - Manifest strategy: Update legacy + add 4 tools ← operator chose Recommended
   - Mode decision: Defer to post-Plan 3 ← operator chose Recommended
3. **Spawned 2 researchers in parallel** (researcher + researcher) — F4 hook analysis + cut-over mechanics.
4. **Authored initial 7-phase plan** (987 lines, 8 files) using `ck plan create` for scaffolding.
5. **Ran red-team review** with 4 reviewers (code-reviewer subagent type) — Security, Failure Mode, Assumption Destroyer, Scope Critic.
6. **Received 39 findings, 11 Critical.** Critical findings included:
   - **C-1:** SessionStart hook at `.factory/hooks/loop-surface-inject.cjs:72` keys on `mcpServers["learning-loop-mcp"]` — would return null post-cut-over (the one hook the researcher A missed).
   - **C-2:** `.claude/settings.local.json` has 5 dead `mcp__learning-loop-mcp__*` permissions.
   - **C-3:** AGENTS.md (10+ refs), CLAUDE.md (3), README.md (4) cite deleted server.
   - **C-4:** 4 wire-format tests import `coerceParamsToSchema` from `tool-registry.js` (to be deleted).
   - **C-5:** Plan pre-check claim "no test imports legacy server" was FALSE (30+ references in 15+ files).
   - **C-6:** Skip count claim wrong (persistent skip is backfill, not collision).
   - **C-7:** F4 fingerprint line wrong (`server.js:38` is description literal, not PREFIX; correct line is `:13`).
   - **C-8:** Deleting parity test removes regression net.
   - **C-10:** Cold-session test path-update list incomplete (8 lines, not 4).
   - **C-11:** F4 evidence_code_ref at `server.js:38` becomes stale after Phase 1 expansion.
7. **Asked operator** for restructure disposition. Operator chose "Apply restructure: 1 phase, 1 commit" (the Recommended option).
8. **Restructured:** deleted 7 phase files; rewrote `plan.md` (246 lines); created single `phase-01-single-cut-over-commit.md` (368 lines). Net 38% smaller (614 vs 987 lines).
9. **Updated red-team summary** with disposition table for all 11 Criticals.
10. **Verified all red-team claims** against the codebase (hook line 72, settings lines 13-29, server.js:13, AGENTS.md:50, CLAUDE.md:3-8, README.md:24-78, refresh-tools imports, etc.). All claims accurate.
11. **Presented Post-Plan Handoff** via AskUserQuestion. Operator chose "End session — review plan first."

## Key insights

**Insight 1: Researcher A was almost right but missed one critical exception.** The 4 PreToolUse hooks are session-level and server-name-blind (correct analysis). But the SessionStart hook at `loop-surface-inject.cjs:72` is server-named and would silently break. The red-team reviewer caught this. **Lesson:** when a researcher makes a sweeping claim, look for the exception (a single file that breaks the pattern).

**Insight 2: Pre-check claims can be fiction.** The original plan's Phase 4 said "no test imports the legacy server entry directly" (verified via grep). The grep was correct; the conclusion was wrong. Tests reference `server.js` as a *path string* passed to `spawn("node", [path])`, which is the same dependency. The plan counted "0 hits" but missed 30+ path-string references. **Lesson:** grep is necessary but not sufficient; manually classify every hit before claiming "no issue."

**Insight 3: F4's wording was misleading.** The finding said "the runtime hooks... only fire on the legacy learning-loop-mcp server." This is *false* for the 4 PreToolUse hooks. But it's *true* for the SessionStart hook. The researcher A analysis was 95% correct but missed the 5% that mattered. **Lesson:** when a finding's narrative makes a sweeping claim, look for the counterexample.

**Insight 4: Over-phasing is a real cost.** 7 phases for "delete 2 entries from 2 configs + add 11 entries to a manifest + delete 2 files" is ceremonial. 1 phase / 1 commit is the right structure. **Lesson:** if the cuts are mechanical, don't ritualize them.

**Insight 5: Restructure is cheaper than re-execution.** Applying 11 Criticals via 1-2h of editing is much cheaper than discovering them at runtime (test failures, cold-session hook returns null, settings.local.json dead permissions). The 1-2h restructure is a 5-10x ROI vs. runtime debugging.

**Insight 6: Researcher reports age well.** Both researcher reports (`researcher-260617-1954-...` for F4 + `researcher-260617-1945-...` for cut-over mechanics) remained valid through the restructure. Their factual claims (file:line citations, manifest contents, hook layer analysis) were durable. Only the SessionStart hook exception was missed by researcher A. **Lesson:** well-cited research is reusable.

**Insight 7: Operator adjudication at the right moment.** Asking "apply restructure / patch in place / reject all / let me review each" *after* red-team review (not before) gave the operator concrete evidence to decide. The restructure was a recommendation, not a forced choice. **Lesson:** batch the asks; let the operator make high-impact decisions with full context.

## Decisions made (operator-confirmed)

- **F4 path:** Path A (Mastra primary + re-implement hooks). Implemented as "Mastra primary + structural F4 closure" per Researcher A's finding + the SessionStart hook fix per red-team C-1.
- **Manifest strategy:** Update legacy + add 4 tools. Implemented as: 5-group rewrite in `tools/learning-loop-mastra/agent-manifest.json` (D-11 reconciled). No version bump (M-9 YAGNI).
- **Mode 1 vs Mode 2:** Defer to post-Plan 3 (D-12 stays in deferred column).
- **Plan structure:** 1 phase / 1 commit (vs. original 7 phases).
- **Restructure scope:** All 11 Critical + 9 High findings applied. M-9 (version bump) and M-10 (check_grounding) rejected as YAGNI. H-2 (quickstart injection surface) deferred to follow-up hardening.

## Files written this session

- `plans/260617-1950-phase-c-plan-3-cut-over/plan.md` (246 lines) — restructured plan
- `plans/260617-1950-phase-c-plan-3-cut-over/phase-01-single-cut-over-commit.md` (368 lines) — single phase with 19 step groups
- `plans/260617-1950-phase-c-plan-3-cut-over/reports/code-reviewer-260617-2114-...-security-adversary-...md` (191 lines) — Security Adversary red-team
- `plans/260617-1950-phase-c-plan-3-cut-over/reports/from-code-reviewer-to-planner-phase-c-plan-3-red-team-39-finding-summary-report.md` (141 lines + restructure outcome) — 39 findings summary
- (Failure Mode + Assumption Destroyer + Scope Critic reports were delivered inline in the agent tool results but not saved as separate files. The summary report covers all 39 findings; the 3 missing files are non-load-bearing because the summary is canonical for the restructure decision.)

## Open questions (deferred)

- **D-12 (Mode 1 vs Mode 2):** defer to post-Plan 3. Operator decision 2026-06-17.
- **JSON key rename `learning-loop-mastra` → `learning-loop` in `.mcp.json`:** out of Plan 3 scope (cascades to AGENTS.md, Droid state, Claude Code state). Follow-up plan.
- **Move `tools/learning-loop-mcp/tools/` to `tools/learning-loop-mastra/tools/legacy/`:** out of Plan 3 scope (Scope Critic C-9 YAGNI for this plan). Follow-up cleanup.
- **H-2 (quickstart injection surface):** out of Plan 3 scope. Follow-up hardening plan.

## What was NOT done (correctly)

- I did not run `/ck:plan validate` — the operator chose to review first; validation is an optional gate in --hard mode and the red-team already applied all 11 Criticals.
- I did not run `/ck:cook` — the operator chose to end session for review.
- I did not hydrate separate tasks — per the 3-task rule (<3 phases → skip task creation), the plan file is the single source of truth.
- I did not commit any changes to the codebase — this session is plan-only. Plan files live in `plans/260617-1950-phase-c-plan-3-cut-over/`.

## References

- `plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md` (parent scope)
- `plans/reports/brainstorm-260617-0212-pre-plan-3-prerequisite-fixes.md` (3-plan stack)
- `plans/reports/researcher-260617-1954-GH-1607-F4-hook-reimplementation-path-a-report.md` (F4 analysis)
- `plans/reports/researcher-260617-1945-phase-c-plan-3-cut-over-mechanics-report.md` (Path b mechanics)
- `plans/260617-1950-phase-c-plan-3-cut-over/plan.md` (restructured plan)
- `plans/260617-1950-phase-c-plan-3-cut-over/phase-01-single-cut-over-commit.md` (single phase)
- `plans/260617-1950-phase-c-plan-3-cut-over/reports/from-code-reviewer-to-planner-phase-c-plan-3-red-team-39-finding-summary-report.md` (39 findings + restructure outcome)
- `plans/260617-1950-phase-c-plan-3-cut-over/reports/code-reviewer-260617-2114-GH-1607-plan-3-cut-over-red-team-security-adversary-plan-review-report.md` (Security Adversary detailed report)
- `plans/reports/productization-260612-1530-master-tracker.md#Phase C` (canonical state; C6/C7 still [ ])
- `plans/260617-1138-phase-c-plan-1a-atomic-fix/reports/closeout-report.md` (predecessor)
- `plans/260617-1607-phase-c-plan-1b-hygiene/reports/closeout-report.md` (predecessor)
- `plans/260616-2200-phase-c-plan-2-parity/reports/closeout-report.md` (predecessor)

---

**Status:** Plan 3 planning complete. Ready for operator review and `/ck:cook` invocation when ready.
