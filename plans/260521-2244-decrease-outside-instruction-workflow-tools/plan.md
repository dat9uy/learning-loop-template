---
title: "Decrease Outside Instruction: Workflow Tools + Guide Shrink"
description: "Encode procedural operator-guide knowledge into 13 MCP workflow tools, shrink guide from 600 to <120 lines, validate end-to-end agent autonomy"
status: pending
priority: P1
branch: "main"
tags: [workflow, mcp, agentization, docs]
blockedBy: []
blocks: []
created: "2026-05-21"
createdBy: "ck:plan"
source: skill
---

# Decrease Outside Instruction: Workflow Tools + Guide Shrink

## Overview

The operator guide (`docs/operator-guide.md`) is ~600 lines of procedural instruction agents must read manually every session. The system already mechanically enforces dangerous actions via hooks and gate tools. The remaining ~500 lines are "outside instruction" — knowledge the system has but does not drive.

This plan encodes that procedural knowledge into 13 MCP `workflow_*` tools so the agent completes intake → experiment → capability lifecycle without opening the operator guide. After encoding, the guide shrinks to ~120 lines (philosophy + reasoning + exceptions only).

**Source:** [`plans/reports/brainstorm-260521-decrease-outside-instruction.md`](../../reports/brainstorm-260521-decrease-outside-instruction.md)

## Architecture

```
Agent (Claude)
   |
   ├─ MCP: workflow_classify_prompt ──────► constraint-gate server
   ├─ MCP: workflow_intake_orient ────────► (new)
   ├─ MCP: workflow_prepare_runtime_request ─► (new)
   ├─ MCP: workflow_convert_evidence ────────► (new)
   ├─ MCP: workflow_generate_prompt ───────────► (new)
   ├─ MCP: workflow_intentional_skip ──────────► (new)
   ├─ MCP: workflow_verify_evidence ───────────► (new)
   ├─ MCP: workflow_external_decision ─────────► (new)
   ├─ MCP: workflow_self_improvement ──────────► (new)
   ├─ MCP: workflow_report_phase_status ─────► (new)
   ├─ MCP: workflow_product_build ───────────► (new)
   ├─ MCP: workflow_runtime_probe ─────────────► (new)
   ├─ MCP: workflow_intake_plan ───────────────► (new)
   └─ MCP: existing tools (check_gate, validate_records, etc.) ───► (existing 12)
```

Server structure:
```
tools/constraint-gate/
  server.js                    # thin registry (~90 lines after all 25 tools registered)
  tool-registry.js             # registerTool helper (~32 lines) + safeImport
  tools/
    # Existing tools (12)
    ...
    # New workflow tools (13)
    workflow-classify-prompt-tool.js
    workflow-intake-orient-tool.js
    workflow-intake-plan-tool.js
    workflow-prepare-runtime-request-tool.js
    workflow-convert-evidence-tool.js
    workflow-generate-prompt-tool.js
    workflow-intentional-skip-tool.js
    workflow-verify-evidence-tool.js
    workflow-external-decision-tool.js
    workflow-self-improvement-tool.js
    workflow-report-phase-status-tool.js
    workflow-product-build-tool.js
    workflow-runtime-probe-tool.js
```

## Phases

| Phase | Name | Status | Priority | Effort | Dependencies |
|-------|------|--------|----------|--------|-------------|
| 0 | [safeImport + Dynamic Manifest](./phase-00-safeimport-manifest.md) | Pending | P1 | 1h | — |
| 1 | [P1 Workflow Tools](./phase-01-p1-workflow-tools.md) | Pending | P1 | 4h | 0 |
| 2 | [P2 Workflow Tools](./phase-02-p2-workflow-tools.md) | Pending | P2 | 6h | 1 |
| 3 | [P3 Workflow Tools](./phase-03-p3-workflow-tools.md) | Pending | P2 | 3h | 2 |
| 4 | [Operator Guide Shrink](./phase-04-operator-guide-shrink.md) | Pending | P1 | 2h | 1-3 |
| 5 | [Guide Shrink Verification](./phase-05-guide-shrink-verification.md) | Pending | P1 | 1.5h | 4 |
| 6 | [Integration Test](./phase-06-integration-test.md) | Pending | P1 | 2h | 1-5 |

**Serial constraint:** Phases 1-3 each add tool files. `server.js` is modified once per phase to register new tools. Prefer a single owner for all `server.js` edits, or use dynamic manifest/auto-discovery to avoid shared-file contention.

## Dependencies

- **Internal predecessor** Phase 0 (safeImport + dynamic manifest) — blocks all subsequent phases
- **External predecessor** `260521-1843-mcp-tool-agentization` (completed) — tool registry pattern, 7 gate tools, server modularization
- **External predecessor** `260521-0200-mcp-workflow-layer` (completed) — minimal hook, `notify_artifact_change`, `trigger_workflow`
- **External predecessor** `260521-0104-add-update-observation-to-mcp-server` (completed) — `update_observation` tool
- **Cross-plan**: `260520-write-gate-observation-unification` (completed) — write gate allowlist for `records/index/**` and `records/capabilities/**`

## Rollback Strategy

All phases work on a feature branch. Rollback uses `git revert` for surgical per-phase removal.

| Phase | Rollback Action |
|-------|-----------------|
| Phase 0 | `git revert` the safeImport commit; restore static imports |
| Phase 1-3 | `git revert` the phase commit; delete tool file + test file |
| Phase 4 | `git revert` the shrink commit |
| Phase 5 | Delete verification report |
| Phase 6 | Delete integration test files |
| All | `git checkout main` |

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Server.js static import SPOF | Critical | Phase 0 implements `safeImport` wrapper + dynamic manifest so one broken tool does not crash all 25 tools |
| MCP-level write gate bypass | Critical | All workflow tools are pure advisory — return JSON/YAML only; agent uses Write tool for persistence |
| Agent confuses tool namespaces | Medium | Clear naming + descriptions; enforcement = check/write tools, orchestration = workflow tools |
| Tool description quality | High | Explicit todo item in every phase: write and review rich descriptions |
| Guide shrink loses knowledge | High | Incremental per phase: encode section, test tool, then delete from guide |
| Integration test is synthetic | Medium | Test validates tool coverage; supplement with at least one real agent session without guide access |
| Advisory tool spoofing | Critical | `workflow_prepare_runtime_request` has no `gate_status`; agent must call `check_gate` before execution |

## Success Criteria

- [ ] All 13 workflow tools callable via MCP with structured JSON responses
- [ ] Each workflow tool has a `.test.js` file; all tests pass with `pnpm test`
- [ ] Operator guide < 120 lines after shrink (range: 100-140 acceptable)
- [ ] Integration test `agent-completes-intake-lifecycle` passes
- [ ] No regression in existing 12 tools
- [ ] All workflow tools have rich descriptions (what, when, returns, failure modes)
- [ ] `workflow_generate_prompt` covers all 12+ prompt skeletons from blueprint files
- [ ] `workflow_classify_prompt` covers all 8 categories from intake flow
- [ ] All 13 intake steps have corresponding tool, template, or documented manual step
- [ ] Blueprint files updated to reference workflow tools instead of deleted guide sections
- [ ] `shrink-verification-report.md` produced with PASS verdict (16/16 encoding items verified)
- [ ] At least one real agent session validated end-to-end without guide access

## Key Decisions

| Decision | Answer |
|----------|--------|
| Single or separate server? | Single — extend constraint-gate (same as gate tools) |
| Framework? | None — DIY registry with existing `McpServer` + Zod |
| Namespace prefix? | `workflow_*` for orchestration tools; existing enforcement tools use names like `check_gate`, `validate_records` — no `gate_*` prefix |
| Tool chaining? | Explicit agent calls — no automatic chaining |
| Prompt object or file artifact? | Structured object returned directly — no file I/O |
| Guide shrink pace? | Incremental per phase — encode, test, then delete |
| TDD ordering? | Tests first, then implementation per phase |
| Server SPOF mitigation? | Phase 0: `safeImport` wrapper + dynamic manifest — one broken tool must not crash all 25 |
| MCP write gate bypass? | All workflow tools are pure advisory (return JSON/YAML); agent uses Write tool for persistence |
| Runtime gate tool design? | `workflow_prepare_runtime_request` — advisory only, no `gate_status`; agent must call `check_gate` before execution |
| `workflow_generate_prompt` coverage? | 12+ skeletons mapped to 5 blueprint categories + nested `skeleton` parameter |
| `workflow_intake_plan`? | Added to cover intake steps 3-4 (candidate extraction + verification classify); merged orient+plan or separate tool |
| Guide shrink validation? | Pre-deletion: run `pnpm validate:records` + scan source_refs for `#anchor` links into guide |
