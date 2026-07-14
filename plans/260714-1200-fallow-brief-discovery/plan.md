---
title: "Wire pnpm fallow:brief into the agent runtime discovery surface"
description: "Make sure the agent runtime knows to invoke `pnpm fallow:brief` (the compact-CSV orientation stream) when `pnpm fallow:gate` exits non-zero from the pre-commit hook. Encode the trigger→action as a consult-checklist rule with PROCESS_HINTS row, mirror in .factory/hooks, lock via cold-session parity test, and resolve the originating meta-state finding."
status: pending
priority: P2
branch: "main"
tags: [fallow, agent-runtime, discoverability, meta-state]
blockedBy: []
blocks: []
created: "2026-07-14T00:15:26.773Z"
createdBy: "ck-cli"
source: cli
---

# Wire pnpm fallow:brief into the agent runtime discovery surface

> **Trigger:** `pnpm test && pnpm fallow:gate` (the `simple-git-hooks.pre-commit` chain) exits 1 because `fallow audit --gate new-only` verdict != pass. Agent runtime sees: stderr containing human-readable fallow output (with `✗`, `●`, `■` decoration) plus exit code 1.
> **Desired outcome:** Agent runtime invokes `pnpm fallow:brief` next, which emits a compact-CSV stream (one finding per line with `severity=,crap=N,...` fields) — token-cheap to parse, no decoration, no inherited-noise pollution.
> **Why this matters:** without the hint, the agent has to either (a) re-run the gate and parse the full human report into context, or (b) flounder by grepping for `✗` symbols in raw stdout. The compact stream is much smaller (one CSV line per finding, no decoration) and machine-actionable when ≥1 finding exists. On a clean tree the brief is ~50 B with no action needed.

## Overview

The previous turn (task 1) added `pnpm fallow:brief` to `package.json` scripts but did NOT wire it into the agent runtime's discovery surface. This plan closes the gap by encoding the trigger→action mapping as a registry rule + PROCESS_HINTS row — the canonical pattern in this codebase (see `rule-tool-integration-same-commit-dep`, `rule-runtime-agnostic-features`, `rule-pr-body-registry-deltas`).

The originating meta-state finding `meta-260712T0730Z-fallow-mcp-runtime-needs-format-json` is **partially stale** (its empirical claim "human ≫ JSON on token cost" was based on a 2026-07-12 measurement that no longer matches fallow 3.3.0 behavior on this codebase). Phase 1 re-measures on at least 3 finding-set sizes to ground the rationale in measured data before any implementation lands. Phase 4 supersedes the originating finding with the new finding + resolution text pointing at the rule.

## Three implementation paths considered

| Path | Mechanism | Pros | Cons | Selected |
|------|-----------|------|------|----------|
| **A. consult-checklist rule + PROCESS_HINTS + hook mirror + parity test** | New rule with `pattern_type: consult-checklist`; PROCESS_HINTS row references the rule id by literal substring; `.factory/hooks/loop-surface-inject.cjs` mirrors the row; `cold-session-discoverability.test.cjs` enforces parity; originating finding resolved via `meta_state_resolve` | Canonical pattern (matches `rule-tool-integration-same-commit-dep` from `260628-1337`); cold-session discoverable via `loop_describe({tier: warm})`; auditable in registry; future fallow additions inherit the hint | Touches 5 files; needs cold-session parity test maintenance; rule promotion ceremony | **✓** |
| B. Inline `fallow:gate` wrapper | Change `pnpm fallow:gate` to `fallow audit ... \|\| fallow audit ... --brief --format compact` so the brief stream prints inline after the gate fails | One file change; visible inline with the failure; no registry impact | Doubles fallow runtime on commit failure (~+1.5s); mix of two output formats in the same failure context is visually confusing for human devs; doesn't help when agent runs `fallow audit` directly outside pre-commit | ✗ (kept as belt-and-suspenders if user requests) |
| C. Document in AGENTS.md / CLAUDE.md | Add a paragraph: "When `pnpm fallow:gate` fails, run `pnpm fallow:brief` for compact triage." | Zero runtime cost | Agent has to read docs first; doesn't fire on mid-task failure; docs may drift; discoverability is best-effort, not enforced | ✗ |

**Path A is selected** because it matches the codebase's enforcement philosophy (every agent behavior surface is either a rule + PROCESS_HINTS or a gate, never just docs), gives cold-session discoverability for free, and survives mid-task agent invocations.

## Phases

| Phase | Name | Status | TDD Gate |
|-------|------|--------|----------|
| 1 | [Design rule shape](./phase-01-design-rule-shape.md) | Pending | Rule id, fields, 1-item checklist, and PROCESS_HINTS row text frozen in `plan.md` Appendix A |
| 2 | [Promote rule + add PROCESS_HINTS + hook mirror](./phase-02-add-process-hints-and-hook-mirror.md) | Pending | `meta_state_promote_rule` succeeds; PROCESS_HINTS row appended at `core/loop-introspect.js`; LOCAL_PROCESS_HINTS row mirrored byte-for-byte at `.factory/hooks/loop-surface-inject.cjs` |
| 3 | [Verify cold-session parity](./phase-03-verify-cold-session-parity.md) | Pending | `vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs` is green; `loop_describe({tier: warm})` surfaces the new PROCESS_HINTS row; `__tests__/legacy-mcp/gate-logic-consult-checklist-fallow-brief.test.js` (NEW, +2 tests) passes |
| 4 | [Supersede finding + change-log + journal](./phase-04-resolve-finding-and-journal.md) | Pending | `meta-260712T0730Z-fallow-mcp-runtime-needs-format-json` status flipped via `meta_state_supersede`; new change-log entry with `applies_to.rules`; journal at `plans/reports/journal-260714-fallow-brief-discovery.md` |

## Dependencies

- **Upstream:** task 1 of this conversation (added `pnpm fallow:brief` script to `package.json`).
- **Independent of:** `260628-1337-fallow-tool-integration-rule-encoding` (different rule, different domain — this plan encodes a *trigger→action* mapping, that plan encodes a *checklist-for-tool-integration*).
- **Independent of:** `.github/workflows/test.yml` (CI uses the `fallow-rs/fallow@v2` GitHub Action with SARIF; this plan only touches local pre-commit + agent runtime).
- **Downstream (informational):** any future agent task that hits the `fallow:gate` failure path will surface the new PROCESS_HINTS row at session start and discover `pnpm fallow:brief`.

## Architecture

```
plans/260714-1200-fallow-brief-discovery/
├── plan.md                              ← this file
├── phase-01..04-*.md                    ← phases 1-4
└── reports/
    ├── byte-size-measurements.md        ← NEW in Phase 1 step 6
    └── journal-260714-fallow-brief-discovery.md (DRAFTED in Phase 4)

meta-state.jsonl
├── new rule entry (appended): rule-fallow-brief-on-gate-failure
├── new change-log entry (id is timestamp-based): captures the promotion
└── meta-260712T0730Z-fallow-mcp-runtime-needs-format-json: status open → superseded, consolidated_into = <change-log id>

tools/learning-loop-mastra/
├── core/loop-introspect.js              ← MODIFIED: append 5th PROCESS_HINTS row between line 126 (end of row #4 string) and line 127 (`]);`)
└── __tests__/legacy-mcp/
    └── gate-logic-consult-checklist-fallow-brief.test.js  ← NEW: regression test for the new rule

.factory/hooks/
└── loop-surface-inject.cjs              ← MODIFIED: mirror 5th PROCESS_HINTS row to LOCAL_PROCESS_HINTS row #5 between line 39 and line 40 (cold-session parity)
```

**Ordering invariant:** Phase 2 step order is **PROCESS_HINTS append → LOCAL_PROCESS_HINTS append → `loop_describe` verify → `meta_state_promote_rule`**, NOT the natural "promote then append" order. Reversing ensures the rule is born with a matching PROCESS_HINTS row; the H6 ordering gate at `loop-describe-tool.js:94-106` never sees a transient state where the registry has the rule but no PROCESS_HINTS row references it.

**Key design decisions:**

1. **Single `consult-checklist` rule, not a regex rule.** The trigger is "pre-commit returns error", which the agent sees as stderr text containing fallow's `✗` / `●` markers. A regex rule *could* match `✗\s+\d+\s+above threshold|complexity:.*finding` but would fire on any fallow output (including CI SARIF, agent-issued `fallow inspect`, etc.) — too noisy. A consult-checklist rule with a single item ("when fallow:gate fails, run fallow:brief") surfaces in PROCESS_HINTS at session start and reads naturally in the agent's reasoning context.

2. **PROCESS_HINTS row text includes the literal rule id** (`rule-fallow-brief-on-gate-failure`), not a paraphrase. The cold-session parity test (`cold-session-discoverability.test.cjs:359-379`) enforces byte-for-byte parity between `PROCESS_HINTS` and `LOCAL_PROCESS_HINTS`, AND the H6 ordering gate in `loop-describe-tool.js:94-106` uses substring match against `rule.id` — both invariants require the rule id to appear as a literal token in the row text.

3. **PROCESS_HINTS row appended BEFORE `meta_state_promote_rule`** (reversed from natural ordering). The H6 ordering gate (`loop-describe-tool.js:94-106`) emits a warning during any window where a rule exists in the registry without a matching PROCESS_HINTS row. Reversing the order ensures the rule is born with a matching row; the gate never sees a transient state. The cold-session parity test does NOT detect "rule has no PROCESS_HINTS row" (it only checks array equality) — relying on the test alone would leave the warning silent. After each Phase 2 step, run `loop_describe({tier: warm})` and assert no `warnings` array entry before proceeding.

4. **`status=superseded` + `consolidated_into` for the originating finding**, NOT `status=resolved`. The originating finding `meta-260712T0730Z-...` was filed before this plan existed; the right lifecycle for a finding whose description is partly stale but whose domain is still relevant is `superseded` → change-log. This preserves the audit trail of "we considered this, we replaced it." Compare to `rule-tool-integration-same-commit-dep` (260628-1337 Phase 4) which used `resolved` because the findings were already fully fixed by another commit — different lifecycle.

5. **No CI workflow change.** `.github/workflows/test.yml` runs the `fallow-rs/fallow@v2` Action with SARIF; it's orthogonal. The `pnpm fallow:gate` script is local-only (pre-commit hook); CI doesn't invoke it. Touching CI here would be scope creep.

6. **`LOOP_SESSION_MODE=live` is a hard prerequisite for Phases 2 and 4.** Both `meta_state_promote_rule` (`meta-state-promote-rule-tool.js:57-67`) and `meta_state_supersede` (`meta-state-supersede-tool.js:19-21`) are live-gated. Phase 1 step 1 verifies live mode before any implementation lands. The plan does NOT attempt a `meta_state_patch` fallback for Phase 4 — `IMMUTABLE_PATCH_FIELDS` (`core/meta-state.js:392-405`) blocks both `status` and `consolidated_into`, making the fallback physically unreachable.

## Appendix A — Rule shape (frozen in Phase 1)

```yaml
rule_id: rule-fallow-brief-on-gate-failure
enforcement: agent
pattern_type: consult-checklist
pattern: |
  {
    "version": 1,
    "items": [
      {
        "id": "fallow-gate-failure-routes-to-brief",
        "description": "When `pnpm fallow:gate` (or any local `fallow audit --gate new-only` invocation) exits non-zero, run `pnpm fallow:brief` next to get a compact CSV stream (one finding per line with severity/crap/path:line fields) instead of re-parsing the human-readable prose. The brief stream is much smaller than the gate's decorated human report and is machine-actionable when at least one finding exists. On a clean tree the brief is ~50 B with no action needed. Measured byte sizes recorded in plans/260714-1200-fallow-brief-discovery/reports/byte-size-measurements.md (Phase 1 step 6)."
      }
    ]
  }
# No applies_to field — consult-checklist rules carry no surface gate
# (verified: gate-logic.js:750-755 short-circuits consult-checklist;
# line 757 skips enforcement !== 'gate'; surfaces field is decorative).
```

## Appendix B — PROCESS_HINTS row text (frozen in Phase 1)

```text
Fallow gate triage. When `pnpm fallow:gate` (or any local `fallow audit --gate new-only`) exits non-zero from pre-commit, do NOT re-parse the human-readable prose. Run `pnpm fallow:brief` next: it emits a compact-CSV stream (one finding per line: `high-complexity:<path>:<line>:<symbol>:cyclomatic=N,severity=<level>,crap=N,...`). The brief stream is much smaller than the gate's decorated human report and is machine-actionable when at least one finding exists — grep for `severity=` (filter by the finding's actual severity per its meta-state entry, which may be `warning` not `high`); ignore baseline-inherited lines. On a clean tree the brief is ~50 B with no action needed. See `rule-fallow-brief-on-gate-failure` in `meta-state.jsonl` for the full contract.
```

## Appendix C — Files this plan modifies

| Path | Change |
|------|--------|
| `meta-state.jsonl` | Append 1 rule entry + 1 change-log entry; flip finding `meta-260712T0730Z-...` to `superseded` |
| `tools/learning-loop-mastra/core/loop-introspect.js` | Append 5th PROCESS_HINTS row (after line 120, before `]);`) |
| `.factory/hooks/loop-surface-inject.cjs` | Mirror 5th LOCAL_PROCESS_HINTS row (byte-for-byte parity) |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-fallow-brief.test.js` | NEW: 2 regression tests (rule-loads + PROCESS_HINTS-contains-rule-id) |
| `plans/reports/journal-260714-fallow-brief-discovery.md` | NEW: shipped-journal entry |

## Risks & Rollback

| Risk | Mitigation | Rollback |
|------|-----------|----------|
| PROCESS_HINTS row bloats session-start context (4 rows → 5 rows) | Row is ~700 B; under the 4 KB PROCESS_HINTS budget (CLAUDE.md: "warm tier ~10-25 KB") | Remove the 5th row from both `loop-introspect.js` and `loop-surface-inject.cjs`; flip rule `status: active → resolved` via `meta_state_patch` |
| Cold-session parity test fails on byte mismatch | Phase 3 enforces parity BEFORE merging; CI catches any drift | Re-run Phase 3; byte diff must show identical row text (including trailing whitespace) |
| Agent sees the hint but ignores it | PROCESS_HINTS rows are consult-only (no gate enforcement); agent's reasoning decides | Add a `regex`-type rule that fires on `✗` markers in `Bash` output (escalates to a finding entry); out of scope for this plan |
| `meta-260712T0730Z-...` is referenced by other entries (consolidates, supersedes, etc.) | Run `meta_state_relationships({id: 'meta-260712T0730Z-...', direction: 'both'})` in Phase 1 to confirm no inbound refs. Verified 2026-07-14: no inbound refs in current registry — `superseded` path is the default. | If inbound refs exist, switch from `superseded` to `resolved` (per `meta-state-resolve-tool.js:26` schema — `resolved` does not require `consolidated_into`); explicitly omit `consolidated_into` from the change-log payload to avoid the inverse index asymmetry |
| `LOOP_SESSION_MODE` is not live | Phase 1 step 1 verifies before any implementation lands | Plan cannot land without live mode; defer until operator approves |

## Red Team Review

### Session — 2026-07-14
**Findings:** 15 (15 accepted, 0 rejected)
**Severity breakdown:** 4 Critical, 6 High, 5 Medium
**Reviewers:** Security Adversary + Failure Mode Analyst + Assumption Destroyer (parallel)
**Reports:** `reports/from-code-reviewer-to-planner-red-team-{security-adversary,failure-mode-analyst,assumption-destroyer}-plan-review-report.md`

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| A | Phase 4 `meta_state_patch` fallback is impossible (IMMUTABLE_PATCH_FIELDS blocks both `status` AND `consolidated_into`) | Critical | Accept | Phase 4 step 1 + Plan Risks row 5 |
| B | Stale 60s idempotency-cache claim; `reason` parameter does not exist on `meta_state_promote_rule` | Critical | Accept | Phase 2 risk row 1 (rewritten) + Plan design decision #6 |
| C | Byte-size claims (947/9963/642 B / "93% reduction") are fabrications; re-measured on clean tree gave different numbers | Critical | Accept | Plan Overview / Trigger / Appendix A + Phase 1 step 7 (re-measure) |
| D | Phase 4 `resolution` text cites fabricated byte counts in a persisted high-trust audit field | Critical | Accept | Phase 4 step 3 (rewritten qualitatively) |
| E | H6 ordering-gate warning emitted during the window between rule promotion and PROCESS_HINTS append; `.factory/hooks/loop-surface-inject.cjs:281-312` `formatBlock` does not render `warnings[]` | High | Accept | Plan design decision #3 + Phase 2 step order (reversed) |
| F | Mid-rollout drift window has no detection between Phase 2 steps | High | Accept | Phase 2 step 8 (intermediate gate) + step 10 (final gate) |
| G | `applies_to.surfaces: ['gate/bash']` is decorative — bash gate short-circuits on consult-checklist + non-gate enforcement | High | Accept | Plan Appendix A + Phase 2 step 9 MCP call args |
| H | Phase 4 `change_target` 200-char limit claim is false (limit is on `operation_envelope.target`, a different field) | High | Accept | Plan Risks row 2 (200-char row removed); Phase 4 Risk Assessment rewritten |
| I | Phase 1 line range claim (95-122) covers DISCOVERABILITY_HINTS, not PROCESS_HINTS (122-127) | High | Accept | Phase 1 step 4 + step 5 |
| J | Phase 2 PROCESS_HINTS insertion-point line number wrong (`~120` vs 126-127) | High | Accept | Phase 2 step 2 + Plan Architecture diagram |
| N | Appendix B "grep for `severity=high`" example returns 0 lines on clean tree / single low-complexity findings | Medium | Accept | Plan Appendix B + "Desired outcome" caveat |
| O | Phase 3 names wrong canonical loader (`loadPromotedRules` vs `applyPromotedRules`); test depends on Phase 2 having pre-populated registry | Medium | Accept | Phase 3 step 1 + step 2 |
| P | Phase 2 hard-coded description citation `meta-state-promote-rule-tool.js:169` is wrong; correct line is 172 | Medium | Accept | Phase 2 Requirements row 2 |
| R | Cold-session parity test line range off (cited 366-386, actual 359-379) | Medium | Accept | Phase 1 step 6 + Phase 3 step 3 |

**Dropped from cap (out-of-scope for this plan, captured as journal followups):**
- Security #5: `.factory/hooks/**` missing from `CHANGE_LOG_BOUND_PATHS` — separate finding.
- Security #6: `change_target` row-precision anchors stripped by canonicalizer — separate finding.
- Security #7: `rule.pattern` has no schema-level JSON validation — separate finding.

### Whole-Plan Consistency Sweep (2026-07-14)

Re-read `plan.md` and all 4 phase files after applying accepted findings. Reconciled:

- **Byte claims:** plan.md Overview + Appendix A + Appendix B + Trigger/Deliverable wording consistent (qualitative + reference to Phase 1 measurement report). Phase 4 step 3 `resolution` text now qualitative.
- **Line references:** all updated to current code locations (loop-introspect.js:122-127 PROCESS_HINTS, 126-127 insertion; cold-session 359-379; promote-rule-tool:172 hard-coded description). Plan Architecture diagram updated.
- **`LOOP_SESSION_MODE=live` prerequisite:** appears in Phase 1 step 1, Phase 2 step 1, and Phase 4 step 1 (3 places). Plan design decision #6 documents it centrally. Plan Risk row 5 records the consequence.
- **`applies_to` field:** dropped from Plan Appendix A and Phase 2 step 9 MCP call args; `gate-logic.js:750-755, 757` short-circuit cited as the reason.
- **Ordering invariant:** Plan design decision #3 + Plan Architecture "Ordering invariant" callout + Phase 2 step order — all consistent: PROCESS_HINTS → LOCAL_PROCESS_HINTS → loop_describe gate → meta_state_promote_rule.
- **`change_target` length:** "no limit" reasoning appears in Plan Risks row 2 removal discussion, Phase 4 risk row 2, Phase 4 step 2 comment, Phase 4 Risk Assessment. Consistent.
- **`meta_state_patch` fallback:** removed from Phase 4 step 1; Plan Risks row 5 records the live-mode prerequisite; Phase 4 Risk Assessment removes the unreachable fallback. No stale references to "patch fallback" remain.

**Unresolved contradictions:** none.

## Validation Log

### Session 1 — 2026-07-14
**Trigger:** User invoked `/ck:plan validate` after red-team review applied 15 findings and the whole-plan consistency sweep passed.
**Questions asked:** 4

#### Questions & Answers

1. **[Assumption]** The plan is dead without `LOOP_SESSION_MODE === "live"`. What is the actual mode in this session?
   - Options: Yes, live | No, autonomous | Unsure
   - **Answer:** Yes, LOOP_SESSION_MODE is live
   - **Rationale:** Confirms the plan can land. Both `meta_state_promote_rule` (Phase 2 step 9) and `meta_state_supersede` (Phase 4 step 3) will succeed. No fallback path needed.

2. **[Scope]** Phase 1 step 7 requires re-measuring byte sizes on 3 finding-set sizes × 3 formats. Keep or drop?
   - Options: Keep re-measurement (Recommended) | Drop re-measurement (YAGNI) | Measure on clean tree only
   - **Answer:** Keep re-measurement step (Recommended)
   - **Rationale:** Grounds the rationale in measured data; the persisted `resolution` text in Phase 4 references the report instead of quoting fabricated numbers. Cost: ~3 fallow audit runs (clean, 1-finding, ≥5-finding) per format = 9 runs.

3. **[Tradeoff]** Phase 2 ordering reversal adds 2 intermediate gates. Keep complexity or simplify?
   - Options: Keep reversal + intermediate gates (Recommended) | Revert to natural ordering
   - **Answer:** Keep reversal + intermediate gates (Recommended)
   - **Rationale:** H6 ordering gate (`loop-describe-tool.js:94-106`) never sees a transient state where rule exists without matching PROCESS_HINTS row. Cold-session parity test alone does NOT detect this gap (verified by Failure Mode Analyst). Intermediate gates (step 8 + step 10) catch drift mid-rollout.

4. **[Risk]** Phase 4 step 3 calls `meta_state_supersede` to close the originating finding. Acceptable risk?
   - Options: Plan-level hard gate is enough (Recommended) | Add manual operator checkpoint | Drop Phase 4 entirely
   - **Answer:** Plan-level hard gate is enough (Recommended)
   - **Rationale:** Both `promote_rule` and `supersede` are gated by the same env var (`LOOP_SESSION_MODE=live`); plan-level gating at Phase 1 step 1 + Phase 4 step 1 is sufficient. Adding a manual checkpoint would slow the plan without adding safety.

#### Confirmed Decisions

- `LOOP_SESSION_MODE` is live in the current session — plan can land
- Phase 1 step 7 (re-measurement) is in scope — produces `reports/byte-size-measurements.md`
- Phase 2 ordering reversal + intermediate gates — kept as written
- Phase 4 supersede — kept as written, gated on live mode

#### Action Items

- (none — all answers align with current plan content)

#### Impact on Phases

- Phase 1: no changes (re-measurement step 7 already in plan)
- Phase 2: no changes (reversed order + gates already in plan)
- Phase 3: no changes
- Phase 4: no changes (live-mode gate already in step 1)

### Whole-Plan Consistency Sweep (Validation Session 1)

Re-read `plan.md` and all 4 phase files after validation. Reconciled:

- All 4 user answers align with current plan content — no edits required.
- The `LOOP_SESSION_MODE=live` confirmation propagates correctly: Phase 1 step 1 + Phase 2 step 1 + Phase 4 step 1 all verify; Plan design decision #6 + Risks row 5 record the consequence.
- The re-measurement step (Phase 1 step 7) is consistent with the qualitative Phase 4 `resolution` text + Appendix A/B references to `reports/byte-size-measurements.md`.
- The ordering reversal + intermediate gates are consistent with Phase 2 step order, Plan Architecture "Ordering invariant" callout, Plan design decision #3, and Phase 4 step 2 `reason` field.

**Unresolved contradictions:** none.

## Acceptance criteria

- [ ] `meta_state_list({id: 'rule-fallow-brief-on-gate-failure'})` returns the rule with `pattern_type: 'consult-checklist'` and the 1-item checklist body.
- [ ] `loop_describe({tier: 'warm'})` returns PROCESS_HINTS row #5 with the literal `rule-fallow-brief-on-gate-failure` substring.
- [ ] `.factory/hooks/loop-surface-inject.cjs` LOCAL_PROCESS_HINTS row #5 is byte-identical to `tools/learning-loop-mastra/core/loop-introspect.js` PROCESS_HINTS row #5.
- [ ] `vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs` is green (parity test).
- [ ] `vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-fallow-brief.test.js` is green (+2 new tests).
- [ ] `meta_state_list({id: 'meta-260712T0730Z-fallow-mcp-runtime-needs-format-json', compact: false})` returns `status: 'superseded'` with `consolidated_into` pointing at the new change-log id.
- [ ] Full test suite delta is exactly +2 (no regressions); baseline: see `package.json:test` count before Phase 2 lands.
- [ ] Journal entry at `plans/reports/journal-260714-fallow-brief-discovery.md` captures the shipped invariants + lessons (model after `plans/reports/journal-260628-fallow-tool-integration-rule.md`).