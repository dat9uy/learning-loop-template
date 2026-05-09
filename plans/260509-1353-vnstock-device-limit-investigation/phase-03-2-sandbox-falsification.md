---
phase: 3
title: "2-sandbox falsification"
status: pending
priority: P1
effort: "2h"
dependencies: [2]
---

# Phase 3: 2-sandbox falsification

## Overview

Run the 2-sandbox falsification experiment back-to-back, post-clearance, to isolate the vendor's device-limit mechanism. Default to fresh Docker containers (cheapest); escalate to VM only if container-level results are ambiguous. Branch on outcome: 7a (per-fingerprint metering), 7b (account+OS-global at 2), 7c (clearance did not propagate).

## Requirements

- Functional: two evidence MDs + two per-run experiment YAMLs produced; mechanism isolated
- Non-functional: no inter-run temporal spacing; no other vnstock activity between sandboxes; both sandboxes use clean fingerprints with no prior vnstock history

## Architecture

```
Operator confirms clearance (Phase 2 gate)
  └──→ Sandbox 1: fresh Docker container
         └──→ env-var-driven installer
         └──→ evidence MD + per-run experiment YAML
         └──→ Evaluate: pass / gate-hit / ambiguous?

  └──→ Sandbox 2: second fresh Docker container (immediately after sandbox 1)
         └──→ same installer
         └──→ evidence MD + per-run experiment YAML
         └──→ Evaluate: pass / gate-hit / ambiguous?

Branch:
  7a: Both pass → per-fingerprint metering
  7b: S1 passes, S2 hits gate → account+OS-global at 2
  7c: S1 hits gate → clearance did not propagate; abort S2

Escalation (if container ambiguous):
  └──→ Re-run sandbox-2 in fresh VM
  └──→ If still ambiguous → fresh hardware (operator decision)
```

## Related Code Files

- **Create:** `records/evidence/vnstock-data/experiment-install-<UTC>-sandbox-1.md`
- **Create:** `records/evidence/vnstock-data/experiment-install-<UTC>-sandbox-2.md`
- **Create:** `records/experiments/experiment-vnstock-install-<UTC>-sandbox-1.yaml`
- **Create:** `records/experiments/experiment-vnstock-install-<UTC>-sandbox-2.yaml`

## Implementation Steps

1. Confirm operator clearance is completed (Phase 2 hard gate)
2. Prepare fresh Docker container (sandbox 1), clean fingerprint, no prior vnstock history
3. Run env-var-driven installer end-to-end; capture evidence MD + per-run experiment YAML
4. Immediately prepare second fresh Docker container (sandbox 2)
5. Run same installer; capture evidence MD + per-run experiment YAML
6. Evaluate outcome:
   - **7a.** Both pass → per-fingerprint metering. Document. Rerun #3 can use clean fingerprints without re-clearing.
   - **7b.** Sandbox 1 passes, 2 hits gate → account+OS-global at 2. Document. Consider subscription upgrade or recurring clearance loop.
   - **7c.** Sandbox 1 hits gate → clearance did not propagate. Abort sandbox 2. Pivot to vendor-mechanism evidence-gathering subplan.
7. If container-level results are ambiguous, escalate sandbox-2 re-run to fresh VM, then hardware if needed

## Success Criteria

- [ ] Two evidence MDs exist with distinct timestamps
- [ ] Two per-run experiment YAMLs exist with `result` per R-Q4 convention
- [ ] Outcome branch (7a/7b/7c) documented in this phase's review section
- [ ] No other vnstock activity occurred between the two sandbox runs
- [ ] If 7c: abort documented, pivot subplan referenced

## Risk Assessment

High risk: vendor mechanism is undocumented; experiment may fail in unexpected ways. Mitigation: cascade design (container → VM → hardware) provides controlled escalation. 7c path includes explicit abort-and-pivot instruction. No credentials or API keys are exposed to the agent.
