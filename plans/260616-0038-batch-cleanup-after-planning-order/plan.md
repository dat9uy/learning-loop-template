---
title: "Batch cleanup after planning-order sequence (Step 1 + 2 + 4 cosmetic/hygiene)"
description: >-
  Closes the cleanup backlog surfaced during code review of the 4-step
  planning-order sequence (plans 260615-1500, -1530, -1600, -2126 — all
  shipped 2026-06-15). 15 items: 13 from the planning-order report's
  "Cleanup backlog" (1.1-1.5 Step 1, 2.3-2.5 Step 2, 4.1-4.5 Step 4), 1 from
  the Step 4 code review (F-5 `err.message` path leak), and 1 from the
  planning-order report's Q1 follow-up (`skipped_via_override` field).
  Cosmetic/hygiene only — no behavior change, no new tests required for
  most items. 1 small new test for Phase 6's `loadText` preprocessor.
  Closes with a planning-order report "Cleanup backlog → cleared" annotation,
  a single change-log entry for the batch, and 2 `loop-design` entries
  tracking the AST-based check + recurrence-tracker MCP-mediation follow-ups.
status: pending
priority: P3
branch: "260614-1259-phase-b-codegen-adoption"
tags:
  - meta
  - cleanup
  - hygiene
  - surfaces
  - runtime-agnostic
  - planning-order
blockedBy: []
blocks: []
created: "2026-06-16T00:38:00.000Z"
createdBy: ck:plan
source: skill
related:
  - plans/reports/pm-260615-2255-step-4-runtime-agnostic-closure.md (the PM report that enumerates the backlog)
  - plans/reports/brainstorm-260615-1430-planning-order-bash-gate-and-runtime-agnostic.md (the planning-order report; § Cleanup backlog lists 1.1-1.5, 2.1-2.5, 4.1-4.5; § Open questions for Step 4 lists the `skipped_via_override` Q1 follow-up)
  - plans/reports/code-reviewer-260615-2255-step-4-runtime-agnostic-closure.md (F-2 and F-5 are the two code-review additions)
  - plans/260615-1500-surfaces-helper-and-refactors/ (Step 1 — items 1.1-1.5)
  - plans/260615-1530-bash-gate-debate-stderr-override-recurrence/ (Step 2 — items 2.3, 2.4, 2.5; 2.1, 2.2 resolved by Step 4)
  - plans/260615-2126-step-4-runtime-agnostic-rule-and-helper-extensions/ (Step 4 — items 4.1-4.5)
  - meta-state.jsonl `rule-runtime-agnostic-features` (item 4.5 affects the runtime-agnostic-checklist)
---

# Batch cleanup after planning-order sequence

## Overview

Closes the cosmetic + doc-hygiene + 2 small code-hygiene items that surfaced during code review of the 4-step planning-order sequence (all shipped 2026-06-15). No behavior change; no new public surface; no new MCP tools. 1 new small test for Phase 6's `loadText` preprocessor (F-2 fix from the code review).

**Total items: 15** (13 from the planning-order report's Cleanup backlog, 1 from the Step 4 code review F-5, 1 from the planning-order report Q1 follow-up).

## Cleanup item inventory

| # | Source | Severity | Phase |
|---|--------|----------|-------|
| 1.1 | Step 1 — stale `// fallow-ignore-next-line complexity` comment in `inbound-state.js` | cosmetic | 3 |
| 1.2 | Step 1 — no file-level JSDoc for `core/surfaces.js` | cosmetic | 1 |
| 1.3 | Step 1 — `phase-01-surfaces-helper.md` Unresolved questions not annotated as resolved | doc-hygiene | 2 |
| 1.4 | Step 1 — `gate-logic-glob-whitelist.test.js` "mutation test" doesn't exercise parameterization | test-quality | 5 |
| 1.5 | Step 1 — `surfaces.test.js` "best-effort" test doesn't actually exercise a failure | test-quality | 5 |
| 2.3 | Step 2 — `recurrence-tracker.js#generateFindingId` uses `Math.random()` (6-char suffix) | hygiene | 4 |
| 2.4 | Step 2 — `recurrence-check-on-start.js` reads stdin without comment | cosmetic | 3 |
| 2.5 | Step 2 — `gate-check-recurrence-tool.js` passes explicit `undefined` for omitted options | cosmetic | 3 |
| 4.1 | Step 4 — `runtime-agnostic-checklist.js` CHECKLIST descriptions don't name the helper to use | doc-hygiene | 2 |
| 4.2 | Step 4 — `check-runtime-agnostic-tool.js` shim-mirror predicate only checks existence, not content | test-quality | 5 |
| 4.3 | Step 4 — `readModifyWriteOnAllSurfaces` cross-surface atomicity not prominent in JSDoc | design-doc | 1 |
| 4.4 | Step 4 — phase files cite stale line-number ranges for refactor targets | doc-hygiene | 2 |
| 4.5 | Step 4 — F-2 from code review: 6-item checklist regex has 9 bypass forms + false positives on comments/strings | test-quality | 6 |
| F-5 | Step 4 code review — `err.message` from `appendFileSync`/`writeFileSync`/`unlinkSync` may leak full path on ENOENT | hygiene | 4 |
| Q1 | Planning-order Q1 follow-up — `skipped_via_override` field remains aspirational; remove or document | doc-hygiene | 2 |

## Phases

| Phase | Name | Status | Items |
|-------|------|--------|-------|
| 1 | [Surface documentation header](./phase-01-surface-documentation-header.md) | pending | 1.2, 4.3 |
| 2 | [Plan and report hygiene](./phase-02-plan-and-report-hygiene.md) | pending | 1.3, 4.1, 4.4, Q1 |
| 3 | [Comment and handler hygiene](./phase-03-comment-and-handler-hygiene.md) | pending | 1.1, 2.4, 2.5 |
| 4 | [Code hygiene](./phase-04-code-hygiene.md) | pending | 2.3, F-5 |
| 5 | [Test quality improvements](./phase-05-test-quality-improvements.md) | pending | 1.4, 1.5, 4.2 |
| 6 | [Regex comment-stripping preprocessor](./phase-06-regex-comment-stripping-preprocessor.md) | pending | 4.5 |
| 7 | [Verification and backlog closeout](./phase-07-verification-and-backlog-closeout.md) | pending | (verification + planning-order report closeout + change-log) |

## Cross-plan dependencies

- **Same-scope blockedBy:** none (the 4 planning-order plans are all `shipped` or `complete`; this plan consumes no output from them other than the existing code/docs being cleaned up).
- **Same-scope blocks:** none (this is a terminal cosmetic pass; no follow-on plans depend on it).

## Test plan

- Phase 6 (F-2 fix) ships **1 new test** in `__tests__/runtime-agnostic-checklist.test.js` (or extends `runtime-agnostic.test.js`) that pins the `loadText` preprocessor contract: comments + string literals are stripped before regex testing; a comment containing `.claude` is NOT flagged.
- All other phases are no-test (cosmetic, doc, or refactor-without-behavior-change). The existing 986/987 test suite is the regression guard.

## Why a separate cleanup plan (not folded into Step 4)

Per the planning-order report § Cleanup backlog: "**Processed in one session after all 4 steps ship** (separate from the plan-of-record work). The backlog grows as more steps complete — append new items here rather than scattering them across reports."

Reasons:
1. **Plan-of-record PRs stay focused** on the actual feature work. Folding 15 cosmetic items into the Step 4 PR would have bloated the diff (1,291 lines → ~1,500) and mixed concerns.
2. **The cleanup touches 6+ files** (5 code files + 5 plan/report files + the planning-order report itself). A single batch keeps the change scoped and reviewable.
3. **Most items are mechanical** (delete a stale comment, add a JSDoc line, replace a `Math.random()` call). A separate plan lets the implementer batch them efficiently without churning the same files mid-stream.

## Risk assessment

| Risk | Mitigation |
|---|---|
| F-5 fix changes console.error output → breaks any log scraper | F-5 only affects failure-path logging; success path unchanged. Existing tests cover success path. If a log scraper exists, it sees `surface + basename` (already PII-safe per Red Team #14) and `err.code` (path-free). |
| Phase 6's `loadText` preprocessor strips legitimate string literals containing `.claude` | The preprocessor only strips content INSIDE the file; the regex check still runs against the stripped text. If the string literal is the only place the pattern appears, the preprocessor correctly says "no violation" — which matches reality (a `.claude` in a string is not a hand-rolled loop). |
| Phase 2 (Q1 follow-up) removes `skipped_via_override` from the plan's pseudocode but the code (`bash-gate.js`) still hard-codes `false` | The CLEANUP work is doc-only (the plan's pseudocode; not the code). The code's `false` literal is correct (override is silent in `applyPromotedRules`; the audit lives in `runtime-state.jsonl`). |
| Phase 1 JSDoc for `surfaces.js` is more than a header (file is 227 lines) | Header is 5-10 lines; touches the existing 4-line module-level comment. No behavior change. |
| Removing `1.4`/`1.5` tests reduces test count | Documented in Phase 5 as "test quality fix, not deletion" — if the test can be strengthened, strengthen; if not, drop and document. The function-level contract is the source of truth. |

## What stays human forever

- The 4-step planning-order decision (planning-order report § What stays human forever).
- The 15-item cleanup backlog itself (audit trail — never delete; mark as `cleared (YYYY-MM-DD)` in the planning-order report when this plan ships).
- The F-2 finding's "best-effort, lowest common denominator" stance (documented in `runtime-agnostic-checklist.js` JSDoc by Phase 6). The audit is not exhaustive; the agent (the rule's `enforcement`) and the regression test share the same regex, and both miss the same bypasses. The preprocessor eliminates false positives, not bypasses.

## Validation Log

### Session 1 — 2026-06-16
**Trigger:** User invoked `/ck:plan validate plans/260616-0038-batch-cleanup-after-planning-order` after plan creation. Full tier (7 phases → all 4 roles, 15+ claims/phase).

#### Verification Results
- **Tier:** Full
- **Claims checked:** 28
- **Verified:** 25 | **Failed:** 3

**Failures (all corrected by Validation Session 1 propagation):**
1. [Fact Checker] Phase 2 (1.3): `phase-01-surfaces-helper.md:59-62` cited as the "Unresolved questions" section, but those lines are `- Create:` bullets. The 3 questions are scattered as Requirements + Risk Assessment rows; no formal `## Unresolved questions` section exists.
2. [Fact Checker] Phase 4 (F-5): Plan cites 3 `console.error` sites at lines 91, 193, 222. Actual count is 4 (line 208 is the unlink-in-removeOnNull branch). Plan missed site 208.
3. [Fact Checker] Phase 2 (4.4): Plan cites "3 phase files" with line-number citations. Actual: 4 places (plan.md `related` frontmatter has 4 cites at lines 51, 54, 57, 63 + 3 phase files: phase-01:128, phase-05:32,70, phase-07:130). Plan missed plan.md.

#### Questions & Answers

1. **[Fact Checker] 1.3** — phase-01-surfaces-helper.md has no `## Unresolved questions` section; the 3 questions are scattered. How to handle?
   - Options: Add Resolution Log section (Recommended) | Annotate each Q inline | Drop item 1.3
   - **Answer:** Add new Resolution Log section (Recommended)
   - **Rationale:** Self-contained for future readers; consolidates the 3 questions + answers in one place at the bottom of the plan file.

2. **[Fact Checker] F-5** — actual count is 4 `console.error` sites, not 3. How to handle?
   - Options: Update plan to 4 sites (Recommended) | Keep as 3 sites; line 208 in follow-up
   - **Answer:** Update plan to cover 4 sites (Recommended)
   - **Rationale:** Leaving line 208 un-stripped defeats the purpose of the helper; the cost is one more call site (~1 LoC) and a clear pattern in the plan.

3. **[Architecture/Assumption] Phase 6 design** — the 9 known syntax bypasses are NOT closed by the preprocessor. Best-effort + JSDoc, or AST-based check?
   - Options: Best-effort + JSDoc warning (Recommended) | Add AST-based check
   - **Answer:** Best-effort + JSDoc warning. **Plus** file a `loop-design` entry in meta-state for the AST-based check as a future follow-up.
   - **Rationale:** Matches F-2's recommended fix and the code review's framing. The AST-based check is a separate plan (adds `acorn` dependency, ~50 LoC) that should not block this cleanup batch.

4. **[Tradeoff/Risk] Phase 5 tests** — strengthening 1.4 (vi.doMock) and 1.5 (chmodSync(0o000)) adds platform-fragile tests. Worth the cost?
   - Options: Strengthen both (Recommended) | Drop both, document gap
   - **Answer:** Strengthen both (Recommended)
   - **Rationale:** vi.doMock is a standard vitest pattern; chmodSync(0o000) is Unix-only with a Windows skip. Both tests pin real contracts that the function-level JSDoc alone does not.

#### Confirmed Decisions
- **Phase 2 (1.3):** Add `## Resolution Log` section at the bottom of `phase-01-surfaces-helper.md` consolidating the 3 questions + answers.
- **Phase 4 (F-5):** Update plan to cover 4 sites (91, 193, 208, 222).
- **Phase 6 design:** Best-effort + JSDoc. Plus add loop-design entry to meta-state for the AST-based check.
- **Phase 5 tests:** Strengthen both 1.4 and 1.5.
- **Phase 2 (4.4):** Default decision (not asked): update to cover 4 places (plan.md frontmatter + 3 phase files). Stale line cites in plan.md are unacceptable for a cleanup plan that purports to fix stale line cites.

#### Action Items
- [x] **Phase 2** — propagate 1.3 to "Add Resolution Log section"; 4.4 to "4 places".
- [x] **Phase 4** — propagate F-5 to "4 console.error sites".
- [x] **Phase 6** — keep best-effort design (no change to preprocessor/JSDoc/test).
- [x] **Phase 7** — add: append 2 `loop-design` entries to meta-state.jsonl: AST-based check (Q3) + recurrence-tracker MCP-mediation (Q2).
- [x] **Phase 2 (4.4)** — update to cover 4 places (plan.md frontmatter + 3 phase files).

#### Impact on Phases
- Phase 2: 1.3 (Resolution Log section addition) + 4.4 (4 places, not 3).
- Phase 4: F-5 (4 sites, not 3).
- Phase 6: no change to implementation; JSDoc already documents "best-effort, lowest common denominator."
- Phase 7: add 2 new meta-state entries (loop-designs: AST-based check + recurrence-tracker MCP-mediation).

### Whole-Plan Consistency Sweep

After applying all 4 answers, re-read `plan.md` and every `phase-*.md` file. Verified:

- **Phase 2 (1.3)**: Resolution Log is a new section (not in the plan file). The plan's Implementation Steps already describe "add a new `## Resolution Log` section at the bottom of phase-01-surfaces-helper.md". No contradictions.
- **Phase 2 (4.4)**: 4 places (plan.md frontmatter + 3 phase files). The plan's Implementation Steps table now lists all 4 places. No contradictions.
- **Phase 4 (F-5)**: 4 sites (lines 91, 193, 208, 222). The plan's Architecture section + Success Criteria + Risk Assessment all reference "4 sites". No contradictions.
- **Phase 6**: no implementation change. The JSDoc and preprocessor design are unchanged. The user's loop-design follow-up is delegated to Phase 7.
- **Phase 7**: 3 meta-state entries (1 change-log + 2 loop-designs) instead of 1. The Success Criteria and Risk Assessment both reference "2 `loop-design` entries (AST + recurrence-tracker MCP-mediation)". No contradictions.
- **Test count delta**: unchanged. The user's choice (best-effort + JSDoc) does not change the test count; the AST-based check is a future plan, not a CLEANUP item.

**Reconciled stale references:** 0
**Unresolved contradictions:** 0

Plan is ready for `/ck:cook` (recommended given the small, well-understood, low-risk scope).

## Unresolved questions

None at the cleanup-batch level. The 15 items have explicit file:line references and explicit fix descriptions in the source reports. **2 follow-ups are now tracked as `loop-design` entries in meta-state** (filed by Phase 7 per Validation Session 1, Q3 + planning-order Q2): AST-based check + recurrence-tracker MCP-mediation.

## Next Steps

After this plan ships:
1. The planning-order sequence is fully closed (Steps 1-4 + Cleanup).
2. A future feature work that uses the runtime-agnostic rule is the natural follow-on (validates that the cleanup actually made the audit surface cleaner).
3. **Two `loop-design` entries in meta-state.jsonl** (filed by Phase 7) track the deferred follow-ups:
   - **AST-based runtime-agnostic check** (Q3 from validation): closes the 9 known syntax bypasses (`forEach`, `map`, `for-in`, `while`, template literals, etc.) by parsing the source AST instead of regex-testing. Estimated ~50 LoC + 1 dependency (`acorn` or similar).
   - **Recurrence-tracker MCP-mediation** (Q2 from planning-order): replaces the direct `appendFileSync` write in `recurrence-tracker.js#checkAndEmit` with a call to `meta_state_report` MCP tool. Defense-in-depth improvement (schema validation, operator-role gate, audit trail); not a bug fix. Post-4-step brainstorm will reconsider.
4. A future "post-cleanup" session picks up the 2 loop-design entries and ships them as separate plans.
