---
title: "recurrence-trigger-window"
description: "Fix the gate-escalation recurrence trigger so the already-wired SessionStart auto-file fires for human-paced cadence. Replace the 10-min time axis with a per-session axis (full-log scan + dedup), hash command prefixes before they reach the committed registry, fix the stale evidence_code_ref to the gate-rule code (enabling read-time file-grounding co-location with accepted-limitation findings), and collapse the dedup filter to permanent-for-non-archived suppression. P4 (reopens linkage) is dissolved by PR 109's lifecycle migration — resolved is terminal, relationships are discovered at read time."
status: completed
priority: P1
effort: ""
tags: [gate, recurrence, meta-state, hook, security]
created: 2026-08-02
completed: 2026-08-04
completion_note: "Shipped to main (commits ad87a6ec, f03bc39f, 160616b1). All 4 phases verified against live code: P1 session-axis grouping + session_id + hashed recurrence_key (recurrence-tracker.js findRecurrentGroups + hashRecurrenceKey; bash-gate.js resolveSessionId); P2 redaction + evidence_code_ref (generateFindingId hash-derived id, buildFinding ruleById); P3 permanent-for-non-archived suppression (resolveDedupIndex status!==archived); P4 integration regression green (rule-derived-process-hints.test.cjs 13 passed, hint-registry.test.cjs 10 passed). Frontmatter status was stale (pending) despite ship; reconciled 2026-08-04 during Channel B planning."
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
the recurring finding relates to an accepted-limitation finding (e.g. B) by **shared file
grounding discovered at read time** — `meta_state_check_grounding` / `meta_state_query_drift`
answer "which findings touch `gate-logic.js`" — not a declared edge. Correction from
red-team: file-index is grounding-only, **not** a relationship edge
(`docs/meta-state-lifecycle.md:246` — the earlier co-citation-via-`meta_state_relationships`
premise was scouted and rejected during the lifecycle migration; the relationships tool
reads the declared-edge graph only). Grounding co-location only works if the recurring
finding cites the **gate-rule code** (matching B's `gate-logic.js#stripNodeEvalBody`) —
so fixing the tracker's stale `evidence_code_ref` (a pre-existing latent bug: wrong repo
name `-mcp`, wrong referent = the *detector* not the gate rule) is load-bearing, not
cosmetic.

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
| 3 | The recurring finding cites the **gate-rule code** (not the detector) so grounding queries (`meta_state_check_grounding` / `meta_state_query_drift`) surface it alongside accepted-limitation findings touching the same file — the P4-dissolution mechanic | P1 |
| 4 | A `recurring-false-positive` finding suppresses re-filing permanently while `open`/`accepted`/`resolved`; `archived` re-admits (collapsed dedup, no grace window) | P2 |
| 5 | The trigger stays stateless (full-log scan + dedup) and in the silent-write channel (no `additionalContext`) | P2 |

## Phases

| # | Phase | Status | Depends on |
|---|-------|--------|------------|
| 1 | [Phase 1: Session-axis grouping + session_id capture + hashed recurrence_key](./phase-01-session-axis-grouping.md) | Completed | — |
| 2 | [Phase 2: Finding payload hygiene (id, description) + evidence_code_ref](./phase-02-redaction-and-code-ref.md) | Completed | 1 |
| 3 | [Phase 3: Collapse dedup to permanent-for-non-archived (+ race-safe write)](./phase-03-permanent-suppression.md) | Completed | 2 |
| 4 | [Phase 4: Integration regression + hook failure containment + runtime-agnostic audit](./phase-04-integration-regression.md) | Completed | 3 |

Phases are ordered by dependency: P1 changes the log-entry shape, grouping, **and the
hashed `recurrence_key` together** (hashing rides P1 so no phase ordering can ever commit
a raw prefix — red-team); P2 rewrites the finding payload (id, description,
`evidence_code_ref`) on top of P1's hashed key; P3 widens the dedup filter and adds the
race-safe write + dedup diagnostic; P4 is the cross-phase integration regression plus
hook failure containment. **The cancelled plan's P4 (reopens linkage) is dissolved — no
phase for it.** Grounding co-location (the replacement) is enabled entirely by P2's
`evidence_code_ref` fix + rule-record backfill; no code beyond P1–P3.

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
   key only. **Validation + clean cutover (red-team):** `session_id` is validated at
   capture (UUID shape, length-capped; anything else falls back to
   `getSessionId(root)`) — the harness stdin payload is not trusted blindly, and the
   newline-injection assertion cited in the cancelled plan is dead code for string
   fields (`JSON.stringify` escapes newlines). Entries without a `session_id` (all
   ~28.7K historical lines across the three surface logs) group into a `"no-session"`
   bucket that **never fires** — otherwise the first post-ship SessionStart would file
   ~14 stale lifetime-accumulated findings at once (real counts; top group 46 hits over
   weeks) and P3 would then mute those prefixes permanently. Fallback-tier
   (worktree-hash) groups fire only when `last_ts - first_ts ≤ 24h` — a coarse session
   proxy, not a lifetime counter.

2. **Secret redaction — hash, in P1, and hash the id too (operator-decided; red-team
   hardened).** The cancelled plan's `recurrence_key` embeds the raw
   normalized prefix (≤50 chars), leaking secrets (e.g. `curl https://api?token=eyJ…`)
   into the **committed** `meta-state.jsonl` (`.gate-decision.log` is gitignored via
   `.gitignore:4 *.log`; `meta-state.jsonl` is tracked — confirmed `git ls-files`).
   **Hash the prefix**: `recurrence_key = rule_id::sha256(rule_id::prefix)[:16]`
   (16 hex chars = 64 bits, birthday-safe far beyond registry scale; `rule_id` in the
   hash input). Hashing ships **in P1** — P1-alone would otherwise guarantee raw-prefix
   commits from the historical backlog, and a revert does not unpublish git history.
   The finding **`id` is hash/random-derived, never `slugify(prefix)`** (red-team
   Critical: slugify preserves base64url token bodies nearly intact, so the id leaks
   even with a hashed key); drop raw `sample_commands` from `description`.
   **Threat-model honesty (red-team correction):** the hash hides secret *values* but
   not command *identity* — command prefixes are low-entropy, so a committed hash is a
   dictionary oracle for anyone with repo access. Accepted residual: the alternative
   (never committing findings) defeats the feature; the plan no longer claims
   "provably non-reversible."
   Zero existing `recurring-false-positive` findings → format change is free.
   **In-call dedup:** per-session grouping can return multiple groups sharing one
   `recurrence_key` (same prefix, different sessions); `checkAndEmit` must dedup `fresh`
   groups by `recurrence_key` within the call so it writes **one finding per key**.
   Suppression also re-checks the key **inside the registry lock** (red-team Critical:
   the unlocked check-then-write races across concurrent SessionStarts) and logs a
   stderr diagnostic on every dedup hit (finding id + group hash) so suppression is
   observable.

3. **`evidence_code_ref` → gate-rule code (scouting-resolved).** The tracker currently
   writes `evidence_code_ref: "tools/learning-loop-mcp/core/recurrence-tracker.js"` —
   two defects: stale repo name (`-mcp` → `-mastra`), and it cites the *detector*, not
   the gate rule. File grounding (the P4 replacement) keys on file path
   (`meta-state.js:1133`, `:line` stripped), so the recurring finding must cite the
   **same code B cites** (`gate-logic.js#stripNodeEvalBody`) for the link to emerge.
   Derivation: the decision-log `rule_id` for promoted rules *is* the meta-state rule id
   (`gate-logic.js:970,1039`); rule records carry `evidence_code_ref`
   (`meta-state.js:646`); `findRecurrentGroups` already skips `rule_id: null` entries
   (`recurrence-tracker.js:47`). So `checkAndEmit` resolves each group's `rule_id` → its
   rule record → the rule's `evidence_code_ref` (the gate-rule code) and writes that on
   the finding. **No curated map, no decision-log field change.** Gate *constraints*
   (`rule_id: null`, e.g. `docker`) never reach `checkAndEmit`, so no derivation needed
   for them. **Backfill required (red-team):** today 0/15 rule records carry
   `evidence_code_ref` (verified against the live registry projection) — without a
   backfill the derivation falls through to the `gate-logic.js` fallback 100% of the
   time and is dead code on arrival. P2 includes a one-time `meta_state_patch` backfill
   of `evidence_code_ref` on exactly three rule records (validated scope): the two
   rule_ids present in the decision log (`rule-no-raw-stdout-vitest`,
   `rule-no-new-artifact-types`) and the strip-eval rule. Whether the value is bare-path
   or `#line`-tagged,
   file-granularity grounding co-location holds either way. The read-time link to B is
   verified via `meta_state_check_grounding` / `meta_state_query_drift`
   (findings-on-a-file), NOT `meta_state_relationships` (declared-edge graph only —
   `docs/meta-state-lifecycle.md:246`).

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
   shows the banner insufficient. Every dedup hit also logs a stderr diagnostic
   (finding id + group hash) so suppression is attributable, not silent. **Adversarial
   key squatting — documented non-issue (red-team, rejected):** a computed
   `recurrence_key` could theoretically be squatted to pre-suppress a genuine future
   burst, but writing findings requires the loop record tools, and an actor with that
   access can suppress detection far more directly; the gate banner remains the
   first-order signal.

5. **P4 (reopens) — DISSOLVED.** PR 109 dropped `reopens`/`cascade_from` writers;
   resolved/accepted is terminal; new evidence appends a new finding; relationships are
   discovered at read time. The recurring finding's link to B is *discovered* via
   **file grounding** — `meta_state_check_grounding` / `meta_state_query_drift` list
   findings touching `gate-logic.js` — enabled by P2's `evidence_code_ref` fix +
   backfill. No `RULE_TO_ACCEPTED_LIMITATION` map, no `reopens` write, no
   cascade-resolve, no existence-guard, no `informs`/`evidence-for` edge. One correct
   field value (P2) replaces the cancelled plan's four P4 mechanisms.

6. **Keep it stateless.** Full-log scan each SessionStart + dedup. No watermark unless
   the latency tripwire fires. Corrected scale figure (red-team): the scan is the
   three-surface union (~28.4K lines today: `.factory` 18,688 + `.mastracode` 9,509 +
   `.claude` 181), parsed + deduped + sorted every SessionStart on a cold process. P4
   ships the tripwire: the hook logs scan duration to stderr against a defined budget;
   crossing it schedules the watermark work. Respects the loop's stateless-hook norm.

## Success Criteria

- [ ] `findRecurrentGroups` groups by `(rule_id, normalized_prefix, session_id)`,
      threshold N≥3 **per session**, with **no `since` time filter**; a burst from a
      prior session (any age) is detected at the next SessionStart. Entries without a
      `session_id` (the historical `"no-session"` backlog) never fire; fallback-tier
      (worktree-hash) groups fire only within a 24h span.
- [ ] `checkAndEmit` writes **one finding per `recurrence_key` per call** (in-call
      dedup of `fresh` groups), even when multiple sessions cross threshold for the same
      prefix; concurrent SessionStart processes cannot duplicate a finding (key check
      re-evaluated inside the registry lock); every dedup hit logs a stderr diagnostic.
- [ ] Decision-log entries written by `bash-gate.js` carry a validated `session_id`
      (Claude Code UUID, shape- and length-checked; `getSessionId(root)` fallback).
- [ ] A decision log containing a secret-shaped prefix
      (`curl https://api?token=eyJ…`) produces a finding whose **entire serialized
      JSON — id, `recurrence_key`, `description`, all fields** — contains no raw secret
      fragment (verified by grepping the emitted `meta-state.jsonl`);
      `recurrence_key` is `rule_id::sha256(rule_id::prefix)[:16]`; the `id` is
      hash/random-derived, never `slugify(prefix)`.
- [ ] The finding's `evidence_code_ref` resolves to the **gate-rule code** (via the
      promoted rule record's backfilled `evidence_code_ref`), NOT
      `tools/learning-loop-mcp/core/recurrence-tracker.js`; for the strip-eval rule it
      co-locates with B at `gate-logic.js` file granularity (verified via
      `meta_state_check_grounding` / `meta_state_query_drift`).
- [ ] The dedup filter suppresses re-filing for `open`, `accepted`, and `resolved`
      `recurring-false-positive` findings; `archived` re-admits. No `resolved_at`
      comparison, no grace-window constant.
- [ ] The SessionStart hook emits no `hookSpecificOutput.additionalContext` (stays in
      the silent-write channel; 0 agent tokens) and **fails open** — a `checkAndEmit`
      throw exits 0 with a stderr diagnostic; one bad group never blocks others.
- [ ] `pnpm test` (recurrence + meta-state suites) and the runtime-agnostic audit pass;
      SessionStart scan latency is measured and recorded against the P4 tripwire budget.

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
recurring finding citing `gate-logic.js` shares file grounding with B, surfacing "this
accepted limitation is actively recurring in vivo" as a read-time grounding query — without re-opening or closing
B. Run **before** the trigger ship (validated 2026-08-02) so grounding co-location is
meaningful from the first filed finding.

## Out of scope

- Re-deriving / re-scoping finding B itself (report: wait for structured counts).
- The two `additionalContext` SessionStart hooks' every-session token cost (real but
  separate, 0052 §4).
- Channel B (in-context recognition, the 454–461 near-miss) — stays on steering + human
  retrospective.
- A log watermark / compaction (the real scaling risk; deferred until profiling demands).
- A post-resolve re-file path (the P3 blind-spot revisit; deferred until a real incident).

<!-- slug: recurrence-trigger-window -->

## Red Team Review

### Session — 2026-08-02
**Findings:** 13 unique (from 19 raw across 3 hostile reviewers; merged duplicates)
(12 accepted — 2 applied modified, 1 rejected)
**Severity breakdown:** 3 Critical, 5 High, 5 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | File-index co-citation mechanic doesn't exist (`docs/meta-state-lifecycle.md:246` refutes it; `meta_state_relationships` reads declared-edge graph only) | Critical | Accept (modified) — re-anchored on `meta_state_check_grounding` / `meta_state_query_drift` | plan.md (overview, goal 3, decisions #3/#5), Phase 2, Phase 4 |
| 2 | Finding `id` leaks raw prefix via `slugify` (`recurrence-tracker.js:73-77,108`) — defeats redaction | Critical | Accept — id is hash/random-derived; whole-JSON grep test | Phase 2, plan.md decision #2 + success criteria |
| 3 | Cross-process check-then-write race duplicates findings (unlocked dedup read at `:87`; lock is per-write) | Critical | Accept — key re-check inside `withRegistryLock` | Phase 3, plan.md decision #2 |
| 4 | Backlog flood + permanent mute (merged ×3 reviewers): ~28.7K no-session lines → ~14 lifetime groups fire at once, then P3 mutes them | High | Accept — `"no-session"` never fires (clean cutover); fallback-tier 24h span bound | Phase 1, plan.md decision #1 |
| 5 | 0/15 rule records carry `evidence_code_ref` — derivation dead on arrival | High | Accept — P2 rule-record backfill step | Phase 2, plan.md decision #3 |
| 6 | SessionStart hook has zero error containment — one bad group crashes every session | High | Accept — fail-open hook + per-group try/catch + tests | Phase 4 |
| 7 | P1-alone merge commits raw secrets to git history; co-ship was a parenthetical | High | Accept — hashing moved into P1 | Phase 1, plan.md decision #2 |
| 8 | "Provably non-reversible" false — low-entropy hash is a dictionary oracle | High | Accept — claim downgraded, threat-model note added | plan.md decision #2 |
| 9 | Hash-collision suppression is silent | Medium | Accept — 64-bit keys ([:16]) + stderr dedup diagnostic | Phases 1/3 |
| 10 | `session_id` unvalidated; cited newline guard is dead code | Medium | Accept — UUID shape + length cap at capture | Phase 1 |
| 11 | Cross-surface dedupe key excludes `session_id` (`surfaces.js:242-244`) | Medium | Accept — `session_id` added to dedupe key | Phase 1 |
| 12 | `durationMin` becomes whole-history nonsense post-P1 | Medium | Accept — per-session stats + first/last-seen relabel | Phase 2 |
| 13 | Scan cost understated (28K union, not 18.7K) + no tripwire | Medium | Accept — figure corrected; P4 latency tripwire; watermark stays deferred | plan.md decision #6, Phase 1 risk, Phase 4 |
| 14 | Adversarial `recurrence_key` squatting pre-suppresses genuine bursts | High | Reject — single-operator repo; registry writes require loop tools (an actor with that access has far more direct suppression paths); gate banner is first-order signal. Documented as non-issue. | Phase 3 risk, plan.md decision #4 |

### Whole-Plan Consistency Sweep

Decision deltas propagated: grounding-not-co-citation mechanic (overview, goals,
decisions #1/#3/#5, success criteria, P2, P4 — zero `meta_state_relationships`
validation claims remain outside intentional negations); hash-in-P1 + 64-bit +
hash-derived id (decision #2, criteria, P1, P2); no-session cutover + fallback span
bound (decision #1, criteria, P1, P4 fixtures); race-safe write + dedup diagnostic
(decision #2/#4, criteria, P3); backfill (decision #3, P2); fail-open hook (criteria,
P4); corrected scan figure + tripwire (decision #6, P1 risk, P4); squatting non-issue
(decision #4, P3 risk). Grep sweep for `co-cit`, `[:12]`, `meta_state_relationships`,
`provably`, `harmless`, stale grace-window text: clean — remaining hits are intentional
rejection/negation prose. Phase filenames unchanged (stable paths); titles updated
in place. **Zero unresolved contradictions.**

## Validation Log

### Session 1 — 2026-08-02
**Trigger:** Post-red-team validation gate (`/ak:plan validate`)
**Questions asked:** 6

#### Questions & Answers

1. **[Scope]** The clean cutover means the ~28.7K historical log lines never produce findings — including the 46-hit `rule-no-raw-stdout-vitest` prefix. Pure silence, or a one-time operator-reviewed digest?
   - Options: Pure cutover, silence | One-time dry-run digest | Seed findings for top groups
   - **Answer:** Pure cutover, silence
   - **Rationale:** The backlog is stale noise; B is already tracked. Keeps P1 minimal.

2. **[Scope]** How wide should the `evidence_code_ref` rule-record backfill go (0/15 rules have it today)?
   - Options: Log rule_ids + strip-eval only | Backfill all 15 rules | Skip — fallback only
   - **Answer:** Log rule_ids + strip-eval only (exactly 3 records)
   - **Rationale:** Covers every derivable case today; no consumer for the other 12.

3. **[Architecture]** Which race-safe write shape should P3 pin down?
   - Options: `writeEntryIfAbsent` helper | One lock for whole cycle | Implementer decides
   - **Answer:** `writeEntryIfAbsent` helper
   - **Rationale:** Narrow lock scope, matches existing `writeEntry` lock discipline.

4. **[Risks]** The P4 latency tripwire needs a concrete budget. Which approach?
   - Options: 500ms budget now | Measure first, then set | No numeric budget
   - **Answer:** 500ms p50 budget now
   - **Rationale:** A tripwire without a number never fires.

5. **[Scope]** Where should implementation land (plan frontmatter says `fix/recurrence-trigger-window-v2`, current branch is the docs branch)?
   - Options: New v2 fix branch | Cook on current docs branch
   - **Answer:** New v2 fix branch from main before cooking
   - **Rationale:** Keeps design-docs PR and implementation PR separate.

6. **[Risks]** When should the B (`open`→`accepted`) migration run relative to this plan?
   - Options: Before trigger ship | After trigger ship | Out of scope
   - **Answer:** Before trigger ship
   - **Rationale:** Grounding co-location is meaningful from the first filed finding.

#### Confirmed Decisions
- Backlog cutover: pure silence, no digest, no seeded findings
- Backfill scope: exactly `rule-no-raw-stdout-vitest`, `rule-no-new-artifact-types`, strip-eval rule
- Race-safe write: `writeEntryIfAbsent` (locked re-check, narrow scope)
- Latency tripwire: p50 < 500ms on the ~28.4K-line union, stderr timing every run
- Branch: `fix/recurrence-trigger-window-v2` from main before cook
- B migration: run before trigger ship

#### Action Items
- [x] P1 risk: pure-silence cutover noted
- [x] P2 step 4: backfill scope pinned to 3 records
- [x] P3 step 2: `writeEntryIfAbsent` pinned (whole-cycle-lock alternative removed)
- [x] P4 step 5: 500ms p50 budget pinned
- [x] plan.md: backfill scope + B-migration timing pinned
- [ ] Cook-time: create `fix/recurrence-trigger-window-v2` from main first

#### Impact on Phases
- Phase 1: risk section — pure-silence cutover confirmed (marker added)
- Phase 2: step 4 — backfill scope pinned to exactly 3 records (marker added)
- Phase 3: step 2 — race-safe write shape pinned (marker added)
- Phase 4: step 5 — tripwire budget pinned to 500ms p50 (marker added)

### Whole-Plan Consistency Sweep

Grep for superseded wording (`at minimum the two`, `lean: before`, `Alternatively hold`,
`Define the budget`, `e.g. p50`, open `operator decision`): clean. Branch decision lives
in frontmatter + this log (cook-time action item); no phase file references a branch.
No contradictions with the Red Team Review decisions. **Zero unresolved contradictions.**
