---
phase: 2
title: "Edit central-skills phase-03 + plan.md"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Edit central-skills phase-03 + plan.md

## Overview

The core plan-edit. Drop the Q4 ledger-event hand-off from `plans/260719-1428-central-skills-management/`
Phase 3 and make the F6 hash test the sole npx-round-trip gate. Decouple F11/F12 from the ledger row.
Preserve the Q4 audit trail in `plan.md` via a supersession note (do not erase the original decision).

## Requirements

- Functional: after edits, no live ledger-event hand-off language remains in 260719-1428; the
  npx-unavailable fallback is the F6 hash test (recompute + compare); F11/F12 are plain presence +
  byte-identity tests with no runtime-state dependency.
- Non-functional: the original Q4 rationale in `plan.md` is preserved with a supersession note (audit
  trail intact); the F6 hash test is already specified at `phase-03…md:78` step 17 — this phase
  re-points the fallback to it, it does not invent a new test.

## Architecture

The F6 hash test already exists in the phase-03 design:
- `phase-03…md:40` — `sync-skills.mjs` hash-verify before fan-out (F6).
- `phase-03…md:70` — compute `sha256` of detected-copy files, assert match against
  `manifest.mastra.hash` before fan-out; refuse on mismatch.
- `phase-03…md:78` step 17 — round-trip test: "If sandbox can't run npx update, document the manual
  round-trip + assert manifest `hash` refreshes — F6 makes the hash load-bearing so the test
  re-computes + compares."

So the npx-unavailable case is *already* covered deterministically by step 17 / F6 with no sandbox and
no runtime-state. The Q4 ledger-event hand-off is the redundant, unwired layer being removed.

## Related Code Files

- Modify: `plans/260719-1428-central-skills-management/phase-03-mastra-npx-provider-switch-and-manifest-driven-exclusion.md`
- Modify: `plans/260719-1428-central-skills-management/plan.md`

## Implementation Steps

1. **`phase-03…md` status note (L6)** — rewrite the "Deferred remainder" sentence. Replace
   `gated on ledger-event npx-skills-mastra-roundtrip-2026-07-19 in runtime-state.jsonl (corrected
   row appended 2026-07-19T11:55Z; activates F11/F12 when a permitted sandbox appends per-runtime
   metadata.hashes)` with: `gated on the F6 hash test (step 17) — real npx when available,
   hash-recompute-and-compare when not; F11/F12 are plain presence + byte-identity tests with no
   runtime-state dependency. (Q4 ledger-event hand-off dropped 2026-07-20 — see plan 260720-1404.)`

2. **`phase-03…md` Risk Assessment (L103)** — strike the ledger-event hand-off block
   ("record the npx round-trip as a ledger-event … reads it back via runtime_state_read to confirm
   before marking the round-trip criterion met"). Replace with: `If npx is blocked in the current
   sandbox (validation Q4 — superseded 2026-07-20, plan 260720-1404): do NOT defer Phase 3 and do
   NOT fall back to the old .agents symlink mechanism. Gate the round-trip criterion on the F6 hash
   test (step 17): real npx when available; when npx is unavailable, document the manual round-trip
   and assert the manifest hash refreshes — F6 makes the hash load-bearing so the test re-computes
   and compares. No ledger-event, no runtime-state dependency.` Keep the trailing sentence about
   probes running before install/retirement.

3. **`phase-03…md` F11/F12 steps (L57, L94-97)** — verify these already read as plain tests
   (presence + byte-identity). They do (L57: "existsSync(.mastracode/skills/mastra/SKILL.md) for all
   3 surfaces; mastra's tree byte-identical across all 3 surfaces"). No edit needed unless a stale
   "activates on that row" phrase survives — grep after edit (Phase 3 sweep) confirms.

4. **`plan.md` Q4 block (L143-152)** — append a supersession note to the Q4 Answer/Rationale, do NOT
   erase: `**Superseded 2026-07-20 (plan 260720-1404):** the runtime-state ledger-event hand-off is
   unwired — no sandbox selector, no report-back test, and same-id appends cannot supersede at
   id-keyed find sites (meta-state-dispatch-finding-tool.js:45-50 returns the first match). Fallback
   is now the F6 hash test (recompute + compare), not a ledger-event. See plan 260720-1404.`

5. **`plan.md` Confirmed Decisions (L154)** — update the line
   `npx sandbox fallback: runtime-state ledger-event (NOT defer / NOT old-symlink)` to
   `npx sandbox fallback: F6 hash test — recompute + compare (NOT defer / NOT ledger-event / NOT
   old-symlink) [Q4 superseded 2026-07-20, plan 260720-1404]`.

6. **`plan.md` Action Item (L156)** — mark the item done with a note:
   `[x] Phase 3: npx-unavailable fallback = F6 hash test (step 17), not a ledger-event. (Q4
   ledger-event hand-off dropped — plan 260720-1404.)`

7. **`plan.md` Impact on Phases (L158)** — update the one-line summary:
   `Phase 3: the npx-unavailable fallback (Risk Assessment) is the F6 hash test, not a ledger-event
   flow. One targeted edit (supersedes the prior Q4 runtime-state edit).`

8. Re-read the edited `phase-03…md` + `plan.md` end-to-end to confirm no internal contradiction
   between the new F6-gate language and the existing F6/step-17 text (they should now agree
   verbatim).

## Success Criteria

- [ ] `phase-03…md` L6 status note: no ledger-event language; fallback = F6 hash test; F11/F12 plain.
- [ ] `phase-03…md` L103 Risk Assessment: ledger-event block struck; F6 hash-test fallback in place.
- [ ] `plan.md` Q4 block: original rationale preserved + supersession note appended.
- [ ] `plan.md` Confirmed Decisions + Action Item + Impact on Phases updated to F6 hash test.
- [ ] No contradiction between the new fallback language and the existing F6/step-17 text.

## Risk Assessment

- **Erasing validation history** — the Q4 decision is part of 260719-1428's validation audit trail.
  Supersede it with a dated note pointing to this plan; never delete the original rationale. A
  future reader must see *both* the original decision and why it was reversed.
- **Drift between new fallback text and existing F6 text** — step 17 already specifies the
  hash-recompute-and-compare path; the new Risk Assessment language must reference step 17 verbatim
  rather than restating it differently (DRY). Step 8 catches this.
- **F11/F12 latent coupling** — the steps already read as plain tests, but the status note (L6) is
  what coupled them to the ledger row. Fixing L6 (step 1) is the load-bearing edit; the Phase 3
  consistency sweep confirms no other "activates on that row" phrase survives.