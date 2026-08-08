---
title: gate-logic PR119 leftover fixes
date: 2026-08-07
summary: "gate-verb observation window, flag-aware verb resolver, bounded strip-helper migration, flake closed by non-reproduction"
---

# gate-logic PR119 leftover fixes

## What happened

Executed plans/260808-0033-gate-logic-pr119-leftover-fixes (5 phases, TDD, --auto) closing the four findings PR #119 left open on the bash gate security boundary.

- **Finding B (test-runner friction):** root cause was schema-vs-implementation drift — `file-readers.js` read `gate-verb:bash` observations but `runtime_state_record`'s zod enum rejected them. Fix: `AFFECTED_SYSTEM_ENUM_RUNTIME` in `core/runtime-state.js` now derives `gate-verb:<verb>` entries from `patterns.json` (re-read locally to avoid a circular import with file-readers.js). Critical catch from the plan's red team: the bash gate uses marker-mode staleness, so the "30-min window" did not exist — added `isObservationStaleByAge` to the `gate-verb:*` path in `evaluate-bash-gate.js`, making the allowance genuinely bounded. Expired observations now get a distinct "expired, record a fresh one" reason instead of "no observation found".
- **Finding D (prefixed-echo false positive):** the full-command pass used a non-flag-aware `segmentVerb`, so `nice -n 5 echo X | tail` resolved verb `5` and never blanked. Extracted `resolveVerbIndex` from `shell-parse.finalizeSegment`; `segmentVerb` delegates. One source of truth for verb resolution.
- **Finding A (strip-helper retirement):** the finding's "dead code" premise was false — a reference sweep showed every remaining helper is load-bearing. Took the plan's sanctioned fallback: migrated the 3 test files that imported strip internals to the public surface / `classifyPolicyTokens`, added `matchConstraintPattern` echo-to-exec-sink locks (docker/sudo tokens stay visible through echo prose), deleted only the genuinely dead set (`stripEchoProseSafe` + 3 exclusive satellites, superseded by `applyInertSinkBlanking`). Finding resolved with the re-scope recorded.
- **Finding C (two flakes):** 67/67 in isolation; 3 full-suite runs (3108 tests) never reproduced. Closed with non-reproduction evidence; assertions unchanged.

## Decision

- Full live-path unification onto the policy view deferred: it rebuilds the entire blanking strip chain on the security boundary for no behavioral gain; the Phase 2 design deliberately retains `stripEchoProse` via the shared resolver.
- Manifest wire budget raised 53K to 55K deliberately (the gate-verb enum growth adds ~1.4 KB across runtime-state tool schemas); context-savings snapshot refreshed.
- Code review (code-reviewer subagent): APPROVE_WITH_CONCERNS — fixed a misleading blanking comment + the expiry reason; rejected the claimed coverage loss (case 4c/4d decision-level locks verified present).

## Next steps

- Branch 260808-gate-logic-pr119-leftover-fixes ready for PR (3 commits, full suite green x2, fallow:gate green, runtime-agnostic clean).
- `gate-logic-quoted-strings.test.js:88-99` remains a documented locked limitation (`stripNodeEvalBody` escaped-quote handling) if a future phase upgrades it to a quote-aware state machine.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
