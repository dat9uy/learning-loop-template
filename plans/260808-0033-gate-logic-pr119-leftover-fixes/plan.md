---
title: "gate-logic PR119 leftover fixes"
description: "Fix the four open findings left by merged PR #119 (observation-gated verb layer on quote-aware parse substrate): test-runner gate-verb friction (B), applyPromotedRules full-command legacy-verb false-positive (D), strip-helper retirement (A), and two pre-existing gate-logic flakes (C). TDD, security-boundary."
status: pending
priority: P1
effort: "3.5-5d"
tags: [gate-logic, security-boundary, tdd, pr119]
created: 2026-08-08
blockedBy: []
---

# gate-logic PR119 leftover fixes

## Overview

PR #119 added a new parse substrate (`core/shell-parse.js` → `classifyPolicyTokens`,
plus `matchGateVerb` and `applyInertSinkBlanking` in `core/gate-logic.js`) as the bash
gate's security boundary, but left four open findings. This plan closes them with a
TDD, behavior-preserving approach, treating the ~3089-test suite (especially the
echo-prose-pipe-target bypass locks and the verb-layer tests) as the regression net.

The four findings are interrelated:
- **D (keystone)** — `applyPromotedRules`' full-command pass uses the legacy
  `stripEchoProse` (not flag-aware), so prefixed echo to an inert sink
  (`time -p echo X | tail`) is un-blanked by the full-command pass after the
  per-segment pass blanked it → false-positive escalation (conservative; no bypass).
- **A** — the legacy strip helpers are retained; deletion is deferred pending
  test-import migration. Reality (verified): every listed helper is still used by
  the live path, so retirement requires migrating the live path to `shell-parse`.
- **C** — two tests asserting `escalate` reportedly return `ok` intermittently.
  Verified: **67/67 pass in isolation**, so the flake is full-suite ordering/state
  pollution, not a consistent failure; the finding's "update assertions" advice is
  questionable.
- **B** — the new verb layer gate-blocks the canonical test runner
  (`pnpm test:one` → `bash tools/scripts/test-one.sh`) and `node -e`. Root cause
  verified: a schema-vs-implementation drift — `file-readers.js` reads observations
  with `affected_system === "gate-verb:bash"`, but `runtime_state_record`'s
  `affected_system` enum rejects `gate-verb:*`, so the observation the gate expects
  **cannot be recorded**.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Unblock the test runner via a real 30-min observation mechanism (Finding B) | P1 |
| 2 | Make `applyPromotedRules` flag-aware on both passes (Finding D) | P1 |
| 3 | Retire the legacy strip helpers after migrating the live path + test imports to the `shell-parse` substrate (Finding A) | P2 |
| 4 | Diagnose and close the two gate-logic flakes (Finding C) | P2 |
| 5 | Verify the whole gate on the full suite + fallow + runtime-agnostic audit; resolve the four findings in meta-state | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Unblock the test runner (Finding B)](./phase-01-b-unblock-test-runner.md) | Pending |
| 2 | [Phase 2: Flag-aware full-command pass (Finding D)](./phase-02-d-flag-aware-full-command.md) | Pending |
| 3 | [Phase 3: Strip-helper retirement (Finding A)](./phase-03-a-strip-helper-retirement.md) | Pending |
| 4 | [Phase 4: Flake diagnosis (Finding C)](./phase-04-c-flake-diagnosis.md) | Pending |
| 5 | [Phase 5: Verify and resolve findings](./phase-05-verify-resolve.md) | Pending |

Dependencies: Phase 2 → Phase 1 (run tests cleanly via the canonical runner).
Phase 3 → Phase 2 (D's flag-aware resolver lets the full-command pass drop
`stripEchoProse`, enabling some deletions). Phase 4 → Phase 1 (full-suite runs need
the unblocked runner). Phase 5 → all.

## Key design decisions

- **Finding B (user-directed):** do NOT flag-gate `bash` to `-c` — the existing
  `gate-logic-verb-layer.test.js` locks `| bash`, here-strings, and bare `bash` as
  exec sinks, so that would break security tests and weaken the gate. Instead extend
  the runtime-state `affected_system` enum (`AFFECTED_SYSTEM_ENUM_RUNTIME`) to accept
  `gate-verb:<verb>` entries by **re-reading `patterns.json["gate-verbs"]` inside
  `runtime-state.js`** (the same source `file-readers.js` already reads), so
  `runtime_state_record({affected_system:"gate-verb:bash"})` is accepted. The shared
  helper MUST NOT live in `file-readers.js` (it imports from `runtime-state.js` →
  circular import); re-read in `runtime-state.js`.
- **The 30-min time-box is NOT free — it must be built (red-team #1, Critical).** The
  bash gate uses **marker-mode** staleness (`checkObservationStaleness` →
  `isObservationStaleByMarker`), NOT age-mode. `OBSERVATION_STALENESS_WINDOW_MS` is the
  *operator-marker* TTL, applied to an observation's *age* only by the **inbound**
  gate's `isObservationStaleByAge`, which the bash gate does NOT call. So as-is, a
  `gate-verb:bash` observation stays valid **indefinitely** until paused/stopped or a
  newer inbound-gate warn. To deliver the 30-min allowance the user wants, Phase 1
  **adds age-based expiry to the gate-verb path** (call `isObservationStaleByAge` for
  `gate-verb:*` constraints in `evaluate-bash-gate.js`). Without this, the allowance is
  unbounded — not acceptable.
- **No docker/sudo precedent (red-team #2).** docker/sudo have **no** observation path
  — they are unconditional blocks, absent from the enum/mapping. `gate-verb:bash`
  observation-satisfiability is a **new** bypass surface, not a match to an existing
  one. The threat model is analyzed on its own merits: the promoted-rule layer is a
  **denylist, not a sandbox** (red-team #9) — arbitrary `bash -c` bodies not matching a
  promoted rule pass during the window. The mitigation is the real 30-min age expiry
  (bounded window) + deliberate/auditable recording + the denylist backstop, not a
  docker/sudo analogy.
- **Finding A:** the "dead code" claim is inaccurate — the helpers are live. Retirement
  is therefore an incremental, test-gated migration of the live path to `shell-parse`,
  not a blind deletion. **Only 3 of the 5 named test files import strip-helper
  internals** (red-team #4); the other 2 (`echo-prose-pipe-target`, `quoted-strings`)
  import only the public surface. Migration is a **rewrite, not a re-import** (red-team
  #5) — `evaluateBashGate`/`classifyPolicyTokens` return different types than the strip
  helpers. Fallback: if the live-path migration proves too large/risky, keep the legacy
  helpers, delete only the dead subset, and re-scope the finding.
- **Finding C:** diagnosis-first. Isolation passes (67/67), so reproduce in the FULL
  suite; root-cause (candidates: `promotedRulesCache`/`overrideCache` in-memory state,
  `process.env.GATE_ROOT` cross-test mutation, leftover `.gate-override` markers —
  red-team #3); fix the cause. Do NOT blindly change assertions. If unreproducible
  after good-faith full-suite runs, close with evidence.
- **Enum boundary (red-team #15):** `runtime_state_record` validates against
  `AFFECTED_SYSTEM_ENUM_RUNTIME`; `meta_state_report`/`meta_state_resolve` validate
  against `AFFECTED_SYSTEM_ENUM` (no `gate-verb:*`). Meta-state writes describing the
  new observation surface use `affected_system:"gate-logic"`, not `"gate-verb:bash"`.

## Success Criteria

- [ ] `runtime_state_record({affected_system:"gate-verb:bash", kind:"budget-state",
  id:"gate-verb:bash", source_ref:..., timestamp:...})` is accepted (after
  `gate_mark_preflight({surface:"runtime-state"})`), and — while active and **≤30 min
  old by age-based expiry added in this phase** — satisfies the `gate-verb:bash`
  constraint; older than 30 min it does NOT (Finding B).
- [ ] `time -p echo X | tail` and `nice -n 5 echo X | tail` return `ok` against the
  vitest rule; the 44 echo-prose bypass locks and the verb-layer tests stay green (Finding D).
- [ ] The **3** test files that import strip-helper internals no longer do; deleted
  helpers have zero live references (unreferenced-function sweep, incl. leaf helpers);
  the full gate-logic suite stays green (Finding A).
- [ ] A new regression lock `matchConstraintPattern('echo "docker run evil" | bash')`
  → `"docker"` is added BEFORE the Phase 3 migration and stays green (Finding A, red-team #8).
- [ ] `gate-logic-quoted-strings.test.js:88-99` asserts the corrected `null` result
  once `stripNodeEvalBody` is quote-aware — or remains a locked limitation with a
  re-scoped finding if that migration is deferred (Finding A sub-item).
- [ ] The two flake tests pass deterministically in the FULL suite across repeated
  runs, or the finding is closed with reproduction evidence (Finding C).
- [ ] Full suite green (3089+), `pnpm fallow:gate` green (baselines re-saved via the
  `fallow dead-code/health/dupes --save-baseline` subcommands), `check_runtime_agnostic` clean.
- [ ] All four meta-state findings resolved (or re-scoped with evidence) via loop tools
  (meta-state writes use `affected_system:"gate-logic"`).

## Open questions

- Phase 3 scope: full live-path → `shell-parse` unification (large, what the finding
  literally asks) vs bounded test-migration + partial deletion (YAGNI). Decision
  deferred to the Phase 3 entry gate; the fallback re-scopes the finding if needed.

## Red Team Review

### Session — 2026-08-08
**Reviewers:** Security Adversary (Fact Checker), Failure Mode Analyst (Flow Tracer), Assumption Destroyer (Scope Auditor). Tier: Full (5 phases).
**Findings:** 16 raw → 15 deduplicated (all Accept, all evidence-backed with `file:line`).
**Severity breakdown:** 1 Critical, 5 High, 9 Medium, 1 Low.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | "30-min time-box" is false (bash gate = marker-mode staleness, not age) — observation indefinite until paused | Critical | Accept | Phase 1 (+ plan decisions/success) |
| 2 | docker/sudo analogy false — they have no observation path; gate-verb:bash is a NEW surface | High | Accept | Phase 1 (+ plan) |
| 3 | "No module-level mutable state" false — promotedRulesCache + overrideCache + GATE_ROOT are live vectors | High | Accept | Phase 4 |
| 4 | Only 3 of 5 test files import strip helpers; migration scope overstated | High | Accept | Phase 3 |
| 5 | "Keep assertions" false — evaluateBashGate/classifyPolicyTokens return different types; migration is a rewrite | High | Accept | Phase 3 |
| 6 | Phase 1 docs note broken — requires gate_mark_preflight + id===affected_system | High | Accept | Phase 1 |
| 7 | Phase 2 option (a) composition order — applyInertSinkBlanking must run on RAW command; prefer option (b) | Medium | Accept | Phase 2 |
| 8 | Phase 3 verification gap — no matchConstraintPattern echo→exec-sink lock; add before migrating | Medium | Accept | Phase 3 |
| 9 | Promoted-rule backstop is a denylist, not a sandbox | Medium | Accept | Phase 1 (+ plan) |
| 10 | Fallow re-save commands underspecified — use fallow dead-code/health/dupes --save-baseline | Medium | Accept | Phase 5 |
| 11 | Phase 3 no rollback procedure — commit per-helper, git revert on break | Medium | Accept | Phase 3 |
| 12 | "Cache-key collision" fix impossible — overrideCache keyed by root; drop hypothesis | Medium | Accept | Phase 4 |
| 13 | Circular-import risk — re-read patterns.json in runtime-state.js, not a helper in file-readers.js | Medium | Accept | Phase 1 |
| 14 | Deletion list omits leaf helpers (stepSquote/stepDquote/stepDquoteBs) — use unreferenced-function sweep | Medium | Accept | Phase 3 |
| 15 | Cross-enum boundary — meta-state writes use "gate-logic"; legacy literals unmapped (out of scope) | Med/Low | Accept | Phase 1/5 |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01..05.
- Decision deltas applied: (1) Phase 1 now adds age-based expiry (30-min time-box built, not free) + re-read patterns.json in runtime-state.js + preflight/canonical-id docs; (2) docker/sudo analogy dropped, denylist-not-sandbox stated; (3) Phase 3 scope narrowed to 3 test files, migration framed as rewrite with rollback + unreferenced-function sweep + matchConstraintPattern bypass lock; (4) Phase 4 mutable-state vectors (promotedRulesCache/overrideCache/GATE_ROOT) replace the false "no in-memory state" claim, impossible cache-key-collision hypothesis dropped; (5) Phase 5 fallow re-save subcommands spelled out, meta-state enum boundary stated.
- Stale-term sweep across phase files: 0 hits for invalidated phrases (`5 named test files`, `keep assertions`, `window already exists`, `NO module-level mutable state`, `cache keys collide`).
- Effort reconciled to 3.5-5d (P1 grew with age expiry; P3 large).
- Unresolved contradictions: 0. Plan is ready for implementation.

<!-- slug: gate-logic-pr119-leftover-fixes -->