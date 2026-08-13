<!-- level: L1 | surface: concept -->

# Review in the Learning Loop

The learning loop is adversarial by design. Findings are challenged by `meta_state_derive_status` (is this still true?) and `meta_state_check_grounding` (does the code match the fingerprint?). Change-logs are challenged by superseding change-logs. Rules are challenged by `meta_state_query_drift` and supersession. This document describes when and how to apply external review — the skeptical agent or operator who reads records they did not write.

## Review Is Not Optional

External review catches what the loop's built-in checks miss:

- A finding whose `evidence_code_ref` drifted but whose status was not yet re-derived.
- A change-log whose `change_target` does not cover the bound artifacts it actually touched.
- A rule whose `pattern_type` no longer matches how it is consumed.
- A budget-state row that was paused but whose constraint is still being enforced as if active.

The loop assumes the next reader is skeptical. Review makes that assumption real.

## What Gets Reviewed

| Artifact | When to review | What to check |
|---|---|---|
| **finding** | Before resolving or promoting it | Is `evidence_code_ref` still live? Is the status derived, or merely asserted? Is the grounding fresh (`meta_state_derive_status` / `meta_state_check_grounding`)? Is it `stale`-view (re-verify before closing)? |
| **change-log** | Before relying on the recorded change | Does `change_target` + `applies_to.schemas` cover the bound artifacts touched? Is it the authoritative lineage for a `superseded` finding (`consolidates`)? |
| **rule** | Before enforcing or extending it | Is the rule still `active`? Does `pattern_type` / `internalization_level` match how it is consumed (I2/state-2 `agent-checklist` vs I3/state-3 action-boundary)? Is a superseding rule linked? |
| **loop-design** | Before shipping it | Is `shipped_in_plan` stamped (`meta_state_ship_loop_design`)? Does the design still address the motivating findings (`addresses`)? |
| **runtime-state row** (budget-state) | Before budget-consuming actions | Is the latest `budget-state` row `active` and fresh (`runtime_state_read`)? Has the surface been paused or stopped? Is the ledger consistent with the gate's view? |
| **product code** | After implementation | Does it stay within the rule's boundary? Does it respect output policy? Does it handle the risks flagged in planning? |

## Review Dimensions

### Epistemic Review

Are the records justified by the evidence? Check:

- **Evidence sufficiency** — does the cited `evidence_code_ref` actually support the finding, or is it tangential?
- **Grounding calibration** — is the finding's status derived (`meta_state_derive_status`) or merely asserted? Is `mechanism_check: true` set where the mechanism is re-checkable?
- **Dimension separation** — are `static`, `install`, `runtime`, and `product` kept separate, or conflated (see `docs/philosophy.md` Pillar 1)?
- **Negative knowledge** — are failures and inconclusive results preserved as findings, or swept under "notes"?

### Structural Review

Do the records form a coherent graph? Check:

- **Cross-reference integrity** — do `source_refs` and the structural cross-ref fields (`reopens`, `consolidated_into`, `promoted_to_rule`, `supersedes`, `consolidates`, `origin`, `addresses`, `proposed_design_for`) resolve to existing entries? (Validate with `meta_state_relationships` / `meta_state_relationship_validate`.)
- **Lineage consistency** — does the finding → change-log → rule lineage make sense? Is every `superseded` finding consolidated into a real change-log?
- **Superseded links** — are old records linked to their replacements, or do they float unconnected?
- **Stale evidence** — is there a finding cited whose grounding has since drifted?

### Boundary Review

Do rules actually fence what they intend to fence? Check:

- **Allowed vs blocked** — a rule that permits an action should make clear what it does not permit; a boundary record is "yes, within these lines, and no outside them."
- **Scope leakage** — does the rule's `applies_to` / scope predicate include everything it touches, or miss downstream paths?
- **Reversibility** — is there a path to supersede or deactivate the rule?

### Temporal Review

Has external reality changed since the records were written? Check:

- **Runtime-state freshness** — when was the latest `budget-state` row written? Is the surface still `active` (or `paused`/`stopped`)?
- **Budget state** — has the resource budget been exhausted by an action not recorded in the loop?
- **Vendor state** — have external systems (APIs, device slots, auth models) changed since the finding was grounded?

## Review Classifications

After review, classify the finding:

| Classification | Meaning | Action |
|---|---|---|
| **non-blocker** | The finding is observational or suggests future improvement. No immediate fix required. | Document in review notes. Address if convenient. |
| **blocker avoided** | The loop's built-in checks already prevent the bad outcome. The finding confirms the check is working. | No action unless the check itself is fragile. |
| **blocker** | The finding reveals a gap that could lead to a wrong decision, unverified product code, or exhausted resources. | Fix before proceeding. Update records, rerun validation, or escalate to operator. |
| **meta** | The finding reveals a gap in the loop itself — a missing schema, a rule that agents consistently miss, a validator that should exist. | File a `finding` via `meta_state_report`; if the gap is structural, propose a `loop-design` (`meta_state_propose_design`). Consider promoting a rule. |

## When to Review

### Continuous Review

Every agent reading records they did not write is a reviewer. Before relying on a finding, change-log, or rule, perform a lightweight epistemic review. This is not bureaucracy. It is the loop's immune system.

### Focused Review

Trigger a full review across all dimensions when:

- A product-build plan is approved.
- A vendor API changes (new version, new auth model, new rate limits).
- A resource budget is exhausted or reset.
- A finding is resolved or a rule is promoted (the boundary the loop enforces changes).
- An operator resolves an external constraint (e.g., clears a device slot, pauses a budget surface).

### External Review

Bring in a human or separate agent team when:

- The decision involves irreversible external state.
- The risk severity is `high` or `critical`.
- The finding is the first of its kind for a new vendor or domain.
- The loop has self-identified a meta gap (the loop improving itself needs outside validation).

## Review Output

A review should produce:

1. **Classification** for each finding (non-blocker / blocker avoided / blocker / meta).
2. **Affected records** — which finding, change-log, rule, loop-design, or runtime-state row the review touches.
3. **Reasoning** — why the finding matters, with citations to evidence or records.
4. **Recommended action** — fix now, defer, or escalate.
5. **Meta flag** — whether the finding should become a meta finding (about the loop itself).

Record a meta finding via `meta_state_report`; `records/meta/` holds meta artifacts. Domain-specific reviews are ephemeral unless they reveal a blocker that must be recorded as a finding.

## Summary

Review is not a gate at the end. It is a continuous, skeptical reading of records by agents and operators who did not write them. The loop's built-in checks catch mechanical errors. Review catches judgment errors — overconfidence, scope creep, stale assumptions, and gaps in reasoning. Treat every record as if a skeptical agent will read it next week and decide whether to trust it.
