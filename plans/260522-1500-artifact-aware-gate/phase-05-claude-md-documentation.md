---
phase: 5
title: "CLAUDE.md Documentation"
status: completed
priority: P3
effort: "1h"
dependencies: [1, 2, 3]
---

# Phase 5: CLAUDE.md Documentation

## Overview

Add artifact-level loop rules to the project `CLAUDE.md`. Document: what the gate enforces, when it escalates, how to declare surfaces in plans, and the operator's role in decision record management. This is the human-facing contract that complements the mechanical gate.

## Requirements

- **Functional**: CLAUDE.md includes a new "Artifact-Level Loop Rules" section. Rules are concrete, not philosophical. Examples show correct vs. incorrect behavior. Cross-references to operator-guide.md for detailed mechanics.
- **Non-functional**: Rules must fit the existing CLAUDE.md tone (concise, imperative). No repetition of philosophy — focus on mechanics.

## Architecture

```
CLAUDE.md additions
├── Artifact-Level Loop Rules
│   ├── Product-Build Plans
│   │   └── Must declare surfaces in Phase 0
│   │   └── Must have decision records before implementation phases
│   ├── Product Code Writes
│   │   └── product/api/* and product/web/* require product surface decisions
│   │   └── Gate checks records/<surface>/decisions/ (or flat fallback)
│   ├── Journal Writes
│   │   └── Allowed unconditionally
│   │   └── Agent should suggest drafting experiment YAML
│   └── Gate Response Modes
│       └── warn (default): allow with warning
│       └── escalate: block without approval
│       └── Mode set via GATE_RESPONSE_MODE env var
```

## Related Code Files

- **Modify**: `/home/datguy/codingProjects/learning-loop-template/CLAUDE.md` — add new section
- **Read**: `docs/operator-guide.md` — cross-reference target (read for consistency)
- **Read**: `docs/charter.md` — ensure no contradiction with scope rules

## Implementation Steps

1. **Read current `CLAUDE.md`** to find insertion point and verify no contradictions

2. **Add "Artifact-Level Loop Rules" section** after existing "Skill Coordination" section:
   ```markdown
   ## Artifact-Level Loop Rules

   The write gate enforces loop compliance mechanically. These rules are the
   human-readable contract.

   ### Product-Build Plans
   - All plans with `tags: [product-build]` MUST declare surfaces in Phase 0.
   - Decision records MUST exist in `records/<surface>/decisions/` before
     implementation phases begin.
   - The gate scans plan frontmatter on first write. Missing decision records
     trigger a warning (default) or block (escalate mode).

   ### Product Code Writes
   - Writing to `product/**` requires decision records for the inferred surface.
   - Surface inference: `product/api/*` → surface `product`, `product/web/*` →
     surface `product`. Unknown segments infer surface from first path segment.
   - The gate checks `records/<surface>/decisions/*.yaml` (surface-first) or
     `records/decisions/*<surface>*.yaml` (flat fallback).

   ### Journal Writes
   - `docs/journals/**` is allowed unconditionally.
   - Agents SHOULD suggest drafting `records/<surface>/experiments/` YAML when
     journals contain experiment-worthy observations.
   - Journals are agent observations; experiment records are operator
     formalizations.

   ### Gate Response Modes
   - `warn` (default): allow the write, emit a JSON warning. Use during
     initial validation and mapping confirmation.
   - `escalate`: block the write, require operator approval. Use after the
     operator has validated surface mapping across 3+ builds.
   - Set mode via `GATE_RESPONSE_MODE` environment variable.
   ```

3. **Cross-reference check**: Ensure no contradiction with:
   - `docs/operator-guide.md` "Resource Budget & State-Machine"
   - `docs/charter.md` scope boundaries
   - Existing `CLAUDE.md` "Write Gate Block Protocol"

4. **Validate**: Read updated `CLAUDE.md` for flow and consistency

## Success Criteria

- [ ] New section added to `CLAUDE.md`
- [ ] Section covers plans, product code, journals, and gate modes
- [ ] No contradictions with existing docs
- [ ] Tone matches existing CLAUDE.md (concise, imperative)
- [ ] Cross-references to operator-guide.md are accurate

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Docs drift from actual gate behavior | Update docs when gate logic changes; gate tests serve as spec |
| Rules too verbose | Keep to ~40 lines; reference operator-guide.md for details |
| Contradiction with existing Write Gate Block Protocol | Read existing protocol first; append, don't replace |
