---
title: "channel-b-observe-defer-filing"
description: "Close finding meta-260802T0000Z by (1) promoting an agent-checklist steering rule that forces agents to meta_state_report a gate/toolchain failure (category loop-anti-pattern, with session_id) BEFORE deferring it as out-of-scope, and (2) a mechanical PostToolUseFailure capture channel for REPEATED toolchain-command failures (N>=3 per session) that does not rely on agent compliance. Channel A (recurrence-tracker window fix) is already shipped to main; Channel B (agent-initiated filing on observe-and-defer) is the remaining gap, closed by the rule; Phase 3 adds mechanical capture of repeated toolchain failures (not single novel ones — the PostToolUseFailure payload carries no stderr). The rule auto-surfaces at SessionStart via buildProcessView. Measure-then-escalate: define a re-check; resolve the finding when the channel fires in vivo or attests present-by-construction."
status: in-progress
priority: P1
effort: ""
tags: [meta-state, rule, agent-checklist, channel-b, loop-anti-pattern, finding-closure]
created: 2026-08-04
source: plans/reports/brainstorm-260804-1101-channel-b-observe-defer-filing.md
branch: fix/channel-b-observe-defer-filing
---

# channel-b-observe-defer-filing

## Overview

Finding `meta-260802T0000Z-no-feedback-channel-from-live-session-friction-to-finding-pr`
(open, v2, warning, `loop-anti-pattern`) names a gap: live-session friction that is **not**
a bash-gate gate-logic-bug escalation never reaches the registry — it dies in stateful plan
reports. Channel A (the recurrence-trigger window bug) is **already shipped to main**
(commits `ad87a6ec`, `f03bc39f`, `160616b1`; `recurrence-tracker.js` now groups by
`(rule_id, normalized_prefix, session_id)` with no 10-min `since` filter, redacted ids, dedup).
Channel B — the "observe-and-defer" class where an agent *has* `meta_state_report` available
and *chooses* not to file — is the remaining gap. The `-50` coverage/`u32` toolchain failure
(2026-08-03) was never filed and was fixed by external code review (commit `72988c6b`),
proving the channel does not self-correct.

This plan closes the finding with the **Rule + measure, then escalate** approach the user
approved in the brainstorm: promote a steering rule now, define a re-check, and escalate to
auto-capture only if the rule fails to change behavior.

## Brainstorm contract (carried from the accepted report)

- **Outcome:** observe-and-defer / toolchain-failure friction reaches the registry instead
  of dying in plan reports, so the loop's self-model drives resolution.
- **Constraints:** loop-native primitives only (no new substrate). `meta-state.jsonl` is
  committed → any captured content must be redacted (the rule writes prose, not command
  fragments, so this is satisfied by construction). The `reopens`/`cascade_from` writers
  were dropped (PR #109 lifecycle migration); B-revival is "resolve B directly with new
  evidence," not cascade-resolve.
- **Non-goals:** rebuild Channel A (works). Add SessionEnd / commit-msg / push-inline
  triggers. Promote the trigger to `additionalContext`. Re-derive finding B
  (`meta-260615T1920Z`) now. Build Phase 3 auto-capture in this delivery.
- **Acceptance:** (1) an active agent-checklist rule forces `meta_state_report` before
  deferring; (2) "leave-X-open" validation checks the registry for the filed deferral; (3)
  the finding's own resolution does not depend on the disease it names — at least one
  channel actually fires in vivo; (4) no new substrate/files beyond the rule promotion and
  two test-fixture edits; (5) a re-check mechanism is defined.

## Mechanism (scouted, confirmed by research)

- `meta_state_promote_rule` promotes a `loop-anti-pattern` finding to an `agent-checklist`
  rule. It **resets the finding status to `open`** (does not resolve it) — exactly what
  measure-then-escalate needs: the finding stays open until a channel fires in vivo.
  (handler: `tools/learning-loop-mastra/tools/handlers/meta-state-promote-rule-tool.js`;
  description string confirms "Resets the finding status to `open`".)
- A newly promoted `agent-checklist` rule **auto-surfaces at the next SessionStart** with no
  `HINT_REGISTRY` hand-edit: `hooks/universal/session-start-inject-process-hints.cjs` →
  `buildProcessPointers()` → `loadPromotedRules` (filters `entry_kind:rule, status:active`)
  → `buildProcessView` (`core/hint-registry.js`) generates process-hint rows from all active
  agent-checklist rules at read time, resolving `text` from `rule.hint_text`.
- `agent-checklist` promotion **requires** `hint_text` (≥20 chars) + `hint_suggestion`
  (20–200 chars, single-line) at the validation layer, plus `pattern` as a JSON blob
  `{version, items:[{id, description}]}`.
- `affected_system` is a **closed 15-value enum** (`core/meta-state.js:295-311`). The promote
  tool has **no `affected_system` field**; `writeEntry` → `withDefaults` sets the rule's
  `affected_system` to `"meta"` (the `AFFECTED_SYSTEM_DEFAULT`, `core/meta-state.js:313`). The
  rule lands as `"meta"` — correct for a cross-surface meta-loop discipline rule (matches
  sibling rules `rule-assertinvariant-at-boundary`, `rule-no-plan-ids-in-stable-code-artifacts`),
  **not** the finding's `meta-state-tools`. Do not claim inheritance.

## What this delivery ships (honesty)

Two channels, complementary:
- **Channel B (Phase 1, agent-facing rule).** A steering nudge: the rule makes the file-
  before-defer obligation explicit at SessionStart and persists the open finding as a
  reminder. It is `enforcement: "agent"` (advisory) — the same channel that failed once, now
  made explicit and guarded by regression tests for its *presence*. It catches the
  single-novel-failure class (like the `-50`) IF the agent complies.
- **Channel C (Phase 3, mechanical capture).** A `PostToolUseFailure` hook that records
  repeated toolchain-command failures (N≥3 per session) into the registry without agent
  cooperation. It does NOT catch single novel failures (the `PostToolUseFailure` payload
  carries no stderr; threshold N≥3) — that class stays Channel B's job.

The finding's thesis — that the strongest signal only enters via manual retrospective — is
addressed: Channel C captures repeated toolchain failures mechanically, and Channel B
captures the agent-observed single episode. Phase 2's re-check verifies Channel B fires in
vivo. Only criterion (A) (an in-vivo filing) is a self-correcting close; criterion (B)
(present-by-construction attestation) closes on weaker evidence.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Promote the `rule-defer-needs-filing` agent-checklist rule (Channel B steering rule) | P1 |
| 2 | Verify the rule surfaces at SessionStart via `buildProcessView` (live-registry invariants green) | P1 |
| 3 | Define the measure re-check + resolve/escalate criteria for the finding | P2 |
| 4 | Mechanical capture of repeated toolchain-command failures (Channel C, PostToolUseFailure) | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Promote the agent-checklist rule (TDD)](./phase-01-promote-rule.md) | Pending |
| 2 | [Phase 2: Measure re-check + resolve/escalate criteria](./phase-02-measure-and-resolve.md) | Pending |
| 3 | [Phase 3: Auto-capture repeated toolchain-command failures](./phase-03-toolchain-failure-autocapture.md) | Pending |

## Success Criteria

- [ ] `rule-defer-needs-filing` is active, `enforcement: agent`, `pattern_type: agent-checklist`, carries `hint_text` + `hint_suggestion`, `affected_system: "meta"` (the promote default — the tool has no `affected_system` field).
- [ ] `buildProcessView` against the live registry emits 12 process-hint slugs including `defer-needs-filing`; the locked slug-set test (`hint-registry.test.cjs`) is updated and green.
- [ ] The mock fixture (`__tests__/helpers/agent-checklist-rules.cjs`) lists the new rule; mock-based process-hint tests pass.
- [ ] Finding `meta-260802T0000Z` remains `open` after promotion (promote resets to open) — resolution is deferred to Phase 2's criteria, not auto-closed.
- [ ] Phase 2 documents the re-check query, the resolution criterion, and the escalation trigger; the finding is resolved (or attested) per those criteria.
- [ ] Phase 3: a non-zero Bash toolchain-command failure appends a redacted `toolchain-failure` entry; 3 same-command failures in one session file a finding; hook + shims mirrored across all three surfaces; `check_runtime_agnostic` clean.
- [ ] `pnpm test` green.

## Related Code Files

- Modify: `tools/learning-loop-mastra/__tests__/hint-registry.test.cjs` (locked 11→12 slug set)
- Modify: `tools/learning-loop-mastra/__tests__/helpers/agent-checklist-rules.cjs` (mock fixture)
- Write (via CLI, not hand-edit): one `rule` entry in `meta-state.jsonl` via `meta_state_promote_rule`
- Create (Phase 3): `tools/learning-loop-mastra/hooks/universal/toolchain-failure-capture.js` + `.claude`/`.factory`/`.mastracode` coordination shims; `PostToolUseFailure` wiring in all three settings; `__tests__/toolchain-failure-capture.test.cjs`; possible minimal widening of `core/recurrence-tracker.js` `checkAndEmit` evidence_code_ref fallback
- Read-only grounding: `tools/learning-loop-mastra/tools/handlers/meta-state-promote-rule-tool.js`, `core/hint-registry.js`, `core/loop-introspect.js`, `hooks/universal/session-start-inject-process-hints.cjs`, `hooks/universal/bash-gate.js`, `core/gate-decision-log.js`, `core/recurrence-tracker.js`

## Risk Assessment

- **Rule compliance is the known weak point.** The `-50` agent had `meta_state_report` and
  did not file. A steering rule is the same channel that already failed once. Mitigation:
  Phase 2's re-check is what catches a repeat; the rule is the *intervention*, the re-check is
  the *verification*. Phase 3's mechanical capture (N≥3) backstops *repeated* toolchain
  failures without agent cooperation, but a single-episode rule failure still has no
  mechanical backstop — that routes to a separate plan (Phase 2 Step 3).
- **"Toolchain failure" boundary.** The rule scopes to failures the agent *defers as
  out-of-scope*, not every non-zero exit (lint warnings, flaky tests do not warrant filing).
  The `pattern` item description encodes this boundary.
- **Finding B (`meta-260615T1920Z`).** Untouched in this delivery. With `reopens` gone,
  B-revival is "resolve B with new evidence"; defer until the trigger produces structured
  counts.
- **Stale plan bookkeeping.** `plans/260802-0237-meta-state-lifecycle-migration` frontmatter
  says `in-progress` but all phases are Completed (commit `58d8fd5c`). Not a blocker; noted
  for cross-plan honesty. The `260802-1606-recurrence-trigger-window` plan status is likewise
  stale (Channel A shipped to main).
- **TDD red signal depends on the live registry.** The locked-slug-set test runs
  `buildProcessView` against the real `meta-state.jsonl`; the red→green transition is
  real, not hermetic. CI runs against the committed registry, so the test is deterministic
  post-promotion.

## Open Questions

- **Re-check cadence N.** Operator-intent constant (how many sessions before
  present-by-construction attestation). Default proposed in Phase 2: N=5 sessions. Revisit
  from data once the rule ships.
- **Should the finding resolve on attestation if no observe-and-defer episode recurs?** Phase
  2 proposes yes (channel present-by-construction), but this is the operator's call at the
  re-check.

## Handoff

Next: `/ak:plan red-team` (deep mode) then `/ak:plan validate`, then `/ak:cook <plan-path>`.