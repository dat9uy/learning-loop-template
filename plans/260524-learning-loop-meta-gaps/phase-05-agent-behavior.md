---
phase: 5
title: "Agent-Behavior"
status: completed
priority: P2
effort: "4h"
dependencies: [1, 2]
---

# Phase 5: Agent-Behavior

## Overview

Close the 4 skill template gaps identified in `records/meta/evidence/skill-template-gap-260520T2133Z.md` and harden agent behavior rules for observation discovery, memory prohibition, and evidence authority. These gaps cause agents to bypass the records layer, rely on injected memory, or author evidence without operator confirmation.

## Requirements

- Functional: Memory prohibition rule enforced in skill references
- Functional: Domain-neutral operator-guide (vnstock-specific content moved to appendix)
- Functional: Decision-record requirement in product-build blueprints
- Functional: Operator-only evidence protocol in product-build blueprints
- Functional: Observation-state-check rule in agent intake flow
- Non-functional: Skill references are the single source of truth
- Non-functional: No agent-facing docs contain domain-specific examples

## Architecture

Agent behavior is governed by three layers:
1. **Skill references** (`.claude/skills/learning-loop/references/`) — authoritative rules
2. **Operator guide** (`docs/operator-guide.md`) — human-readable procedures
3. **MCP workflow tools** (`tools/coordination-gate/mcp/tools/workflow-*.js`) — mechanical enforcement

Changes flow: skill reference update → operator guide sync → workflow tool enforcement.

## Related Code Files

- Modify: `.claude/skills/learning-loop/references/learning-loop-rules.md`
- Modify: `.claude/skills/learning-loop/references/prompt-blueprints.md`
- Modify: `.claude/skills/learning-loop/references/prompt-blueprints-product-build.md`
- Modify: `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md`
- Modify: `docs/operator-guide.md`
- Modify: `docs/operator-guide-vnstock-appendix.md`
- Modify: `.claude/skills/learning-loop/SKILL.md`
- Create: `.claude/skills/learning-loop/references/agent-anti-confusion-checklist.md`

## Implementation Steps

1. **Memory prohibition** (1h)
   - Add explicit rule to `learning-loop-rules.md`:
     - "Agents MUST query `records/index/` and `records/observations/` instead of relying on injected CLAUDE memory"
     - "Agents MUST re-read env vars each time; never cache gate state"
   - Update `SKILL.md` to reference the rule
   - Add test: skill reference contains memory prohibition

2. **Domain overfit fix** (1h)
   - Audit `docs/operator-guide.md` for vnstock-specific examples
   - Move any vnstock-specific content to `docs/operator-guide-vnstock-appendix.md`
   - Replace with generic examples (e.g., "external system" instead of "vnstock")
   - Add template for adding new external systems to operator-guide
   - Verify: `grep -i vnstock docs/operator-guide.md` returns 0 matches

3. **Unencoded decisions fix** (1h)
   - Update `prompt-blueprints-product-build.md`:
     - Add requirement: "All architectural decisions MUST be encoded as `records/<surface>/decisions/` artifacts"
     - Add checklist item: "Decision records exist for every Key Decision"
   - Update `meta-evidence-self-improvement.md`:
     - Add: "Plan-level decisions not encoded as records are a gap class"
   - Add enforcement: `workflow_product_build` tool checks for decision records

4. **Evidence authority fix** (1h)
   - Update `prompt-blueprints-product-build.md`:
     - Add: "Agent may draft evidence findings; operator MUST author the evidence file"
     - Add: "Agent MUST NOT update `validation_status` to `passed` without operator confirmation"
   - Update `workflow-verify-evidence-tool.js` to enforce operator confirmation
   - Add rule to `agent-anti-confusion-checklist.md`

## TDD Structure

```javascript
// skill-reference-tests
// Verify learning-loop-rules.md contains required rules
describe('learning-loop-rules.md', () => {
  test('contains memory prohibition', () => {
    const content = readFile('references/learning-loop-rules.md');
    assert.ok(content.includes('records/index/'));
    assert.ok(content.includes('injected CLAUDE memory'));
  });

  test('contains observation-state-check', () => {
    const content = readFile('references/learning-loop-rules.md');
    assert.ok(content.includes('records/observations/'));
  });
});

// prompt-blueprints-product-build.md tests
describe('prompt-blueprints-product-build.md', () => {
  test('requires decision records for key decisions', () => {
    const content = readFile('references/prompt-blueprints-product-build.md');
    assert.ok(content.includes('records/<surface>/decisions/'));
  });

  test('requires operator-only evidence protocol', () => {
    const content = readFile('references/prompt-blueprints-product-build.md');
    assert.ok(content.includes('operator-only evidence'));
  });
});
```

## Success Criteria

- [ ] `learning-loop-rules.md` updated with memory prohibition
- [ ] `learning-loop-rules.md` updated with observation-state-check
- [ ] `operator-guide.md` domain-neutral (vnstock content in appendix)
- [ ] `prompt-blueprints-product-build.md` requires decision records
- [ ] `prompt-blueprints-product-build.md` requires operator-only evidence
- [ ] `agent-anti-confusion-checklist.md` created with all 4 rules
- [ ] `workflow_product_build` checks for decision records
- [ ] `workflow-verify-evidence-tool.js` enforces operator confirmation
- [ ] All skill reference tests pass

## Risk Assessment

- **Risk**: Skill reference updates are ignored by agents using old sessions
  - Mitigation: Skill references are loaded fresh each session; changes take effect immediately
- **Risk**: Operator-guide domain-neutralization loses useful examples
  - Mitigation: Examples moved to appendix, not deleted
- **Risk**: Decision-record requirement slows down product builds
  - Mitigation: Decision records are lightweight; can be created via MCP in seconds
- **Risk**: Evidence authority rule creates friction
  - Mitigation: Agent drafts evidence; operator approves — collaborative, not adversarial
- **Risk**: Agent behavior rules are unenforceable by code
  - Mitigation: Acknowledged as best-effort. Enforcement via gate layer (write gate blocks records/**, preflight gate blocks product/**). Skill references provide guidance but cannot force compliance. This is a fundamental limitation of the architecture.
