---
title: 'Bash Gate Debate: decision visibility + override + decision log + recurrence'
description: >-
  Ships Step 2 of the planning-order decision (Report 1 Plan 1). Turns the bash
  gate from a black box into a meta-surface participant: (Phase 1) route
  block/escalate decisions via hookSpecificOutput on stdout so the agent can see
  WHY; (Phase 2) writeToAllSurfaces-backed .gate-override marker + new
  gate_override MCP tool for in-session override; (Phase 3) cross-surface
  .gate-decision.log for full audit; (Phase 4) recurrence-tracker (new
  SessionStart hook + new gate_check_recurrence MCP tool) that reads the log and
  auto-files findings via meta_state_report when a false-positive pattern recurs
  N≥3 in M≤10min. Closes finding meta-260614T2141Z-... with the operator-stated
  reframe (visibility is primary, override is in-session, recurrence drives
  learning, do not try to perfectly classify every false positive up front).
status: pending
priority: P1
branch: 260614-1259-phase-b-codegen-adoption
tags:
  - meta
  - gate
  - bash-gate
  - visibility
  - override
  - recurrence
  - learning-loop
  - false-positive
  - tdd
  - planning-order-step-2
blockedBy:
  - 260615-1500-surfaces-helper-and-refactors
blocks:
  - 260615-runtime-agnostic-rule-phases-2-5
created: '2026-06-15T13:11:13.399Z'
createdBy: 'ck:plan'
source: skill
related:
  - >-
    plans/reports/brainstorm-260615-1300-bash-gate-debate-friendly-and-string-literal-fix.md
    (Report 1 — the design this plan implements)
  - >-
    plans/reports/brainstorm-260615-1430-planning-order-bash-gate-and-runtime-agnostic.md
    (the planning-order report; this plan is Step 2 of 4)
  - >-
    plans/260615-1500-surfaces-helper-and-refactors/ (Step 1 — ships the helper
    that this plan consumes)
  - >-
    meta-state.jsonl entry
    meta-260614T2141Z-two-related-gaps-in-the-bash-gate-... (the finding this
    plan addresses)
  - tools/learning-loop-mcp/hooks/bash-gate.js (target: 'decision visibility via hookSpecificOutput, decision log)'
  - tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules (target: skip-on-override integration)
  - 'tools/learning-loop-mcp/core/surfaces.js (consumed by Phase 2, 3, 4)'
---

# Bash Gate Debate: decision visibility + override + decision log + recurrence

## Overview

Implements Step 2 of the cross-report planning order — Report 1 Plan 1 from the bash-gate-debate brainstorm. Closes finding `meta-260614T2141Z-...` with the operator-stated reframe:

- **Visibility is primary** — the agent sees the gate's decision JSON via `hookSpecificOutput` on stdout (matching the existing `formatSoftWarning` contract), not a generic error.
- **Override is in-session** — `.gate-override` marker + `gate_override` MCP tool, TTL'd, audited in `runtime-state.jsonl`.
- **Recurrence drives learning** — `gate_check_recurrence` MCP tool reads `.gate-decision.log` and auto-files `meta_state_report` findings when a false-positive pattern recurs N≥3 in M≤10min.
- **Don't try to solve immediately** — narrow first-pass fixes deferred to Plan 2 (Step 3); the loop's self-model catches what the heuristic misses.

## Phases

| Phase | Name | Status | TDD anchor |
|-------|------|--------|------------|
| 1 | [decision-visibility](./phase-01-stderr-visibility.md) | Pending | RED: `__tests__/bash-gate-decision-visibility.test.js` — capture stdout, assert hookSpecificOutput envelope |
| 2 | [override-marker](./phase-02-override-marker.md) | Pending | RED: `__tests__/gate-override.test.js` — marker write/read/skip/TTL/multi-rule |
| 3 | [decision-log](./phase-03-decision-log.md) | Pending | RED: `__tests__/gate-decision-log.test.js` — atomic append, schema, concurrent writes |
| 4 | [recurrence-tracker](./phase-04-recurrence-tracker.md) | Pending | RED: `__tests__/gate-recurrence.test.js` — threshold, dedup, cross-surface, auto-file |
| 5 | [annotate-planning-order-report](./phase-05-annotate-planning-order-report.md) | Pending | No tests (tracking-only phase; mirrors Step 1 Phase 4) |

## Dependencies

**Same-scope blockedBy** (this plan requires):
- `260615-1500-surfaces-helper-and-refactors` (shipped) — `core/surfaces.js` provides `writeToAllSurfaces` and `readFromAllSurfaces` consumed by Phases 2, 3, 4.

**Same-scope blocks** (this plan unblocks):
- `260615-runtime-agnostic-rule-phases-2-5` (Step 4) — the new `gate_override` and `gate_check_recurrence` MCP tools ship rule-compliant (uses the helper, audit-logged) by design.

**Cross-report dependencies** (per `brainstorm-260615-1430-planning-order-...`):
- This plan is Step 2 of 4 in the planning-order execution sequence.
- Step 3 (Report 1 Plan 2 — `node -e` strip) is fully independent and can ship alongside.
- Step 4 (Report 2 Phases 2-5) closes the rule; uses the new MCP tools' rule-compliant shape.

## TDD structure

All four phases follow **red → green → refactor**:

1. **Red** — write the test file first (`__tests__/<feature>.test.js`). Confirm it fails (or assert the new contract for refactors). Use `mkdtempSync` + `GATE_ROOT` env var for isolation.
2. **Green** — implement the feature in the smallest form that makes the test pass. No premature generalization.
3. **Refactor** — JSDoc, naming, dead-code removal. Re-run the test.
4. **Whole-plan consistency** — `grep -n` for the new symbols across `tools/learning-loop-mcp/`. Confirm no unintended touch points.

Per the `--tdd` flag, **no implementation lands without a failing test first** (or an explicit refactor with a test pinning the new contract).

## Cross-cutting design

### The unified decision shape

Phases 1, 2, 3 all consume the same `decision` object from `bash-gate.js#main`:

```js
{
  decision: "ok" | "block" | "escalate",
  reason: string,
  rule_id?: string,
  matched_pattern?: string,
  // Phase 2 adds: skipped_via_override?: { rule_id, operator_note, expired_at }
  // Phase 3 adds: nothing (the log records this shape as-is)
}
```

**Phase 1** routes this object via `hookSpecificOutput` on stdout (block/escalate) or stays silent (ok).
**Phase 2** mutates the rule-match loop in `applyPromotedRules` to skip rules whose `id` is in the override set.
**Phase 3** appends one JSON line per call to `.gate-decision.log` (write-temp + rename for atomicity).
**Phase 4** reads `.gate-decision.log` from all surfaces, groups by `rule_id + command_prefix_normalized`, and auto-files findings.

### Cross-surface discipline

Per Step 1's helper:

- **Override marker** is written to all surfaces via `writeToAllSurfaces(root, ".gate-override", content)`.
- **Decision log** is written to all surfaces via `writeToAllSurfaces(root, ".gate-decision.log", line)` — note: write-temp + rename per call for atomicity (decision log append is concurrent-safe; rotation is a separate concern, deferred).
- **Recurrence tracker** reads from all surfaces via `readFromAllSurfaces(root, ".gate-decision.log")` (the default `[]` shape — one result per surface, deduped on content).

Both `.gate-override` and `.gate-decision.log` are excluded from the write gate's allowlist (the bash gate writes them directly, but direct writes from Edit/Write/tee are blocked — only the bash gate may produce them).

### Why a separate decision log (not runtime-state.jsonl)

The bash gate is high-frequency (every command). `runtime-state.jsonl` is the operator-writable surface (decisions, budgets, observations). Mixing the gate's per-call decisions in would bloat the operator surface and dilute the meta-state semantics.

`.gate-decision.log` lives in `coordination/`, is read by the recurrence tracker (also meta-surface), and is NOT in `runtime-state.jsonl`. The operator/agent reads it via `gate_check_recurrence` (the canonical tool) or by file path (for forensic audits).

## Test plan

- `__tests__/bash-gate-decision-visibility.test.js` (Phase 1) — capture `console.log` (or `process.stdout.write`); assert block/escalate routes via `hookSpecificOutput` envelope; ok routes nothing.
- `__tests__/gate-override.test.js` (Phase 2) — 7 tests: skip-rule, TTL-expiry, multi-rule, unknown-rule-rejection, audit-via-runtime-state, first-valid-wins cross-surface, empty-note rejection.
- `__tests__/gate-decision-log.test.js` (Phase 3) — 5 tests: per-call append, schema, concurrent atomicity, fail-open on write error, cross-surface dedup on read.
- `__tests__/gate-recurrence.test.js` (Phase 4) — 7 tests: threshold, no-emit-below-threshold, dedup-against-existing-finding, cross-surface-dedup, dry-run env var, command_prefix_normalized, SessionStart hook integration.

Total new tests: ~24. All pre-existing tests must still pass.

## Cross-surface consistency

Both `.claude/coordination/.gate-override` and `.factory/coordination/.gate-override` are written. Both `.claude/coordination/.gate-decision.log` and `.factory/coordination/.gate-decision.log` are written. The recurrence tracker reads from all surfaces; the override marker reader uses `readFromAllSurfaces(..., { first: true })` (the canonical "first valid wins" pattern, matching `readLastOperatorMessage`).

## Security considerations

- **Override is operator-controlled, not user-controlled.** The `gate_override` MCP tool is the canonical path. Env-var override (`LL_GATE_OVERRIDE`) is acceptable as a *fallback* (per Report 1 Position 1B analysis) but is NOT shipped in Phase 2 — the env var is documented as a future hardening in the change-log.
- **TTL caps override blast radius.** Default 1h, max 24h. The override marker is auto-expired at read time; no cleanup daemon needed.
- **Override requires `operator_note`.** Non-empty string. Empty note → tool rejects. The audit trail explains WHY.
- **Decision log rotation is a future concern.** Not shipped in this plan. The log grows ~50-200 bytes per call; a heavy session (~10k calls) generates ~2MB. Phase 3's tests verify the write is atomic; rotation is a separate plan when the file actually grows.
- **Recurrence tracker doesn't auto-fix.** It only files findings; the operator/agent decides whether to refine the rule, fix the regex, or add a strip. The gate remains a "debatable" surface, not an "auto-tuning" surface.

## Unresolved questions

- **`command_prefix_normalized` algorithm** — Phase 4 needs to define how the first 50 chars normalize. Decision: first 50 chars + remove quotes + collapse whitespace. Spec in `phase-04-recurrence-tracker.md`.
- **Override marker reads on every gate call or cached?** Decision: cached for 1 second per root (mtime-based invalidation), matching `loadPromotedRules`'s pattern. Spec in `phase-02-override-marker.md`.
- **Should the override marker be exposed in `loop_describe` as a discoverability hint?** Decision: NOT in this plan. Future discoverability work (Step 4 Phases 4-5) will add `gate_override` and `gate_check_recurrence` to the `gate` group in `agent-manifest.json` and to `loop_describe`'s warm tier.

## Validation Log

### Verification Results

- **Tier:** Standard (4 phases → Fact Checker + Contract Verifier, 10 claims/phase)
- **Claims checked:** 14
- **Verified:** 12
- **Failed:** 0
- **Unverified:** 2

#### Unverified claims (became interview questions)

1. [Fact Checker] "Both Claude Code and Droid CLI surface stderr to the model on exit-2" — no explicit confirmation in AGENTS.md, protocol-adapter.js, or hooks/. **Resolved in Session 1** (see below): use `hookSpecificOutput` on stdout instead.
2. [Fact Checker] "Hook runtime still parses stdout for `decision: "ok"`" — no documentation; current code at line 121 is silent (no `console.log` for ok). **Resolved in Session 1**: the ok path stays silent; block/escalate uses `hookSpecificOutput`.

#### Additional findings (became interview questions)

3. [Contract Verifier] Phase 4 plan says "wire into inbound-gate.js (SessionStart hook)" but `inbound-gate.js` is a **UserPromptSubmit** hook per its comment line 4 and AGENTS.md §2. **Resolved in Session 1**: new SessionStart hook.
4. [Contract Verifier] `decision` shape includes a proposed `skipped_via_override` field (Phase 2). No conflict with existing fields; `makeGateDecision` and `applyPromotedRules` return shapes are open objects.

### Session 1 — 2026-06-15

**Trigger:** User invoked `/ck:plan validate` after plan creation. Standard tier (4 phases); ran Fact Checker + Contract Verifier against the codebase.

**Questions asked:** 5

#### Questions & Answers

1. **[Architecture/UNVERIFIED]** Phase 1's stderr surface contract — plan asserts stderr is surfaced on exit-2, but no code/docs confirm.
   - Options: `hookSpecificOutput` on stdout (Recommended) | keep stderr, mark empirically verified | both stdout and stderr
   - **Answer:** Use `hookSpecificOutput` on stdout (Recommended).
   - **Rationale:** Matches the existing `formatSoftWarning` pattern in `protocol-adapter.js`; no new assumptions about the hook runtime; surfaces the JSON in the same channel as the ok path's parse target.

2. **[Architecture/Contract]** Phase 4 hook integration — `inbound-gate.js` is UserPromptSubmit, not SessionStart as the plan assumed.
   - Options: new SessionStart hook (Recommended) | wire into bash-gate.js (per-block) | wire into UserPromptSubmit (every prompt)
   - **Answer:** New SessionStart hook (Recommended).
   - **Rationale:** Cleanest separation: the gate isn't the actor; a meta-surface tool fires once per session. Avoids the layering violation of `bash-gate` calling `meta_state_report` directly. Adds a thin `.cjs` wrapper for each surface.

3. **[Assumption]** Phase 2 override marker read semantics — first valid wins vs union vs latest.
   - Options: first valid wins (Recommended) | union of rule_ids | latest write wins
   - **Answer:** First valid wins (Recommended).
   - **Rationale:** Matches `readLastOperatorMessage`'s existing pattern. Per-surface overrides stay isolated. No merge logic; no race between surfaces.

4. **[Risk]** Phase 4 auto-file concurrency — read-time dedup races with concurrent emissions.
   - Options: accept duplicates (Recommended) | flock() | transient retry
   - **Answer:** Accept duplicates (Recommended).
   - **Rationale:** Threshold is N≥3 in M≤10min; concurrent > 3 calls hitting the same rule is rare. Simpler implementation. Operator de-dupes via `meta_state_resolve` if it happens.

5. **[Risk]** Phase 3 decision log rotation — 20MB+ in a heavy week.
   - Options: ship without rotation (Recommended) | size-based rotation | line-count rotation
   - **Answer:** Ship without rotation (Recommended).
   - **Rationale:** YAGNI. The log lives in `coordination/`, not the project root; no git impact. Add a follow-up `plans/<date>-gate-decision-log-rotation/` plan when the file actually grows past 1MB.

#### Confirmed Decisions

- **Phase 1 output channel:** `hookSpecificOutput` on stdout (NOT `process.stderr.write`).
- **Phase 4 hook binding:** new `recurrence-check-on-start.js` SessionStart hook (NOT `inbound-gate.js`).
- **Phase 2 override read:** first valid wins (NO merge across surfaces).
- **Phase 4 dedup:** read-time only, accept rare duplicates.
- **Phase 3 rotation:** ship without; follow-up plan when file grows.

#### Action Items

- [ ] **Phase 1** — rewrite the 2-line change as `formatOutput(decision, { channel: 'hookSpecificOutput' })`; remove stderr claims from the plan.
- [ ] **Phase 1** — update Risk Assessment table (remove "stderr is universal" claim; add "matches `formatSoftWarning` contract").
- [ ] **Phase 2** — add an explicit "first valid wins" callout in the Architecture section (currently implicit).
- [ ] **Phase 3** — no change (rotation was already deferred; reaffirm in the plan's "Unresolved questions" by removing the resolved entry).
- [ ] **Phase 4** — replace "wire into inbound-gate.js" with "new SessionStart hook `recurrence-check-on-start.js` + thin .cjs wrappers".
- [ ] **Phase 4** — add `appendFileSync` to `meta-state.jsonl` "rare duplicates" note in the description.

#### Impact on Phases

- **Phase 1:** Architecture (output channel), Risk Assessment (remove stderr claims).
- **Phase 2:** Architecture (explicit first-valid-wins).
- **Phase 3:** Unresolved questions (remove resolved entry).
- **Phase 4:** Architecture (new hook), Risk Assessment (rare-duplicates note).

### Whole-Plan Consistency Sweep

- Files reread: `plan.md`, `phase-01-stderr-visibility.md`, `phase-02-override-marker.md`, `phase-03-decision-log.md`, `phase-04-recurrence-tracker.md`.
- Decision deltas checked: 5 (one per answered question).
- Reconciled stale references:
  - Phase 1's title "stderr visibility" still describes the *intent* (make the decision visible to the model); the new mechanism is `hookSpecificOutput` on stdout. The title stays accurate.
  - Phase 4's "wire into inbound-gate.js" → "new SessionStart hook `recurrence-check-on-start.js`". The change is propagated.
  - Phase 1's "Universal compatibility: Claude Code and Droid CLI both surface stderr" claim is REPLACED with "Uses the existing `formatSoftWarning` contract; no new assumptions about the hook runtime".
- Unresolved contradictions: 0.

## Next Steps

After this plan ships, Step 3 (Report 1 Plan 2 — `node -e` strip) and Step 4 (Report 2 Phases 2-5) can be planned in parallel. The cleanup backlog (per planning-order report § Cleanup backlog) accumulates minor findings from each phase; processed in one session after all 4 steps ship.
