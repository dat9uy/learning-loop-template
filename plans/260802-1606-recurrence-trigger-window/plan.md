---
title: "recurrence-trigger-window"
description: "Fix the gate-escalation recurrence trigger so the already-wired SessionStart auto-file fires for human-paced cadence. Replace the 10-min time axis with a per-session axis (full-log scan + dedup), hash command prefixes before they reach the committed registry, fix the stale evidence_code_ref to the gate-rule code (enabling file-index co-citation with accepted-limitation findings), and collapse the dedup filter to permanent-for-non-archived suppression. P4 (reopens linkage) is dissolved by PR 109's lifecycle migration — resolved is terminal, relationships are emergent."
status: pending
priority: P1
effort: ""
tags: [gate, recurrence, meta-state, hook, security]
created: 2026-08-02
source: plans/reports/investigation-260802-1606-recurrence-trigger-design-post-lifecycle.md
supersedes: plans/260802-0135-recurrence-trigger-window/plan.md
branch: fix/recurrence-trigger-window-v2
---

# recurrence-trigger-window (revived, post-lifecycle)

## Overview

The gate-escalation recurrence pipeline is already built and wired: `bash-gate.js`
push-captures every escalation into `.gate-decision.log` (append-only, never trimmed);
`core/recurrence-tracker.js` aggregates and auto-files `recurring-false-positive`
findings; the `recurrence-check-on-start.js` SessionStart hook calls `checkAndEmit`
every session. **It has never fired in production** — zero `recurring-false-positive`
findings in the registry, confirming the window-bug diagnosis.

The root cause is a **window bug**, not missing machinery. `findRecurrentGroups`
filters `readDecisionLog({ since: now - 10min })`. The 10-min window does double duty
as both *burst definition* and *scan range*. At the next SessionStart, a prior
session's burst is >10 min old → zero groups → nothing filed. Human-paced cadence
(sessions hours/days apart) never satisfies the window.

This plan implements the post-lifecycle fix from
`investigation-260802-1606-recurrence-trigger-design-post-lifecycle.md`. It revives
the cancelled `260802-0135` plan, **minus its P4** (reopens linkage), which PR 109
dissolved: `reopens`/`cascade_from` writers are dropped; resolved/accepted is terminal;
the recurring finding relates to an accepted-limitation finding (e.g. B) by **emergent
file-index co-citation at read time**, not a declared edge. That co-citation only works
if the recurring finding cites the **gate-rule code** (matching B's
`gate-logic.js#stripNodeEvalBody`) — so fixing the tracker's stale `evidence_code_ref`
(a pre-existing latent bug: wrong repo name `-mcp`, wrong referent = the *detector* not
the gate rule) is load-bearing, not cosmetic.

**Non-goals (explicitly rejected):** push-inline `checkAndEmit` in the gate critical
path; SessionEnd / commit-msg triggers; promoting the trigger to `additionalContext`
(it stays in the silent-write channel — 0 agent tokens); the P3 commit-time summary
printer; re-deriving finding B from this retrospective (wait for structured counts);
a time-based grace window (superseded — see P3); any new declared relationship edge
(PR 109 closed that door).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | The SessionStart trigger fires for human-paced cadence by grouping per-session and scanning the full append-only log (one finding per prefix per call — in-call dedup) | P1 |
| 2 | No secret-shaped command fragment reaches the committed `meta-state.jsonl` via the recurrence finding (hash the prefix) | P1 |
| 3 | The recurring finding cites the **gate-rule code** (not the detector) so file-index co-citation connects it to accepted-limitation findings citing the same code — the P4-dissolution mechanic | P1 |
| 4 | A `recurring-false-positive` finding suppresses re-filing permanently while `open`/`accepted`/`resolved`; `archived` re-admits (collapsed dedup, no grace window) | P2 |
| 5 | The trigger stays stateless (full-log scan + dedup) and in the silent-write channel (no `additionalContext`) | P2 |

## Phases

| # | Phase | Status | Depends on |
|---|-------|--------|------------|
| 1 | [Phase 1: Session-axis grouping + session_id capture](./phase-01-session-axis-grouping.md) | Pending | — |
| 2 | [Phase 2: Hash redaction + fix evidence_code_ref (co-citation anchor)](./phase-02-redaction-and-code-ref.md) | Pending | 1 |
| 3 | [Phase 3: Collapse dedup to permanent-for-non-archived](./phase-03-permanent-suppression.md) | Pending | 2 |
| 4 | [Phase 4: Integration regression + runtime-agnostic audit](./phase-04-integration-regression.md) | Pending | 3 |

Phases are ordered by dependency: the grouping key (P1) must carry `session_id` before
P2 hashes the prefix into `recurrence_key` and sets `evidence_code_ref` from the rule
record; P3 widens the same `checkAndEmit` dedup filter touched by P2; P4 is the
cross-phase integration regression. **The cancelled plan's P4 (reopens linkage) is
dissolved — no phase for it.** File-index co-citation (the replacement) is enabled
entirely by P2's `evidence_code_ref` fix; no code beyond P1–P3.

## Design decisions (grounded, resolved this session)

These resolve the report's open questions via code scouting + a 5-persona `ak:predict`
debate (verdict CAUTION) + operator decisions. All are decided; the plan executes them.

1. **`session_id` source — RESOLVED (unchanged from cancelled plan).** Claude Code's
   PreToolUse hook input carries a top-level `session_id` (UUID). `parseInput(stdin)` in
   `hooks/universal/lib/protocol-adapter.js` returns the full parsed object, so
   `input.session_id` is available in `bash-gate.js`. For runtimes without it (Droid
   CLI), fall back to `getSessionId(root)` from `core/worktree-session-id.js`
   (worktree-stable hash of `.git/HEAD`). True per-session grouping on the primary
   runtime; degrades to per-worktree elsewhere. `recurrence_key` stays
   `rule_id::hash(prefix)` (cross-session dedup) — `session_id` is in the *grouping*
   key only.

2. **Secret redaction — hash (operator-decided).** `recurrence_key` embeds the raw
   normalized prefix (≤50 chars), leaking secrets (e.g. `curl https://api?token=eyJ…`)
   into the **committed** `meta-state.jsonl` (`.gate-decision.log` is gitignored via
   `.gitignore:4 *.log`; `meta-state.jsonl` is tracked — confirmed `git ls-files`).
   **Hash the prefix**: `recurrence_key = rule_id::sha256(prefix)[:12]`; drop raw
   `sample_commands` from `description`. Provably non-reversible. Zero existing
   `recurring-false-positive` findings → format change is free (no dedup-compat break).
   **In-call dedup:** per-session grouping can return multiple groups sharing one
   `recurrence_key` (same prefix, different sessions); `checkAndEmit` must dedup `fresh`
   groups by `recurrence_key` within the call so it writes **one finding per key**.

3. **`evidence_code_ref` → gate-rule code (scouting-resolved).** The tracker currently
   writes `evidence_code_ref: "tools/learning-loop-mcp/core/recurrence-tracker.js"` —
   two defects: stale repo name (`-mcp` → `-mastra`), and it cites the *detector*, not
   the gate rule. File-index co-citation (the P4 replacement) keys on file path
   (`meta-state.js:1133`, `:line` stripped), so the recurring finding must cite the
   **same code B cites** (`gate-logic.js#stripNodeEvalBody`) for the link to emerge.
   Derivation: the decision-log `rule_id` for promoted rules *is* the meta-state rule id
   (`gate-logic.js:970,1039`); rule records carry `evidence_code_ref`
   (`meta-state.js:646`); `findRecurrentGroups` already skips `rule_id: null` entries
   (`recurrence-tracker.js:47`). So `checkAndEmit` resolves each group's `rule_id` → its
   rule record → the rule's `evidence_code_ref` (the gate-rule code) and writes that on
   the finding. **No curated map, no decision-log field change.** Gate *constraints*
   (`rule_id: null`, e.g. `docker`) never reach `checkAndEmit`, so no derivation needed
   for them. P2 scouting confirms whether the rule's `evidence_code_ref` is bare-path or
   `#line`-tagged — file-granularity co-citation holds either way.

4. **Suppression — permanent-for-non-archived (5-persona predict, CAUTION).** The
   cancelled plan's N=14-day grace window is **dropped**. A time-based window can't
   distinguish stale-log re-scan noise from genuine post-fix recurrence (the log is
   append-only, never trimmed). The `resolved_at`-relative alternative (Option A) was
   rejected: `resolved_at` is a *social* event (operator marked resolved), not a
   *technical* cutover (rule patch deployed) — it can precede the patch and file phantom
   regressions from the old burst's tail. `open` + `accepted` + `resolved` all suppress
   permanently; `archived` re-admits. Filter:
   `e.subtype === "recurring-false-positive" && e.recurrence_key && e.status !== "archived"`.
   **Blind spot recorded deliberately:** a genuine same-prefix regression after resolve
   will NOT auto-file (the live gate banner is the first-order signal; same-prefix
   regression after a correct refinement is near-impossible; the trigger has never
   fired). Revisit — add a post-resolve re-file path — only if a documented incident
   shows the banner insufficient.

5. **P4 (reopens) — DISSOLVED.** PR 109 dropped `reopens`/`cascade_from` writers;
   resolved/accepted is terminal; new evidence appends a new finding; relationships are
   emergent (file-index co-citation). The recurring finding's link to B is *discovered*
   at read time via `meta_state_relationships` / file-index neighborhood, enabled by P2's
   `evidence_code_ref` fix. No `RULE_TO_ACCEPTED_LIMITATION` map, no `reopens` write, no
   cascade-resolve, no existence-guard, no `informs`/`evidence-for` edge. One correct
   field value (P2) replaces the cancelled plan's four P4 mechanisms.

6. **Keep it stateless.** Full-log scan each SessionStart + dedup. No watermark unless
   profiling shows SessionStart latency hurting once the trigger actually fires at scale
   (the unbounded full-log scan is the real scaling risk — orthogonal to A/B; deferred).
   Respects the loop's stateless-hook norm.

## Success Criteria

- [ ] `findRecurrentGroups` groups by `(rule_id, normalized_prefix, session_id)`,
      threshold N≥3 **per session**, with **no `since` time filter**; a burst from a
      prior session (any age) is detected at the next SessionStart.
- [ ] `checkAndEmit` writes **one finding per `recurrence_key` per call** (in-call
      dedup of `fresh` groups), even when multiple sessions cross threshold for the same
      prefix.
- [ ] Decision-log entries written by `bash-gate.js` carry `session_id` (Claude Code
      UUID; `getSessionId(root)` fallback for runtimes without it).
- [ ] A decision log containing a secret-shaped prefix
      (`curl https://api?token=eyJ…`) produces a finding whose `recurrence_key` and
      `description` contain **no** raw secret fragment (verified by grepping the emitted
      `meta-state.jsonl`); `recurrence_key` is `rule_id::sha256(prefix)[:12]`.
- [ ] The finding's `evidence_code_ref` resolves to the **gate-rule code** (via the
      promoted rule record's `evidence_code_ref`), NOT
      `tools/learning-loop-mcp/core/recurrence-tracker.js`; for the strip-eval rule it
      co-cites B at `gate-logic.js` file granularity (verified via
      `meta_state_relationships` or the file-index neighborhood).
- [ ] The dedup filter suppresses re-filing for `open`, `accepted`, and `resolved`
      `recurring-false-positive` findings; `archived` re-admits. No `resolved_at`
      comparison, no grace-window constant.
- [ ] The SessionStart hook emits no `hookSpecificOutput.additionalContext` (stays in
      the silent-write channel; 0 agent tokens).
- [ ] `pnpm test` (recurrence + meta-state suites) and the runtime-agnostic audit pass.

## Parallel operator step (non-blocking, independent)

Run the lifecycle migration's final step (PR 109 shipped the script; B is still `open`,
v21):

```bash
node tools/learning-loop-mastra/tools/handlers/scripts/migrate-accepted-limitations.mjs --dry-run
# review the candidate set (B + kin), then:
node tools/learning-loop-mastra/tools/handlers/scripts/migrate-accepted-limitations.mjs --apply
```

This flips B + the other `-accepted` findings `open`→`accepted`, fixing the status-lie.
**Independent of the trigger** but complementary: once B is `accepted` and P2 ships, a
recurring finding citing `gate-logic.js` co-cites B, surfacing "this accepted limitation
is actively recurring in vivo" as read-time neighborhood — without re-opening or closing
B. Run before or alongside the trigger ship (operator decision; lean: before).

## Out of scope

- Re-deriving / re-scoping finding B itself (report: wait for structured counts).
- The two `additionalContext` SessionStart hooks' every-session token cost (real but
  separate, 0052 §4).
- Channel B (in-context recognition, the 454–461 near-miss) — stays on steering + human
  retrospective.
- A log watermark / compaction (the real scaling risk; deferred until profiling demands).
- A post-resolve re-file path (the P3 blind-spot revisit; deferred until a real incident).

<!-- slug: recurrence-trigger-window -->
