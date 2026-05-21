---
phase: 4
title: "Operator Guide Shrink"
status: pending
priority: P1
effort: "2h"
dependencies: [1, 2, 3]
---

# Phase 4: Operator Guide Shrink

## Overview

Remove encoded sections from `docs/operator-guide.md`, leaving only philosophy, reasoning framework, and exceptions. Target: < 120 lines from current ~600 lines.

## Key Insights

- Shrink must be INCREMENTAL and VERIFIED — remove one section only after its corresponding workflow tool is tested
- The guide keeps: philosophy (why the loop exists), governance model (high-level), how to reason with the loop (judgment, not procedure), resource budget (overview), write domain rules (hook reference), workflow auto-trigger (config reference)
- The guide deletes: agent intake flow (13 steps), operator cards (9 cards), runtime validation protocol, runtime artifact standard, evidence-MD to experiment-YAML conversion, phase success criteria, experiment result convention, rule origins, agent anti-confusion checklist
- Some sections move to meta evidence files rather than being deleted

## Requirements

- Functional:
  - Remove all procedural sections that have corresponding workflow tools
  - Keep philosophy, reasoning, governance overview, exceptions
  - Add cross-references to workflow tools where sections were removed
  - Target < 120 lines (range 100-140 acceptable; do not delete philosophy/reasoning to hit number)
- Non-functional:
  - No knowledge lost — all removed content lives in tools or meta evidence
  - Guide remains readable and coherent after shrink

## Related Code Files

- Modify: `docs/operator-guide.md`
- Read for context:
  - `records/evidence/meta/evidence-findings-convention.md`
  - `records/evidence/meta/resource-budget-procedural-rules.md`
  - `records/evidence/meta/capability-generation-extension.md`
  - `records/evidence/meta/live-gate-template.md`

## Implementation Steps

1. **Pre-deletion validation**
   - Run `pnpm validate:records`
   - Grep all markdown source_refs for `#anchor` links into `docs/operator-guide.md`
   - Block deletion of any section still referenced by records or blueprints

2. **Update blueprint files**
   - Update `.claude/skills/learning-loop/references/prompt-blueprints.md` to reference `workflow_generate_prompt` instead of deleted guide sections
   - Update `.claude/skills/learning-loop/references/prompt-blueprints-state-gated.md` to reference `workflow_prepare_runtime_request` + `check_gate`
   - Update `.claude/skills/learning-loop/references/prompt-blueprints-product-build.md` to reference `workflow_product_build`

3. **Audit current guide sections**
   - Read `docs/operator-guide.md`
   - Map each section to its replacement (tool or meta evidence file)
   - Mark sections as: keep / delete / move-to-meta-evidence

4. **Remove encoded sections**
   - Delete agent intake flow (lines ~305-336)
   - Delete operator cards (lines ~337-481)
   - Delete evidence-MD to experiment-YAML conversion (lines ~501-530)
   - Delete phase success criteria (lines ~531-560)
   - Delete experiment result convention (lines ~483-500)
   - Delete rule origins
   - Delete agent anti-confusion checklist (lines ~585-599)

5. **Add cross-references**
   - After "State Query Protocol" section: reference `search_index_entries`
   - After "Resource Budget" section: reference `check_gate` + `workflow_prepare_runtime_request`
   - After "MCP Tools" section: auto-generate or reference server
   - After "Runtime Validation" section: reference `workflow_prepare_runtime_request`

6. **Verify line count**
   - `wc -l docs/operator-guide.md` → must be < 120 (range 100-140 acceptable)
   - If > 140, compress non-philosophy sections; do NOT delete philosophy or reasoning

7. **Validate no broken internal links**
   - Check all markdown links still resolve
   - Check all `#anchor` references still exist
   - Use grep to verify no stale references to deleted sections

## Todo List

- [ ] Pre-deletion validation: `pnpm validate:records` + anchor scan
- [ ] Update blueprint files to reference workflow tools
- [ ] Audit guide and map sections to replacements
- [ ] Delete agent intake flow section
- [ ] Delete operator cards section
- [ ] Delete evidence conversion section
- [ ] Delete phase success criteria section
- [ ] Delete experiment result convention section
- [ ] Delete rule origins section
- [ ] Delete anti-confusion checklist section
- [ ] Add cross-references to workflow tools (use actual tool names)
- [ ] Verify line count < 120 (range 100-140 acceptable)
- [ ] Validate no broken links

## Success Criteria

- [ ] `docs/operator-guide.md` < 120 lines (range 100-140 acceptable)
- [ ] All removed content is accessible via workflow tools or meta evidence files
- [ ] Guide still contains: philosophy, reasoning framework, governance overview
- [ ] Blueprint files updated to reference workflow tools instead of deleted guide sections
- [ ] No broken internal links
- [ ] `pnpm validate:records` still passes (no record references to removed sections)

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Deleted section still referenced by records | High | Run `pnpm validate:records` before and after shrink |
| Guide becomes incoherent | Medium | Keep transitional paragraphs explaining where content moved |
| Team members still expect guide content | Low | Add prominent header: "Procedural knowledge encoded in MCP workflow tools" |

## Next Steps

After Phase 4 completes, proceed to Phase 5 (guide shrink verification). Phase 5 is a hard gate: it verifies every deleted section has a replacement before allowing integration test to run.
