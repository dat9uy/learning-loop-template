---
phase: 1
title: "Self-remediating gate-verb block message (A)"
status: pending
priority: P1
effort: "3-4h"
dependencies: []
---

# Phase 1: Self-remediating gate-verb block message (A)

## Overview

When the bash gate blocks a `gate-verb:<verb>` constraint with no active observation, the block `reason` includes the exact two-call incantation that records the allowance — verb substituted, a fresh ISO timestamp, and the sentinel source_ref from Phase 3. The agent copies two lines instead of spending 15 commands discovering them.

## Requirements

- Functional: a `gate-verb:<verb>` block (no active observation) returns a `reason` containing (1) `gate_mark_preflight({surface:"runtime-state"})`, (2) `runtime_state_record({affected_system:"gate-verb:<verb>", kind:"budget-state", id:"gate-verb:<verb>", source_ref:"local:meta-state:gate-verb-allowance", timestamp:"<ISO>"})`, and the rule `id MUST equal affected_system`.
- Functional: the `<verb>` is substituted from the actual matched verb (`bash`, `node`, `zsh`, `python`, …), not hardcoded.
- Functional: the `<ISO>` timestamp is fresh at block time (the hook process may call `new Date().toISOString()`).
- Functional: the enriched reason is **only** emitted on the `gate-verb:*` path. Docker/sudo/side-effect-import constraints keep their existing reasons.
- Functional: the existing "observation expired" reason variant (age-bounded) is preserved and also made self-remediating (same incantation; "Record a fresh observation" framing).
- Non-functional: `makeGateDecision` in `gate-logic.js` stays pure (no `Date` access). The timestamped incantation is assembled in `evaluate-bash-gate.js`, which already overrides `gateVerbResult.reason` for the expired case at line ~156.

## Architecture

`evaluate-bash-gate.js` calls `matchGateVerb(command)` → `gateVerbMatch` (e.g. `gate-verb:bash`), then `makeGateDecision(gateVerbMatch, observationStatus)`. Today `makeGateDecision` returns the generic reason at `gate-logic.js:1055`. The expired-case override already lives in `evaluate-bash-gate.js:156`.

Add a shared helper `buildGateVerbRemediation(gateVerbMatch)` in `evaluate-bash-gate.js` (or `gate-logic.js` taking an injected `now`/`iso`) that returns the incantation string with a fresh timestamp. In `evaluate-bash-gate.js`, when `gateVerbResult.observation_required && gateVerbMatch.startsWith("gate-verb:")`, set `gateVerbResult.reason = buildGateVerbRemediation(gateVerbMatch)` for both the never-recorded and age-expired branches. Verb extraction: `gateVerbMatch.slice("gate-verb:".length)`.

```
Constraint "gate-verb:bash" detected. No active observation found. Record one to unblock for 30 min:
1) gate_mark_preflight({surface:"runtime-state"})
2) runtime_state_record({affected_system:"gate-verb:bash", kind:"budget-state", id:"gate-verb:bash", source_ref:"local:meta-state:gate-verb-allowance", timestamp:"2026-08-08T04:05:12Z"})
id MUST equal affected_system. Allowance expires 30 min after timestamp.
```

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/evaluate-bash-gate.js` (assemble + attach remediation; preserve expired branch)
- Modify: `tools/learning-loop-mastra/core/gate-logic.js` (optionally export a pure `gateVerbRemediationTemplate(verb, iso)` helper, or keep helper local to evaluate-bash-gate.js — prefer local, 1 consumer, YAGNI)
- Test: `tools/learning-loop-mastra/core/evaluate-bash-gate.test.js`
- Test: `tools/learning-loop-mastra/__tests__/cli-bash-gate-guard.test.js` (wire-level)

## Implementation Steps (TDD — tests first)

1. **Write failing tests** in `evaluate-bash-gate.test.js`:
   - `evaluateBashGate({command:"bash -c 'echo hi'", root})` with no observation → `decision.reason` contains `gate_mark_preflight({surface:"runtime-state"})` and `runtime_state_record({affected_system:"gate-verb:bash"` and `id:"gate-verb:bash"` and `source_ref:"local:meta-state:gate-verb-allowance"` and `id MUST equal affected_system`.
   - The timestamp in the reason matches `/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/`.
   - `node -e "1"` → remediation uses `gate-verb:node` (verb substitution).
   - A docker/sudo block (e.g. `docker run …`) → reason does **not** contain `runtime_state_record` (only the gate-verb path enriches).
   - Expired-observation case (stale-by-age observation present) → reason contains the same incantation + "fresh" wording.
2. Run `pnpm test:one -- evaluate-bash-gate` → confirm red.
3. Add `buildGateVerbRemediation(gateVerbMatch)` (local helper) in `evaluate-bash-gate.js`; attach it on the `gate-verb:*` `observation_required` path and the expired branch.
4. Run tests → green. Run the full gate-verb suite: `gate-verb-observation.test.js`, `cli-bash-gate-guard.test.js`, `legacy-mcp/evaluate-bash-gate-runtime-state.test.js` → no regression.
5. `check_runtime_agnostic` against `core/evaluate-bash-gate.js` (the enriched reason rides the universal hook shared across runtimes — must stay shim-not-fork).

## Success Criteria

- [ ] Tests in step 1 pass.
- [ ] Verb substitution verified for `bash` and `node`.
- [ ] Non-gate-verb constraints (docker/sudo) unaffected.
- [ ] `pnpm test:one` green; `check_runtime_agnostic` passes.

## Risk Assessment

- **Risk:** Enriched reason inflates context on every block. *Signal it broke:* reviewer sees the reason duplicated or emitted on allowed paths. *Response:* gate the enrichment behind `observation_required && startsWith("gate-verb:")` only.
- **Risk:** `new Date().toISOString()` in the hook — confirm the hook process permits `Date` (it is a normal node subprocess, not a workflow script; `Date` is allowed). *Signal:* timestamp is `null`/stale. *Response:* inject `now` from a testable seam.
- **Risk:** Phase 3 sentinel not yet named when Phase 1 lands — the incantation references `local:meta-state:gate-verb-allowance` which the regex already accepts, so Phase 1 is functional standalone; Phase 3 only documents it. Phase 3 is a soft dependency (docs/test), not a hard build dependency.