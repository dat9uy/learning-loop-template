---
phase: 1
title: "Research"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Research

## Overview

Deep-dive analysis of all meta-level assertions, evidence files, and recent implementation sessions to catalog gaps, validate findings, and establish implementation priority. This phase produces the authoritative gap inventory that drives all subsequent phases.

## Requirements

- Functional: Produce a complete, prioritized gap inventory with evidence references
- Functional: Validate each gap against current codebase state
- Non-functional: No code changes; research-only phase

## Architecture

Research follows the evidence-first chain: meta assertions → source evidence → current implementation → gap severity assessment. Each gap is classified by:
- **Impact**: How severely does this gap compromise loop integrity?
- **Frequency**: How often does this gap manifest in practice?
- **Closure cost**: Effort to close vs. ongoing cost of leaving open

## Related Code Files
- Read: `records/meta/index/*.yaml` (all meta assertions)
- Read: `records/meta/evidence/*.md` (all meta evidence)
- Read: `records/meta/decisions/*.yaml` (meta decisions)
- Read: `tools/coordination-gate/mcp/tools/*.js` (MCP tools)
- Read: `schemas/*.schema.json` (all schemas)
- Read: `.claude/skills/learning-loop/references/*.md` (skill references)

## Implementation Steps

1. **Assertion inventory** (30 min)
   - List all 50+ meta assertions with topic_tag, scope, and n_count
   - Group by capability (meta) and dimension (static/install/runtime/product)
   - Identify assertions without corresponding implementation

2. **Evidence trace** (30 min)
   - For each gap-class assertion, read the source evidence file
   - Verify the finding is still current (not superseded)
   - Check if a decision record exists for the gap

3. **Implementation audit** (30 min)
   - Compare MCP tool schemas against `schemas/*.schema.json`
   - Compare skill references against `docs/operator-guide.md`
   - Check test coverage for each MCP tool

4. **Priority matrix** (30 min)
   - Score each gap: impact × frequency / closure_cost
   - Identify P1 (must fix), P2 (should fix), P3 (defer) gaps
   - Document dependencies between gaps

5. **Write research output** (15 min)
   - Write findings to `plans/260524-learning-loop-meta-gaps/research-output.md`
   - Include: gap inventory, priority matrix, dependency graph
   - This file serves as the authoritative reference for Phases 2-7

## Output Artifact

- **Create**: `plans/260524-learning-loop-meta-gaps/research-output.md`
  - Gap inventory table (gap ID, assertion refs, evidence refs, severity, priority)
  - Priority matrix with scoring rationale
  - Dependency graph (which gaps block which)
  - Recommended phase assignment for each gap

## Success Criteria

- [ ] Complete inventory of all meta-level gaps with severity scores
- [ ] Each gap traced to source assertion + evidence + decision (if any)
- [ ] Priority classification documented (P1/P2/P3)
- [ ] Dependency graph between gaps established
- [ ] Research output reviewed and approved before proceeding to Phase 2

## Risk Assessment

- **Risk**: Research scope expands into domain gaps (vnstock-specific)
  - Mitigation: Strict boundary — only meta/loop-level gaps in scope
- **Risk**: Some gaps are already fixed but evidence not updated
  - Mitigation: Cross-check current implementation against each assertion
