---
phase: 1
title: "Implement"
status: pending
priority: P2
dependencies: []
---

# Phase 1: Implement

## Overview

Edit `docs/loop-engine.md` to add the Rec 12 change-log trigger rule and the Q11 symmetry statement by **promoting** the existing `## The recursion-bound statement (skills)` section into the general `## The change-log trigger (Rec 12)` section. Skills become the named concrete instance; the recursion-bound termination argument is retained and generalized; the Honest-framing gap-detector pointer is repointed at Plan 4. One file, prose only.

## Requirements

- **Functional:** the general trigger rule, the recursion-bound termination argument (generalized), the skills instance, and the Q11 symmetry statement all appear in the one promoted section; the old heading is gone; the Honest-framing pointer names Plan 4.
- **Non-functional:** no code, no test, no schema file touched. Prose stays L1 (concept surface — implementation-agnostic; names roles, not mechanisms). Terminology consistent with the rest of `loop-engine.md` (`bound artifact`, `change-log`, `record`).

## Architecture

This is an L1 concept-surface edit. The promoted section sits where the skills recursion-bound section sat (between "The 13 escape-hatch items" and "Authoring loop-maintained skills"), preserving the doc's flow. The trigger rule is the generalization of the skills-specific recursion; the symmetry statement is a new paragraph in the same section (it is the operator/agent-recording rule, which is the guard against escape-hatch #13's operator-capture failure mode). No mechanism is named beyond the existing skills write-gate (the named instance) and `meta_state_log_change` (the record write).

## Related Code Files

- Modify: `docs/loop-engine.md` (two spots: the `record` role bullet at line ~40, and the `## The recursion-bound statement (skills)` section at lines ~87–91)
- Create: none
- Delete: none (the old heading is replaced, not removed wholesale — the section's content is promoted, not deleted)

## Implementation Steps

1. **Read** `docs/loop-engine.md` lines 87–91 (the `## The recursion-bound statement (skills)` section), lines 38–44 (the `record` role + the writes-vs-records boundary paragraph), and line 40 (the `record` role bullet) to confirm the trigger's terminology and placement before editing.
2. **Rename the section heading** `## The recursion-bound statement (skills)` → `## The change-log trigger (Rec 12)`.
3. **Insert the general trigger rule** as the section's opening statement (after the heading, before the existing skills paragraph): *an action becomes a change-log when it changes a bound artifact (concept- or implementation-surface doc, runtime contract, registry schema, tool manifest, tracker lifecycle, or `tools/**` / `core/**` source) or a rule/policy. Not for in-session scratch, plan drafts, or reversible edits inside a not-yet-shipped plan.*
4. **Reframe the existing skills paragraph** as the named concrete instance of the general rule: keep "A skill file is a bound artifact …" and the phase-5 skills write-gate reference, but lead with the instance framing (e.g., "Skills are the first bound artifact with the gate wired: …"). Keep the recursion-bounded sentence and generalize it — change "skill edits emit change-logs, change-logs are records, records are not skills" to the general form "bound-artifact edits emit change-logs, change-logs are records, records are not bound artifacts → the recursion is bounded."
5. **Add the Q11 symmetry statement** as a new paragraph: *no operator exemption (escape-hatch #13). Operator edits and agent edits are recorded symmetrically. Authority governs which actions may run; the trigger governs which are recorded — orthogonal. `meta_state_log_change` is trigger-gated, not authority-gated.*
6. **Repoint the Honest-framing paragraph**: change "Auto-detecting a skill edit that did not emit a change-log (the gap detector) is deferred to the broadened Rec 12 plan" → name Plan 4 (the detection mechanism: (b) change-log gap detection + (c) session-start gap injection). Keep the closing clause "a violation produces a record drift, not a hard failure" (still true until Plan 4 ships).
7. **Add a cross-reference from the `record` role bullet** (line 40): append to the bullet a one-line pointer to the new section, e.g. "See § The change-log trigger (Rec 12) for when an action becomes a change-log." Keeps the bullet a single logical line; the 0958 report frames the trigger as part of the record role, so the cross-ref lands a reader who looks up "record" on the trigger.
8. **Re-read** the full edited section + the role bullet in context to confirm the section reads as one coherent block (heading → general trigger → skills instance + recursion bound → symmetry → honest framing) and that no other `loop-engine.md` reference to "the broadened Rec 12 plan" or "recursion-bound statement (skills)" is left dangling.

## Success Criteria

- [ ] Section heading is `## The change-log trigger (Rec 12)`; old `## The recursion-bound statement (skills)` heading gone.
- [ ] General trigger rule present and in-substance verbatim with the 0958 final-design wording (bound artifacts + rules/policies; excludes in-session scratch / plan drafts / not-yet-shipped reversible edits).
- [ ] Recursion-bound termination argument present and generalized (records are not bound artifacts); skills retained as the named instance with the phase-5 write-gate reference intact.
- [ ] Q11 symmetry statement present (no operator exemption; escape-hatch #13 cited inline; authority vs trigger orthogonal; `meta_state_log_change` is trigger-gated).
- [ ] Honest-framing gap-detector pointer names Plan 4, not "the broadened Rec 12 plan".
- [ ] `record` role bullet (line 40) carries a one-line cross-reference to the new `## The change-log trigger (Rec 12)` section.
- [ ] No heading anchor break elsewhere — `grep -n "recursion-bound\|broadened Rec 12" docs/` returns no dangling references outside the promoted section (the "recursion-bound" concept term may still appear inside the section; that's intended).

## Risk Assessment

- **Risk:** an external link or skill references the `#the-recursion-bound-statement-skills` anchor → breaks on rename. **Likelihood: low** — `loop-engine.md` is an L1 concept doc, not a tool reference; anchors are not load-bearing across the codebase. **Mitigation:** `grep -rn "recursion-bound" docs/ tools/ .claude/` before the rename; if a reference exists, keep the old anchor or add it as a secondary. Verify in this phase.
- **Risk:** the general trigger's "or a rule/policy" clause over-files (every rule promotion becomes a change-log). **Mitigation:** this is the intended L1 rule from 0958; rule promotion already records authorship via `meta_state_log_change`'s sibling tools. Detection of *missing* change-logs (the over/under-file concern) is Plan 4, not this plan. No mitigation needed here — the statement is L1, not a mechanism.
- **Risk:** editing the L1 invariant doc is itself a bound-artifact edit → must emit a change-log (the trigger applied to itself). **Mitigation:** that is Phase 2's explicit step (`meta_state_log_change`); the recursion is bounded by construction (the change-log is a record, not a bound artifact).