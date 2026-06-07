---
phase: 1
title: "0 — Surface declaration + validation"
status: pending
priority: P1
effort: "15m"
dependencies: []
---

# Phase 0: Surface declaration + validation

## Overview

This plan is meta work (no `product/**` surface). Phase 0 is a lightweight validation gate: confirm the operational surface and verify the loop is in a ready state before schema changes begin.

**Context:** The old AGENTS.md "Decision records MUST exist" rule was found to be stale workaround language — a manifestation of `meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois`. Decision records are no longer used for meta-state work. See new finding `meta-260607T1048Z-stale-agents-md-language-biases-agents-toward-creating-decis` (reported in Phase 0) for the follow-up cleanup.

## Requirements

- **Functional:** Validate the loop is in a ready state and the operational surface is clear.
- **Non-functional:** No decision records, no records writes. Pure read-only validation.

## Architecture

N/A — pure metadata. No code changes.

## Related Code Files

- **Read-only:** `AGENTS.md` (line 116 — the stale rule; do not follow)
- **Read-only:** `tools/learning-loop-mcp/core/gate-logic.js` (the actual gate mechanism)
- **Read-only:** `meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois` (the context pollution finding that explains why this Phase 0 no longer requires decision records)

## Implementation Steps

1. **Call `loop_describe` with tier `warm`.** Verify the operational surface includes the expected tools and no degraded state. Confirm `meta-260607T0008Z-dual-field-schema-risk-evidence-code-ref-top-level-vs-eviden` (the finding this plan resolves) is present in the registry.
2. **Call `meta_state_list` with id filter for the target finding.** Verify the finding exists and is `status: reported` or `status: active`.
3. **Validate the meta-state.jsonl registry is writable.** Call `meta_state_report` with a test entry (or use a dry-run approach if available). If this step fails, the registry is not in a writable state and the plan cannot proceed.
4. **Report the stale AGENTS.md rule as a new finding.** Use `meta_state_report` to create `meta-260607T1048Z-stale-agents-md-language-biases-agents-toward-creating-decis` (see below for template). This finding is linked to `meta-260606T1830Z` and is intentionally deferred until after this plan completes.

## Success Criteria

- [ ] `loop_describe({ tier: "warm" })` returns without `degraded: true`
- [ ] `meta-260607T0008Z-dual-field-schema-risk-evidence-code-ref-top-level-vs-eviden` exists in `meta-state.jsonl` with status `reported` or `active`
- [ ] `meta_state_report` test call succeeds (registry is writable)
- [ ] `meta-260607T1048Z-stale-agents-md-language-biases-agents-toward-creating-decis` finding is created and linked to `meta-260606T1830Z`
- [ ] `pnpm validate:plan-loop` exits 0 (Phase 0 does not add new records, so no records validation needed)

## Risk Assessment

- **Risk:** `meta-260607T0008Z` is missing or resolved before the plan begins. **Mitigation:** Verify in Step 2. If the finding is already resolved, this plan is moot; abort and report.
- **Risk:** Registry is not writable (disk full, permission issue). **Mitigation:** Step 3 catches this. If the test write fails, escalate to operator.
- **Risk:** The new finding `meta-260607T1048Z` is not properly linked to `meta-260606T1830Z`. **Mitigation:** The `description` field explicitly references `meta-260606T1830Z` and the `addresses` array includes the id. Verify with `meta_state_list` after creation.

## Related Records

- `meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois` (the parent finding this Phase 0 is mitigating)
- `meta-260607T1048Z-stale-agents-md-language-biases-agents-toward-creating-decis` (the new finding reported in Phase 0, to be resolved in a future session)
- `plans/reports/brainstorm-260607-dual-field-schema-unification.md` (the brainstorm that produced this plan)
