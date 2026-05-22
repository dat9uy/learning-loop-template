---
phase: 3
title: "Plan Template Update"
status: completed
priority: P2
effort: "2h"
dependencies: [1]
---

# Phase 3: Plan Template Update

## Overview

Embed loop pre-flight as Phase 0 in all product-build plan templates. Phase 0 is advisory — it declares surfaces, lists required decision records, and provides a checklist. The gate (phase 1) enforces mechanically; the template (phase 3) guides the operator. Both work together: template prevents mistakes, gate catches them.

## Requirements

- **Functional**: All plans with `tags: [product-build]` include Phase 0. Phase 0 has surface declaration, decision record checklist, and pre-flight validation commands. Template is discoverable by the local `learning-loop` skill and documented in `CLAUDE.md`.
- **Non-functional**: Template must not break existing non-product plans. Must be copy-paste friendly for manual plan creation.

## Architecture

```
Plan Template (product-build)
├── Phase 0: Loop Pre-Flight
│   ├── Surface Declaration
│   │   └── List all surfaces this plan touches
│   ├── Decision Record Checklist
│   │   └── For each surface: [ ] Decision record exists in records/<surface>/decisions/
│   ├── Pre-Flight Validation
│   │   └── Run pnpm validate:records, pnpm check
│   └── Gate Mode Check
│       └── Confirm GATE_RESPONSE_MODE (warn/escalate)
├── Phase 1+: Regular plan phases
```

## Related Code Files

- **Create**: `.claude/skills/learning-loop/references/plan-phase-0-template.md` — canonical Phase 0 template
- **Modify**: `.claude/skills/learning-loop/references/prompt-blueprints-product-build.md` — add Phase 0 reference
- **Modify**: `docs/operator-guide.md` — document Phase 0 in plan authoring section
- **Create**: `tools/validate-plan-loop.js` test fixture (valid plan with Phase 0)

## Implementation Steps

1. **Write tests first** (validate that Phase 0 is detectable):
   - Create test plan with Phase 0 → validator detects it
   - Create test plan without Phase 0 → validator flags missing
   - Create non-product plan without Phase 0 → validator ignores

2. **Create `plan-phase-0-template.md`**:
   ```markdown
   ## Phase 0: Loop Pre-Flight

   ### Surface Declaration
   This plan touches the following surfaces:
   - [ ] `product` (backend + frontend)
   - [ ] `vnstock` (data layer)
   - [ ] `meta` (loop infrastructure)
   *(Check all that apply)*

   ### Decision Record Checklist
   For each declared surface, confirm decision records exist:
   - [ ] `records/<surface>/decisions/` contains at least one active decision
   - [ ] All Key Decisions from this plan have corresponding decision records
   - [ ] Decision records cite source evidence and required gates

   ### Pre-Flight Validation
   ```bash
   pnpm validate:records
   pnpm check
   ```

   ### Gate Mode
   Current gate response mode: `warn` (allow with warning) / `escalate` (block without approval)
   ```

3. **Update `prompt-blueprints-product-build.md`**:
   - Add "Plan Structure" section referencing Phase 0
   - Update Pre-Implementation Checklist to include Phase 0 verification
   - Add note: "Phase 0 is advisory; gate enforcement is mechanical"

4. **Update `docs/operator-guide.md`**:
   - In "Plan Authoring" or "Agent Intake Flow" section, add Phase 0 description
   - Document that product-build plans require surface declaration
   - Reference the template file

5. **Validate**: Run `pnpm check` to ensure docs updates don't break validators

### Template Discoverability Mechanism

The Phase 0 template is surfaced to agents through three channels:
1. **`CLAUDE.md`**: Project instructions tell agents that product-build plans require Phase 0
2. **`learning-loop` skill**: The local skill's `prompt-blueprints-product-build.md` references the template
3. **Gate enforcement**: The gate (phase 1) mechanically checks for `product-build` tag — agents learn to include Phase 0 to avoid warnings

The global `ck:plan` skill does not read local templates. The three-channel approach above ensures agents discover Phase 0 regardless of which skill initiates planning.

## Success Criteria

- [ ] Template file created and follows project formatting standards
- [ ] Template includes surface declaration, decision checklist, validation commands, gate mode
- [ ] `prompt-blueprints-product-build.md` references Phase 0
- [ ] `docs/operator-guide.md` documents Phase 0
- [ ] Test validator detects Phase 0 presence/absence correctly
- [ ] Non-product plans are not affected

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Template is ignored by agents | Gate enforcement (phase 1) is the backstop; template is advisory guidance |
| Template adds friction to non-product plans | Template is only for `product-build` tagged plans; other plans unaffected |
| Template becomes stale | Template lives in skill reference; updated with skill changes |
