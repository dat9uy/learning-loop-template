---
phase: 6
title: "Verification — measurement harness re-run + hard budgets"
status: pending
priority: P1
effort: "3h"
dependencies: [2, 3, 4, 5]
---

# Phase 6: Verification — measurement harness re-run + hard budgets

## Overview

Re-run the debug report's measurement harness against the shipped changes, check every hard budget (R4), run the `syn`-profile transcript forensics for the pointer-visibility honesty flag, and do the ship-time loop bookkeeping (resolve the finding, log the contract-relocation change-log, annotate the constraint finding).

## Context Links

- Phase 1 baseline: `plans/<plan-dir>/reports/baseline-260720-measurements.md`
- Harness method: `plans/reports/debug-260719-1524-ak-cook-context-attribution.md` (condensed in research report §7)
- Success metrics table: brainstorm §6

## Requirements

- Functional: every metric in the Success Criteria below measured by the scripted harness (`tools/scripts/measure-context-surfaces.mjs` from Phase 1 + `delivery-classify.mjs` from Phase 4), not by prose claims.
- Non-functional: verification is repeatable — commands recorded in the verification report.

## Implementation Steps

1. **Wire budget:** re-run measurement script → total `tools/list` ≤ 45,000B; per-tool table vs Phase 1 baseline appended to the report.
2. **Hook budget:** combined SessionStart stdout (both `.claude` hooks; factory hook too if D3.1 shipped) ≤ 6,000 chars.
3. **Sidecar integrity:** shape + `*_source` flags diff vs Phase 1 snapshot = empty.
4. **Classifier:** run `delivery-classify.mjs` across recent sessions → `delivery-<id>` rows exist; immediate re-run appends 0; read back via `runtime_state_read`; every row `verifyRow`-clean; `runtime-state-metadata-validation.test.js` green.
5. **JIT error-rate check:** gate-log `invalid_field` frequency for patch/batch post-JIT vs Phase 1 baseline — no sustained regression (judgment call documented: brief uptick acceptable if payloads are actionable; sustained climb = rollback trigger).
6. **`syn`-profile forensics (honesty flag):** start a fresh session on the `syn` profile (lean path), send one prompt, then inspect that session's transcript: does the inbound-gate pointer line's additionalContext appear, and does the first-call `usage.input_tokens` pattern corroborate delivery? If stripped → record documented-degradation in the verification report + architecture.md note (no corrective loop, per report rec 4).
7. **Runtime-agnostic audit:** `check_runtime_agnostic` MCP tool over the touched feature paths (field-glossary, loop-introspect builders, both SessionStart hooks, inbound-gate, delivery-classify script).
8. **Full suite:** `pnpm test:iter` green.
9. **Loop bookkeeping (ship gate):**
   - `meta_state_resolve({ id: "meta-260719T2120Z-sessionstart-steering-injection-is-push-dependent-and-silent", resolution: "..." })` — remediation direction realized: pointer-not-payload steering shipped, delivery attestation via classifier rows, pull payloads intact.
   - `meta_state_log_change` — contract relocation: branch-union schemas moved from always-on-wire to at-invocation (JIT error payloads) + field glossary; `change_target: tools/learning-loop-mastra/tools/handlers/meta-state-patch-tool.js` (+ batch), `applies_to.tools: [meta_state_patch, meta_state_batch, loop_describe]`.
   - Relationship note on `meta-260704T0959Z` (constraint finding): patch its description cross-ref or record the note in the change-log `reason` — invocation contracts preserved at the boundary; relocation is delivery-independent.
10. Write verification report to `plans/<plan-dir>/reports/verification-260720-final.md` (metrics table, commands, syn-forensics outcome, bookkeeping ids).

## Success Criteria

- [ ] `tools/list` ≤ 45,000B (measured)
- [ ] Hook stdout ≤ 6,000 chars combined (measured)
- [ ] Sidecar payload intact (diff empty)
- [ ] Classifier rows present + idempotent + `verifyRow`-clean
- [ ] gate-log `invalid_field`: no sustained regression (documented judgment)
- [ ] `syn` forensics: pointer visibility confirmed OR documented-degradation recorded
- [ ] `check_runtime_agnostic` clean; `pnpm test:iter` green
- [ ] Finding resolved; change-log logged; constraint-finding relationship note recorded

## Risk Assessment

- **`syn` forensics inconclusive** (provider strips the channel entirely — nothing to observe) → that IS the unknown-class outcome; document it; the classifier's `unknown` row is the honest record.
- **Budget narrowly missed** (e.g. 46kB) → Phase 2 has headroom levers (batch slimming depth, further describe() shortening); do NOT relax the 45,000B budget without operator sign-off.
- **Bookkeeping premature** (resolve finding before metrics verified) → step 9 runs only after steps 1-8 pass.
