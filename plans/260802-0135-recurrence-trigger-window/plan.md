---
title: "recurrence-trigger-window"
description: "Fix the gate-escalation recurrence trigger's time window so the already-wired SessionStart auto-file fires for human-paced cadence. Replace the 10-min time axis with a per-session axis, redact command prefixes before they reach the committed registry, add a resolved-finding grace window, and wire the reopens linkage to accepted-limitation findings."
status: cancelled
priority: P1
effort: ""
tags: [gate, recurrence, meta-state, hook, security]
created: 2026-08-02
source: plans/reports/investigation-260802-0052-recurrence-trigger-design.md
branch: fix/recurrence-trigger-window
superseded_by: plans/reports/investigation-260802-0152-meta-state-lifecycle-modeling.md
---

> **CANCELLED 2026-08-02.** Validation surfaced that the `reopens` linkage (P4)
> depends on a meta-state lifecycle-modeling question the owner wants resolved first:
> the rule↔finding relationship, whether `superseded` is needed, and how "accepted
> limitations" should be modeled (they are currently `open` findings, which the owner
> considers not tight enough). See
> `plans/reports/investigation-260802-0152-meta-state-lifecycle-modeling.md`.
> P1–P3 + P5 (session grouping, secret redaction, grace window, regression) are
> settled and independent of that question; they can be revived from this plan once
> the lifecycle model is tightened. P4 (reopens) will be re-scoped by the lifecycle
> report's outcome.

# recurrence-trigger-window

## Overview

The gate-escalation recurrence pipeline is already built and wired: `bash-gate.js`
push-captures every escalation into `.gate-decision.log`; `core/recurrence-tracker.js`
aggregates and auto-files `recurring-false-positive` findings; the
`recurrence-check-on-start.js` SessionStart hook calls `checkAndEmit` every session.
**It has never fired in production** — there are **zero** findings with
`subtype: "recurring-false-positive"` in the registry (the `meta-260802T0000Z` matches
are `loop-anti-pattern` findings *about* the trigger, not auto-filed findings),
confirming the diagnosis in `investigation-260802-0052`.

The root cause is a **window bug**, not missing machinery. `findRecurrentGroups`
filters `readDecisionLog({ since: now - 10min })`. The 10-min window does double duty
as both *burst definition* and *scan range*. At the next SessionStart, a prior
session's burst is >10 min old → zero groups → nothing filed. Human-paced cadence
(sessions hours/days apart) never satisfies the window.

This plan implements the loop-native fix from the investigation report (§5): replace
the time axis with the **session axis**, ship the secret-redaction GO blocker, add a
resolved-finding grace window, and wire the reopens linkage. No new substrate, no new
tools, no new schema fields (the schema already carries `session_id`, `recurrence_key`,
`reopens`, `resolved_at` — confirmed in `investigation-260802-0052` §6).

**Non-goals (explicitly rejected by the report §3, §4):** push-inline `checkAndEmit` in
the gate critical path; SessionEnd trigger; commit-msg trigger; promoting the trigger
to `additionalContext` (it stays in the silent-write channel — 0 agent tokens); the
P3 commit-time summary printer; re-deriving finding B from this retrospective (wait
for structured counts).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | The SessionStart trigger fires for human-paced cadence by grouping per-session and dropping the 10-min scan filter (one finding per prefix per call — in-call dedup) | P1 |
| 2 | No secret-shaped command fragment reaches the committed `meta-state.jsonl` via the recurrence finding | P1 |
| 3 | A resolved `recurring-false-positive` does not re-file from stale log entries every SessionStart (grace window) | P2 |
| 4 | A newly filed recurring finding records the `reopens` link to its accepted-limitation finding | P2 |
| 5 | The trigger stays stateless (full-log scan + dedup) and in the silent-write channel (no `additionalContext`) | P2 |

## Phases

| # | Phase | Status | Depends on |
|---|-------|--------|------------|
| 1 | [Phase 1: Session-axis grouping + session_id capture](./phase-01-session-axis-grouping.md) | Pending | — |
| 2 | [Phase 2: Secret redaction (GO blocker)](./phase-02-secret-redaction.md) | Pending | 1 |
| 3 | [Phase 3: Resolved-finding grace window](./phase-03-grace-window.md) | Pending | 2 |
| 4 | [Phase 4: Reopens linkage to accepted limitations](./phase-04-reopens-linkage.md) | Pending | 3 |
| 5 | [Phase 5: Stateless scan + integration regression](./phase-05-integration-regression.md) | Pending | 4 |

Phases are ordered by dependency: the grouping key (P1) must carry `session_id` before
the redaction (P2) hashes the prefix into `recurrence_key`; the grace window (P3)
widens the same `checkAndEmit` dedup filter touched by P2; the reopens linkage (P4)
reads the same registry; P5 is the cross-phase integration regression.

## Design decisions (grounded)

These resolve the report's open questions via code scouting performed during planning.
Each is the default pending the validation interview (see Open Questions).

1. **`session_id` source — RESOLVED.** Claude Code's PreToolUse hook input carries a
   top-level `session_id` (UUID; confirmed against the Claude Code hooks schema).
   `parseInput(stdin)` in `hooks/universal/lib/protocol-adapter.js` returns the full
   parsed object, so `input.session_id` is available in `bash-gate.js`. For runtimes
   that do not carry it (Droid CLI), fall back to `getSessionId(root)` from
   `core/worktree-session-id.js` (worktree-stable hash of `.git/HEAD`). This gives
   true per-session grouping on the primary runtime and degrades to per-worktree
   grouping elsewhere. `recurrence_key` stays `rule_id::normalized_prefix`
   (cross-session dedup, unchanged) — `session_id` is in the *grouping* key only.

2. **Secret redaction — hash, not heuristic.** `recurrence_key` embeds the raw
   normalized prefix (≤50 chars), so it can leak secrets (e.g.
   `curl https://api?token=eyJ…`) into the **committed** `meta-state.jsonl`
   (`.gate-decision.log` is gitignored via `.gitignore:4 *.log`; `meta-state.jsonl` is
   tracked — confirmed `git ls-files`). The report's "drop `sample_commands`, keep
   `recurrence_key`" option is **insufficient** — `recurrence_key` itself leaks. This
   plan **hashes the prefix** in `recurrence_key` (`rule_id::sha256(prefix)[:12]`) and
   drops raw `sample_commands` from the `description`. Provably non-reversible: no
   secret can reach the committed file regardless of shape. Raw commands remain only
   in the gitignored decision log for operator forensics. There are **zero** existing
   `recurring-false-positive` subtype findings, so the format change is **free** (no
   dedup-compat break). **In-call dedup (red-team C1):** per-session grouping can
   return multiple groups sharing one `recurrence_key` (same prefix, different
   sessions); `checkAndEmit` must dedup `fresh` groups by `recurrence_key` within the
   call so it writes **one finding per key**, not one per session.

3. **Grace window — default N=14 days, tunable.** Widen `checkAndEmit`'s `existing`
   filter from `isOpen(e)` to `isOpen(e) || (e.status === "resolved" &&
   withinGrace(e.resolved_at))` with one constant `RESOLVED_GRACE_DAYS = 14`. Predicates
   on meta-state's existing `resolved_at` (not runtime-state — see report §7). The
   policy (forever vs N-days) is operator-intent; 14 days suppresses noise from a
   recently-resolved pattern while re-surfacing genuinely recurring-again patterns
   after a gap. Revisit from data once the trigger ships (report §7).

4. **Reopens — curated map, defer cascade-resolve.** The report assumed the recurring
   finding's `rule_id` matches an accepted-limitation finding. **Finding B
   (`meta-260615T1920Z-the-new-stripnodeevalbody-function-in-tools-learning-loop-mc`,
   subtype `strip-bypass-accepted`) has `rule_id: None`** — the rule_id-match mechanism
   is refuted by data. Existing `reopens` usage is manual (17 registry precedents; the
   filer sets `reopens` explicitly). This plan adds a small curated
   `RULE_TO_ACCEPTED_LIMITATION` map in `recurrence-tracker.js`; when a fresh group's
   `rule_id` is mapped, the new finding is written with
   `reopens: ['<accepted-limitation-id>']`. The cascade-resolve
   (`meta_state_resolve({ id, cascade_from })`) is **not auto-run from the hook** — a
   `console.error` pointer recommends it, and the operator/agent runs it during triage
   (matching the existing manual pattern; avoids a hook auto-closing an
   operator-acknowledged finding, and avoids core→tool-handler layering). Unmapped
   rule_ids file without `reopens` (graceful). **Existence guard (red-team C2):**
   `writeEntry`'s schema only validates the `reopens` id *prefix* (`meta-`/`rule-`/
   `loop-design-`), **not registry existence** — a typo'd map id would write a dangling
   pointer. `checkAndEmit` therefore asserts the mapped id exists in the registry before
   setting `reopens` (skip + warn if stale). This **records the Channel-A link**; the
   closure itself (cascade-resolve) is operator triage, not a hook action.

## Success Criteria

- [ ] `findRecurrentGroups` groups by `(rule_id, normalized_prefix, session_id)`,
      threshold N≥3 **per session**, with no `since` time filter; a burst from a prior
      session (any age) is detected at the next SessionStart.
- [ ] `checkAndEmit` writes **one finding per `recurrence_key` per call** (in-call
      dedup of `fresh` groups), even when multiple sessions cross threshold for the
      same prefix.
- [ ] Decision-log entries written by `bash-gate.js` carry `session_id` (Claude Code
      UUID; `getSessionId(root)` fallback for runtimes without it).
- [ ] A decision log containing a secret-shaped prefix
      (`curl https://api?token=eyJ…`) produces a finding whose `recurrence_key` and
      `description` contain **no** raw secret fragment (verified by grepping the
      emitted `meta-state.jsonl`).
- [ ] A resolved finding with the same `recurrence_key` suppresses re-filing within the
      grace window and re-files after it.
- [ ] A fresh group whose `rule_id` is in `RULE_TO_ACCEPTED_LIMITATION` files a finding
      with `reopens: ['<accepted-limitation-id>']`; unmapped rule_ids file without
      `reopens`.
- [ ] The SessionStart hook emits no `hookSpecificOutput.additionalContext` (stays in
      the silent-write channel; 0 agent tokens).
- [ ] `pnpm test` (recurrence + meta-state suites) and the runtime-agnostic audit pass.

## Open Questions (for validation interview)

1. **Grace-window policy** — forever vs N-days? Default is N=14 days. Suppress-forever
   risks hiding a genuinely recurring-again pattern; suppress-too-brief risks noise.
2. **Reopens cascade** — auto-run `meta_state_resolve` from the hook (report's literal
   intent: B auto-closed by in-vivo evidence), or defer to operator triage (default;
   matches the 17 manual precedents; avoids a hook auto-closing an operator-acknowledged
   finding)? If auto-run, the core→tool-handler layering must be resolved (extract a
   core `resolveEntry` primitive or call `applyUpdateAndCheck` directly).
3. **Reopens mapping mechanism** — curated `RULE_TO_ACCEPTED_LIMITATION` map (default;
   explicit, one entry now) vs patching B to carry a `rule_id` vs semantic match
   (`affected_system + subtype` ending `-accepted`)?
4. **Redaction strength** — hash the prefix (default; provably leak-free, loses
   prefix readability in the committed finding) vs heuristic redaction (masks
   `token=…`→`[REDACTED]`, keeps readability, has false-negative leak risk)?
5. **Open-finding suppression is permanent by design** (red-team H1) — once a
   `recurring-false-positive` is filed for a prefix, that open finding suppresses
   re-filing of the same prefix every subsequent session until a human resolves it
   (then the grace window governs). This is the intended `recurrence_key` dedup: the
   pattern is registered once; re-filing adds no information; the operator triages via
   resolve + the stale-view pull (`meta_state_query_drift` surfaces aged open findings).
   Confirm this is acceptable, or add a stale-open re-file path (re-file if the open
   finding is older than N days without operator action). Default: keep permanent
   suppression (re-filing duplicates the stale-view mechanism — YAGNI).

## Out of scope

- Re-deriving / re-scoping finding B itself (report: wait for structured counts).
- The two `additionalContext` SessionStart hooks' every-session token cost (real but
  separate, report §4).
- Channel B (in-context recognition, the 454–461 near-miss) — stays on steering + human
  retrospective.

<!-- slug: recurrence-trigger-window -->