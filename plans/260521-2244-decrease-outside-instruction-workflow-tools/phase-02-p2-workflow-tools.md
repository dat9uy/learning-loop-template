---
phase: 2
title: "P2 Workflow Tools"
status: pending
priority: P2
effort: "6h"
dependencies: [1]
---

# Phase 2: P2 Workflow Tools

## Overview

Implement six medium-priority workflow tools covering evidence conversion, prompt generation, and the four prompt-classifiable operator cards (intentional skip, evidence verification, external decision, self-improvement).

## Key Insights

- `workflow_generate_prompt` is the most complex — it must map 5 blueprint categories to 11 actual prompt skeletons across 3 blueprint files
- `workflow_convert_evidence_to_experiment` reads evidence MD and produces experiment YAML — it reuses the same logic as `extract_index_entries` but outputs full YAML documents
- The four "operator card" tools (intentional_skip, verify_evidence, external_decision, self_improvement) are decision-tree tools — they classify a situation and return structured guidance
- All four card tools share a similar pattern: input → classification → structured output with records_required, risks, rationale

## Requirements

- Functional:
  - `workflow_convert_evidence_to_experiment`: Evidence MD → experiment YAML (migration or structuring mode)
  - `workflow_generate_prompt`: Return structured prompt object from 5 blueprint categories covering 12+ prompt skeletons
  - `workflow_intentional_skip`: Handle skip requests, convert to records/risk/decision/capability updates
  - `workflow_verify_evidence_execution`: Build assertion extraction matrix, classify execution classes
  - `workflow_external_decision`: Accept outside confirmation as seed, record scope/basis/risks
  - `workflow_self_improvement`: Create improvement experiments under existing governance
- Non-functional:
  - Each tool < 80 lines of handler logic
  - Rich descriptions with failure modes
  - Tests use `node:test` + real filesystem

## Architecture

```javascript
// workflow-generate-prompt-tool.js
const BLUEPRINT_MAP = {
  evidence: { file: "prompt-blueprints.md", skeletons: ["generic-learning-loop"] },
  "state-gated": { file: "prompt-blueprints-state-gated.md", skeletons: ["blocked", "deferred", "warning", "constrained"] },
  "product-build": { file: "prompt-blueprints-product-build.md", skeletons: ["pre-build", "skill-phase", "pre-implementation", "post-build"] },
  experiment: { file: "prompt-blueprints.md", skeletons: ["experiment-planning", "evidence-to-experiment"] },
  "runtime-validation": { file: "prompt-blueprints.md", skeletons: ["runtime-install-proof"] }
};
```

## Related Code Files

- Create: `tools/constraint-gate/tools/workflow-convert-evidence-tool.js`
- Create: `tools/constraint-gate/tools/workflow-convert-evidence-tool.test.js`
- Create: `tools/constraint-gate/tools/workflow-generate-prompt-tool.js`
- Create: `tools/constraint-gate/tools/workflow-generate-prompt-tool.test.js`
- Create: `tools/constraint-gate/tools/workflow-intentional-skip-tool.js`
- Create: `tools/constraint-gate/tools/workflow-intentional-skip-tool.test.js`
- Create: `tools/constraint-gate/tools/workflow-verify-evidence-tool.js`
- Create: `tools/constraint-gate/tools/workflow-verify-evidence-tool.test.js`
- Create: `tools/constraint-gate/tools/workflow-external-decision-tool.js`
- Create: `tools/constraint-gate/tools/workflow-external-decision-tool.test.js`
- Create: `tools/constraint-gate/tools/workflow-self-improvement-tool.js`
- Create: `tools/constraint-gate/tools/workflow-self-improvement-tool.test.js`
- Modify: `tools/constraint-gate/server.js` (add 6 imports + 6 register calls)
- Read for context:
  - `tools/constraint-gate/tools/extract-index-tool.js`
  - `records/evidence/meta/evidence-findings-convention.md`
  - `.claude/skills/learning-loop/references/prompt-blueprints.md`
  - `.claude/skills/learning-loop/references/prompt-blueprints-state-gated.md`
  - `.claude/skills/learning-loop/references/prompt-blueprints-product-build.md`

## Implementation Steps

### Tests First (TDD)

1. **Write tests for all 6 tools**
   - `workflow-convert-evidence-tool.test.js`: dry_run mode, migration mode, structuring mode, missing file
   - `workflow-generate-prompt-tool.test.js`: each of 5 blueprint categories returns correct shape
   - `workflow-intentional-skip-tool.test.js`: blocked vs narrowed vs accepted
   - `workflow-verify-evidence-tool.test.js`: symbol-exists vs full-runtime depth
   - `workflow-external-decision-tool.test.js`: partial vs full acceptance
   - `workflow-self-improvement-tool.test.js`: schema-change vs workflow-gap

### Implementation

2. **Implement `workflow-convert-evidence-tool.js`**
   - Read evidence MD file
   - Extract `## Findings` section with `[topic-tag]` bullets
   - Map to experiment YAML structure
   - Support migration mode (full rewrite) and structuring mode (new structure on existing)
   - Return experiment_yaml string + validation_errors + source_refs_linked + status

3. **Implement `workflow-generate-prompt-tool.js`**
   - Read appropriate blueprint file based on `blueprint` + optional `skeleton` parameter
   - Parse blueprint markdown to extract prompt skeletons
   - Substitute `context` values into skeleton after validating/escaping each value
   - Return structured prompt object with prompt, constraints, required_records, suggested_tools, budget_context, approval_gates
   - Sanitize all `context` fields before substitution to prevent indirect prompt injection

4. **Implement `workflow-intentional-skip-tool.js`**
   - Input: assertion_id, skip_reason, scope
   - Output: status (blocked/narrowed/accepted), records_required, blocked_work, allowed_work, rationale
   - Do not let skipped knowledge disappear — convert to loop artifacts

5. **Implement `workflow-verify-evidence-tool.js`**
   - Input: evidence_path, verification_depth
   - Read evidence MD, extract code snippets and assertions
   - Classify each assertion by execution class: symbol-exists, import-succeeds, method-callable, sample-output, full-runtime
   - Return assertion_matrix + counts + skipped_snippets + required_approvals

6. **Implement `workflow-external-decision-tool.js`**
   - Input: source, authority_scope, confirmed_scope, remaining_blocks
   - Output: acceptance (partial/full/rejected), records_required, risks, capability_boundaries, rationale
   - External confirmation seeds a decision; loop still records scope, basis, risks, boundaries

7. **Implement `workflow-self-improvement-tool.js`**
   - Input: improvement_type, description, proposed_changes
   - Output: experiment_candidate, decision_required, risks, next_steps, canonical_adoption_path
   - Hard-test failures become evidence; canonical adoption requires explicit decision approval

8. **Register 6 tools in `server.js`**
   - Add 6 import statements + 6 register calls
   - Verify server starts without errors

## Todo List

- [ ] Write tests for all 6 P2 tools
- [ ] Implement `workflow-convert-evidence-tool.js`
- [ ] Implement `workflow-generate-prompt-tool.js`
- [ ] Implement `workflow-intentional-skip-tool.js`
- [ ] Implement `workflow-verify-evidence-tool.js`
- [ ] Implement `workflow-external-decision-tool.js`
- [ ] Implement `workflow-self-improvement-tool.js`
- [ ] Register 6 tools in `server.js`
- [ ] Write rich descriptions for each tool (what, when, returns, failure modes)
- [ ] Run `pnpm test` — all tests pass
- [ ] Run existing tests — no regressions

## Success Criteria

- [ ] All 6 tools return structured JSON with correct shape
- [ ] Tests pass: 6 test files, 12+ test cases
- [ ] Server starts with all 22 tools registered (16 existing + 6 new)
- [ ] `workflow_generate_prompt` covers all 12+ prompt skeletons across 5 blueprint categories
- [ ] `workflow_convert_evidence` produces valid experiment YAML

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| `workflow_generate_prompt` blueprint parsing is fragile | Medium | Use simple regex/section matching; document fallback behavior |
| `workflow_convert_evidence` YAML output may be invalid | Medium | Run output through `yaml.parse()` in test to validate |
| Four card tools have overlapping logic | Low | Each has distinct output shape; share no code unless obvious |

## Security Considerations

- All workflow tools are pure advisory — return JSON/YAML only; they do NOT write files via MCP
- `workflow_convert_evidence` reads evidence files and returns structured experiment YAML; agent uses Write tool to persist
- `workflow_verify_evidence` does NOT execute code — only classifies execution potential
- `workflow_self_improvement` does NOT auto-apply changes — returns experiment candidate for agent review and manual Write
- `workflow_generate_prompt` sanitizes all `context` values before substituting into prompt skeletons

## Next Steps

After Phase 2 completes, proceed to Phase 3 (P3 workflow tools).
