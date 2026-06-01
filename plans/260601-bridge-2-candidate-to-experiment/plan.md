---
title: "Bridge 2 — Candidate-to-Experiment Mapping"
description: "Close Bridge 2 (Candidate → Experiment Plan) of docs/trajectory.md. Build a mapping convention and MCP tool that generates experiment records from candidate assertions, plus the promotion workflow from candidate to pending_approval to active."
status: completed
priority: P2
branch: "main"
tags: [bridge-2, candidate, experiment, mcp-tool, workflow]
blockedBy: [260601-bridge-1-evidence-first-auto-assist]
blocks: []
created: "2026-06-01T05:29:05.141Z"
createdBy: "ck:plan"
source: skill
---

# Bridge 2 — Candidate-to-Experiment Mapping

## Overview

Bridge 1 (Doc → Candidate Assertion) is complete. The system now has `candidate` status in the index schema, a vendor doc assist tool, and a hard validation block preventing unverified assertions from reaching product code.

Bridge 2 (Candidate → Experiment Plan) closes the gap between "know what to test" (candidate assertion) and "know how to test it" (runnable experiment). The trajectory says: *"Each candidate maps to a runnable verification (call, expected shape, success criterion). Today: humans design experiment YAMLs from scratch. Gap: no mapping convention from 'vendor says X' to 'experiment Y proves X.'"*

This plan defines the mapping convention, builds an MCP tool, and adds the promotion workflow (candidate → pending_approval → active).

## Phases

| Phase | Name | Status | Effort | Priority |
|-------|------|--------|--------|----------|
| 1 | [Research](./phase-01-research.md) | Completed | 2h | P1 |
| 2 | [Design](./phase-02-design.md) | Completed | 2h | P1 |
| 3 | [Mapping Tool](./phase-03-mapping-tool.md) | Completed | 3h | P1 |
| 4 | [Promotion Workflow](./phase-04-promotion-workflow.md) | Completed | 2h | P1 |
| 5 | [Test](./phase-05-test.md) | Completed | 2h | P1 |
| 6 | [Integration](./phase-06-integration.md) | Completed | 1h | P2 |

## Dependencies

### Cross-Plan
- **Blocked by:** `260601-bridge-1-evidence-first-auto-assist` — must have candidate status, vendor doc assist, and validation hard-block in place before building candidate-to-experiment mapping.

### Informed By
- `docs/trajectory.md` — Bridge 2 description and the four bridges architecture
- `plans/reports/brainstorm-260601-bridge-1-evidence-first-auto-assist.md` — artifact model and status conventions
- `schemas/experiment.schema.json` — existing experiment record schema
- `tools/learning-loop-mcp/core/experiment-writer.js` — experiment record creation logic
- `tools/learning-loop-mcp/tools/record_create_experiment` — existing MCP tool
- `records/meta/evidence/install-experiment-template-candidate.md` — experiment template conventions

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| Mapping convention is too rigid | Medium | Per-dimension templates with optional overrides; human edits final experiment |
| Bridge-2 tool creates experiments without human review | Critical | Tool returns draft experiments only; status is always `draft`; operator must approve |
| `pending_approval` promotion workflow is too complex | Medium | Single MCP tool `record_update_observation` with operator_confirmation; manual for first version |
| Existing experiment schema is missing `assertion_refs` | Medium | Add `assertion_refs` to schema (Phase 1 research) or use `source_refs` |
| No live `candidate` entries to test against | Medium | Create synthetic candidate entry in e2e tests; optionally run bridge-1 pipeline on a vendor doc first |

## Success Metrics

| Metric | Target |
|--------|--------|
| MCP tool `workflow_candidate_to_experiment` registered and callable | Yes |
| Tool generates a valid experiment record from a candidate assertion | Yes |
| Generated experiment has `status: draft` and `requires_human_approval: true` | Yes |
| Mapping convention documented in `docs/artifact-concepts.md` | Yes |
| Promotion workflow (candidate → pending_approval → active) has at least one MCP tool | Yes |
| Full pipeline tested: vendor doc → candidate → experiment → validate → approve → active | Yes |
| `pnpm check` passes after all changes | Yes |
| All existing tests pass (no regression) | Yes |
