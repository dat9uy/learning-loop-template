---
phase: 2
title: "Governance"
status: pending
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Governance

## Overview

Create and update meta-level decision records for policy changes, harden the preflight gate's positive contract, and establish the N=1/N>=2 gap classification as enforced workflow. This phase governs what the loop considers canonical.

## Requirements

- Functional: Decision records for MCP completeness, agent behavior rules, and schema enrichment
- Functional: Preflight gate block mode hardened with 6-step checklist
- Functional: N=1/N>=2 classification workflow documented and enforced
- Non-functional: All decisions follow `schemas/decision.schema.json`
- Non-functional: No retroactive changes to historical records

## Architecture

Governance changes flow through the decision record lifecycle: draft → reviewed → approved. Each decision cites source evidence and specifies `decision_effect` with `allowed_actions`, `blocked_actions`, and `required_gates`.

```
Meta Evidence → Decision Record → Skill Reference Update → Gate Enforcement
```

## Related Code Files
- Create: `records/meta/decisions/decision-meta-260524T0000Z-mcp-crud-completeness.yaml`
- Create: `records/meta/decisions/decision-meta-260524T0000Z-agent-observation-check.yaml`
- Create: `records/meta/decisions/decision-meta-260524T0000Z-n1-n2-classification.yaml`
- Modify: `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md`
- Modify: `docs/operator-guide.md` (observation-state-check rule)
- Modify: `.claude/coordination/hooks/write-coordination-gate.cjs` (preflight block mode)

## Implementation Steps

1. **MCP completeness decision** (45 min)
   - Draft decision record approving MCP tool additions
   - Cite `records/meta/evidence/mcp-crud-gap-macro-implementation-260522.md`
   - Specify `allowed_actions`: add source_refs to update tools, add verification block, add delete tool
   - Specify `blocked_actions`: no direct file writes to records/**

2. **Agent observation-check decision** (45 min)
   - Draft decision record canonizing observation-state-check rule
   - Cite `records/meta/evidence/observation-record-discovery-gap.md`
   - Update `docs/operator-guide.md` Agent Intake Flow step 2
   - Update `docs/operator-guide.md` Agent Anti-Confusion Checklist

3. **N=1/N>=2 classification decision** (45 min)
   - Draft decision record formalizing gap classification workflow
   - Cite `records/meta/evidence/n-equals-one-gap-class.md`
   - Update `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md`
   - Add enforcement: new meta-evidence MUST classify itself

4. **Preflight gate verification** (30 min)
   - Verify preflight gate already blocks unconditionally (exit 2)
   - Confirm 6-step checklist is embedded in block message
   - Test: preflight block prevents product/** writes without marker
   - Document: preflight gate is artifact-aware and always blocks (not configurable via GATE_RESPONSE_MODE)
   - No changes needed — gate is already hardened as proven by `experiment-product-260522T2020Z`

## TDD Structure

```javascript
// tests for preflight gate verification
// File: .claude/coordination/__tests__/preflight-gate-verification.test.cjs

describe('preflight gate verification', () => {
  test('blocks product/** writes without valid preflight marker', () => {
    // given: no preflight marker for surface 'product'
    // when: write gate evaluates product/api/src/main.py
    // then: decision is 'block', exit code 2
  });

  test('allows product/** writes with valid preflight marker', () => {
    // given: valid preflight marker (within TTL) for surface 'product'
    // when: write gate evaluates product/api/src/main.py
    // then: decision is 'ok', exit code 0
  });

  test('block message includes 6-step checklist', () => {
    // given: blocked product write
    // then: response.preflight_checklist has 6 items
  });

  test('preflight gate is not affected by GATE_RESPONSE_MODE', () => {
    // given: GATE_RESPONSE_MODE=warn
    // when: product write without preflight marker
    // then: still blocks (exit 2), not warn
  });
});
```

## Success Criteria

- [ ] Decision record for MCP completeness created and validated
- [ ] Decision record for agent observation-check created and validated
- [ ] Decision record for N=1/N>=2 classification created and validated
- [ ] Preflight gate verified as already blocking (tests pass, no changes needed)
- [ ] `docs/operator-guide.md` updated with observation-state-check rule
- [ ] `meta-evidence-self-improvement.md` updated with classification enforcement
- [ ] `pnpm validate:records` passes with new decision records

## Risk Assessment

- **Risk**: Decision records conflict with existing meta decisions
  - Mitigation: Check `supersedes` field; update linked decisions
- **Risk**: Preflight verification reveals unexpected behavior
  - Mitigation: Tests are read-only; no changes to gate logic in this phase
- **Risk**: Operator-guide updates are overwritten by future sessions
  - Mitigation: Updates are canonized via decision record; skill reference points to decision
