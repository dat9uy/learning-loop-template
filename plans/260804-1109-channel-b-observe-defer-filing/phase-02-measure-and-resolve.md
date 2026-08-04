---
phase: 2
title: "Measure re-check + resolve/escalate criteria"
status: pending
priority: P2
effort: "30m"
dependencies: ["1"]
---

# Phase 2: Measure re-check + resolve/escalate criteria

## Overview

Define the measurement that proves the Channel B rule works (or fails), and the criteria
that resolve the finding or trigger Phase 3 escalation. This phase is **procedural** — no
new code. The instrument is the existing `meta_state_list` / `loop_describe` query surface;
the durable guard is Phase 1's live-registry invariants (the rule stays active and surfaces).
The finding `meta-260802T0000Z` is resolved (or attested) here, not in Phase 1.

## Requirements

- Functional: a documented re-check query that lists `loop-anti-pattern` filings by session,
  so an operator can see whether observe-and-defer episodes are being filed.
- Functional: a resolution criterion for `meta-260802T0000Z` that satisfies acceptance #3
  ("at least one channel actually fires in vivo") — OR, if no observe-and-defer episode
  recurs, a present-by-construction attestation path.
- Functional: an escalation trigger that, when an observe-and-defer episode occurs but is not
  filed, opens a new finding and routes to Phase 3 (auto-capture).
- Non-functional: no new scripts, no new substrate (YAGNI — a one-liner `meta_state_list`
  query is the instrument). The criteria live in this phase file as the durable record.

## Architecture

The re-check uses two existing read tools (no new code):

1. **Per-session filing check** — `meta_state_list({ session_id: "<recent-session-id>",
   entry_kind: "finding", compact: false })` returns findings filed in that session. Filter
   for `category: "loop-anti-pattern"` whose `description` references a deferred toolchain
   failure. This is the in-vivo evidence the channel fired.
2. **Rule-presence guard** — `meta_state_list({ id: ["rule-defer-needs-filing"] })` confirms
   the rule is still `active` (Phase 1's regression tests already guard this in CI; the
   re-check is the operator's manual confirmation between CI runs).

The finding's lifecycle: Phase 1 reset it to `open`. Phase 2 resolves it via
`meta_state_resolve({ id, resolution: "<criterion-met-note>" })` when a criterion below
holds. `reopens` is gone (PR #109), so no cascade — the finding closes directly.

## Related Code Files

- Read-only: `tools/learning-loop-mastra/bin/loop.mjs` (the `meta_state_list`, `meta_state_resolve` CLI tools).
- No new files. No test changes (Phase 1's invariants are the durable guard).

## Implementation Steps

### Step 1 — Document the re-check query

The operator runs this after N sessions (default N=5; see Open Questions in `plan.md`):

```bash
# List loop-anti-pattern findings filed in the most recent session
LOOP_SURFACE=.claude node tools/learning-loop-mastra/bin/loop.mjs meta_state_list \
  --args-file <(echo '{"entry_kind":"finding","compact":false}')
# Then filter for category: loop-anti-pattern + a description referencing a deferred
# toolchain failure. Or query a specific session:
LOOP_SURFACE=.claude node tools/learning-loop-mastra/bin/loop.mjs meta_state_list \
  --args-file <(echo '{"session_id":"<recent-session-id>","entry_kind":"finding","compact":false}')
```

This is the measurement instrument. No wrapper script — a documented query is sufficient
(YAGNI; `meta_state_list` already does the work).

### Step 2 — Define the resolution criteria

Resolve `meta-260802T0000Z` via `meta_state_resolve` when **any one** holds. The two
criteria are not equivalent — **only (A) is a self-correcting close** (the disease it names
is self-correcting); **(B) closes on weaker evidence** (the rule exists, but its behavioral
effect is unproven). The operator must consciously choose; the plan does not default to (B).

- **(A) In-vivo evidence (self-correcting).** At least one `loop-anti-pattern` finding
  exists in the registry that was filed by an agent under the `rule-defer-needs-filing`
  obligation (i.e. an observe-and-defer episode that the agent filed before deferring).
  Resolution note: `"Channel B fires in vivo: <finding-id> filed under rule-defer-needs-filing on <date>."`
  This is the only close that proves the channel changes agent behavior.
- **(B) Present-by-construction attestation (weaker).** After N=5 sessions with no
  observe-and-defer episode occurring (nothing to file), the channel is present-by-
  construction: the rule is active, surfaces at SessionStart, and the regression tests guard
  its *presence* (not its behavioral effect). Operator attests via
  `meta_state_resolve({ id, resolution: "Channel B present-by-construction: rule active, no observe-and-defer episode recurred in N=5 sessions; regression tests guard presence, not behavior. Closed on weaker evidence than (A); chose (B) consciously." })`.
  This is the honest fallback — the rule exists and is guarded; absence of episodes is not
  evidence of failure, but it is also not evidence of behavioral change. If the operator
  wants the finding to require (A), decline (B) and leave the finding open until an episode
  occurs (see Open Questions in `plan.md`).

### Step 3 — Define the escalation trigger (when Channel B rule fails on a single episode)

Phase 3 (mechanical capture) is now built in this delivery, but it catches **repeated**
toolchain failures (N≥3 per session), NOT a single observe-and-defer episode. So the single-
episode rule-failure case still has no mechanical backstop. If, during the re-check, an
observe-and-defer episode **occurred** (visible in a plan report or session transcript — a
deferred toolchain failure mentioned but not filed) AND **no matching `loop-anti-pattern`
filing** exists in the registry:

1. File a new finding: `meta_state_report({ category: "loop-anti-pattern", severity:
   "warning", affected_system: "meta-state-tools", session_id, description: "rule-defer-
   needs-filing not followed in session <X>: <failure> was deferred without filing; the
   steering rule did not change agent behavior." })`.
2. Resolve the original `meta-260802T0000Z` as `resolved` with note `"Steering rule
   insufficient on single episode; escalated to <new-finding-id>."`
3. Open a NEW plan to address single-episode mechanical capture — the candidate lever is
   lowering Phase 3's threshold from N≥3 to N≥1 (with signature dedup to control noise), OR a
   different mechanism. This is out of scope for the current delivery; it is a separate
   design decision, not Phase 3 as shipped (Phase 3 ships at N≥3).

### Step 4 — Resolve the finding

Run the re-check (Step 1). Apply criterion (A) if in-vivo evidence exists; otherwise (B) after
N sessions. Execute the resolution:

```bash
LOOP_SURFACE=.claude node tools/learning-loop-mastra/bin/loop.mjs meta_state_resolve \
  --args-file <(echo '{"id":"meta-260802T0000Z-no-feedback-channel-from-live-session-friction-to-finding-pr","resolution":"<criterion-note>"}')
```

Confirm `status: "resolved"` via `meta_state_list({ id: [...] , compact: true })`.

## Success Criteria

- [ ] The re-check query is documented and runnable (Step 1).
- [ ] Resolution criteria (A) and (B) and the escalation trigger (Step 3) are recorded in this
  phase file as the durable decision.
- [ ] `meta-260802T0000Z` is `resolved` (criterion A or B) OR escalated to a new finding
  (criterion Step 3) — not left `open` indefinitely.
- [ ] No new code, no new substrate. The durable guard remains Phase 1's CI regression tests.

## Risk Assessment

- **The re-check may never run.** A procedural measurement with no enforced cadence can be
  forgotten. Mitigation: the finding stays `open` (visible in `loop_describe` / drift
  queries) until resolved — its open status is the reminder. If the operator wants a
  mechanical reminder, that is a separate hook decision (out of scope; YAGNI).
- **Detecting non-filing requires an independent record.** The re-check can confirm filings
  exist (criterion A) but cannot mechanically detect that an episode occurred and was NOT
  filed — that requires cross-referencing plan reports / transcripts, which the loop does not
  re-read by design. Mitigation: the operator's retrospective is the cross-reference; the
  escalation trigger (Step 3) fires when the operator notices a deferred-but-unfiled episode.
  This is the honest boundary: the loop cannot self-detect Channel B non-filing without
  Phase 3 machinery.
- **Phase 3 ships at N≥3, not N≥1.** Phase 3 (built in this delivery) catches repeated
  toolchain failures; it does not mechanically backstop a single observe-and-defer episode. So
  the Step 3 escalation (rule failed on a single episode) is NOT covered by Phase 3 — it
  routes to a separate plan (lower the threshold to N≥1 with signature dedup, or another
  mechanism). Do not conflate the two: Phase 3 = repeated failures; Step 3 escalation =
  single-episode rule failure.
- **Attestation feels like the disease.** Criterion (B) resolves the finding without in-vivo
  evidence, which echoes the "manual operator retrospective" the finding criticizes.
  Mitigation: (B) is honest about what it is — present-by-construction, not self-correction —
  and the regression tests are real guards. If the operator wants the finding to require (A),
  they can decline (B); that is the Open Question in `plan.md`.