---
title: "MCP Tool Agentization: Extend constraint-gate with 7 learning-loop tools"
description: "Extend the constraint-gate MCP server with 7 agent-facing tools for record validation, claim verification, index management, capability generation, probe listing, and verified claims reporting. Modularize server with tool registry pattern. Update write gate for new paths."
status: completed
priority: P1
effort: "8h"
branch: "main"
tags: [infra, mcp, agentization, tools]
blockedBy: []
blocks: []
created: "2026-05-21"
createdBy: "ck:plan"
source: skill
---

# MCP Tool Agentization: Extend constraint-gate with 7 learning-loop tools

## Overview

Extend the constraint-gate MCP server with 7 new tools that expose the learning-loop tool suite as structured MCP surfaces. The existing CLI tools (`validate-records`, `verify-claim`, `extract-index`, `search-index`, `generate-capabilities`, `list-probes`, `list-verified`) are wrapped as MCP tools with enum-validated params and structured JSON responses.

**Why:** Agents currently call these tools via Bash, parse console output, and construct fragile command strings. MCP tools provide structured params, typed responses, and direct integration with the agent's tool-use loop.

**Pattern:** "Minimal hook, rich MCP" — hooks stay as hard safety nets; all policy and agent-facing logic lives in the MCP layer.

**Source:** [`plans/reports/agentize-scout-260521-mcp-candidates.md`](./reports/agentize-scout-260521-mcp-candidates.md)

## Architecture

```
Agent (Claude)
   │
   ├─ MCP: check_gate ──────────────► constraint-gate server
   ├─ MCP: validate_records ────────► (new) ──► validate-records.js
   ├─ MCP: update_claim_verification ► (new) ──► verify-claim.js
   ├─ MCP: extract_index_entries ───► (new) ──► extract-index.js
   ├─ MCP: search_index_entries ────► (new) ──► search-index.js
   ├─ MCP: generate_capability_records ► (new) ──► generate-capabilities.js
   ├─ MCP: list_runtime_probes ─────► (new) ──► list-probes.js
   ├─ MCP: list_verified_claims ────► (new) ──► (pure JS rewrite)
   └─ MCP: notify_artifact_change ──► (existing)
```

Server modularization:
```
tools/constraint-gate/
  server.js                    # thin registry, imports all tools
  tool-registry.js             # registerTool helper
  tools/
    validate-records-tool.js
    extract-index-tool.js
    search-index-tool.js
    generate-capabilities-tool.js
    update-claim-tool.js
    list-probes-tool.js
    list-verified-tool.js
```

## Phases

| Phase | Name | Status | Priority | Effort |
|-------|------|--------|----------|--------|
| 1 | [Shared Infrastructure](./phase-01-shared-infrastructure.md) | Completed | P1 | 1.5h |
| 2 | [Tool Registry + Server Refactor](./phase-02-tool-registry-server-refactor.md) | Completed | P1 | 1h |
| 3 | [validate_records Tool](./phase-03-validate-records-tool.md) | Completed | P1 | 1h |
| 4 | [update_claim_verification Tool](./phase-04-update-claim-verification-tool.md) | Completed | P1 | 1h |
| 5 | [Index Tools](./phase-05-index-tools.md) | Completed | P2 | 1h |
| 6 | [Capability + Probe Tools](./phase-06-capability-probe-tools.md) | Completed | P2 | 1h |
| 7 | [list_verified_claims + Integration](./phase-07-list-verified-claims-integration.md) | Completed | P2 | 1.5h |

## Dependencies

- Phase 1: no dependencies
- Phase 2: depends on Phase 1 (shared lib + gate update in place)
- Phase 3: depends on Phase 2 (registry available)
- Phase 4: depends on Phase 2 (registry available)
- Phase 5: depends on Phase 2 (registry available)
- Phase 6: depends on Phase 2 (registry available)
- Phase 7: depends on Phase 1 (list-verified rewrite), Phase 2 (registry), Phase 3-6 (all tools registered)
- External: `260517-1600-constraint-gate-mcp-server` (complete) — builds on its foundation

**Serial constraint:** Phases 3-6 each modify `server.js` (add imports + register calls). They must be implemented serially or coordinated by a single owner to avoid merge conflicts.

## Rollback Strategy

| Phase | Rollback Action |
|-------|-----------------|
| Phase 1 | `cp .claude/coordination/hooks/write-coordination-gate.cjs.bak .claude/coordination/hooks/write-coordination-gate.cjs` |
| Phase 2 | Revert `server.js` to pre-refactor version; delete extracted tool files |
| Phase 3-6 | Remove tool import + register call from `server.js`; delete tool file |
| Phase 7 | Restore `list-verified.sh`; revert `package.json` script |
| All | `git checkout main` (work on feature branch) |

## Red Team Review

**Session:** 2026-05-21
**Findings:** 12 unique (after dedup from 88 across 4 reviewers)
**Disposition:** 12 accepted, 3 rejected
**Severity breakdown:** 4 Critical, 8 High

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| R1 | verify-claim.js `fail()` calls `process.exit(1)` — MCP tool calling it kills server | Critical | Accept | Phase 4 |
| R2 | `pathMatchesObservation` only handles `records-evidence`, not index/capabilities | Critical | Accept | Phase 1 |
| R3 | `root` parameter enables path traversal to arbitrary filesystem locations | Critical | Accept | Phase 2 (shared helper), Phase 3-7 |
| R4 | Unhandled exception in tool handler crashes entire MCP server | Critical | Accept | Phase 2 |
| R5 | `resolveRoot()` is local to server.js, not exported — tool wrappers cannot access it | High | Accept | Phase 2 |
| R6 | Wrong relative import paths in ALL tool wrappers (`../../` should be `../../../`) | High | Accept | Phase 3-7 |
| R7 | Phases 3-6 claim they can run in parallel but all edit `server.js` | High | Accept | plan.md, Phase 2 |
| R8 | verify-claim.js refactor more invasive than plan admits (module-level `root`, `fail()` landmines) | High | Accept | Phase 4 |
| R9 | No rollback strategy for any phase | High | Accept | plan.md (Rollback Strategy), all phases |
| R10 | `records/index/**` requires observation but no tool creates the observation | High | Accept | Phase 1 |
| R11 | Phase 2 refactor changes module structure — any import error breaks server and all tests | High | Accept | Phase 2 |
| R12 | Tool name collision not detected at registration time | High | Accept | Phase 2 |

### Rejected Findings

| # | Finding | Reason |
|---|---------|--------|
| J1 | tool-registry.js is unnecessary abstraction | Provides consistent pattern and SDK API insulation; 3 lines, minimal overhead |
| J2 | Phases 3-6 could be merged into one phase | Priority-based separation (P1 vs P2) enables parallel work by different agents; each tool has different complexity |
| J3 | list-verified reads `records/index/` — scope creep | Design choice; reading index enhances evidence mapping |

### Whole-Plan Consistency Sweep

- Fixed: All import paths in phase files corrected from `../../` to `../../../`
- Fixed: Added `resolveRoot` extraction to Phase 2 shared helper
- Fixed: Added error boundary wrapper to Phase 2 registry
- Fixed: Added tool name uniqueness check to Phase 2
- Fixed: Added `process.exit` audit requirement to Phase 4
- Fixed: Added `WRITE_PATH_PATTERNS` extension to Phase 1
- Fixed: Added observation creation for records-index/capabilities to Phase 1
- Fixed: Removed false parallel claim; added serial constraint note
- Fixed: Added rollback strategy to plan.md and each phase
- Fixed: Added root path validation to shared helper
- Fixed: Added intermediate validation step to Phase 2 (server starts after refactor)
- Verified: No stale references to old APIs, files, or field names remain

## Key Decisions

| Decision | Answer |
|----------|--------|
| Single or separate MCP server? | Single — extend constraint-gate |
| Framework? | None — DIY registry with existing `McpServer` + Zod |
| Schema language? | Zod (already used by existing 5 tools) |
| validate_records auto-fix? | **No** — MCP tool is read-only; fix stays CLI-only |
| records/index/** write gate | Add to allow list with observation requirement |
| records/capabilities/** write gate | Add to allow list with observation requirement |
| Audit trail | Shared `gate-log.jsonl` (existing rotation) |
| list-verified | Pure JS rewrite; drop `yq` dependency |

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Server size explosion (800+ lines) | High | Tool registry pattern; each tool in its own file |
| Write gate blocks new tool writes | High | Phase 1 updates gate allow list |
| Zod + AJV dual validation | Low | Zod for MCP params (already used), AJV for YAML records (unchanged) |
| Breaking existing MCP clients | Medium | Existing tool names unchanged; only additions |
| Tool handler errors crash server | Medium | Each handler wraps in try/catch; returns error as structured result |

## Validation Log

### Session 1 — 2026-05-21
**Trigger:** Post-red-team validation interview before implementation
**Questions asked:** 4

#### Questions & Answers

1. **[Architecture/Schema]** Zod vs JSON Schema: The scout rejected Zod but existing server uses it. Continue with Zod or refactor all tools?
   - Options: Continue with Zod (Recommended) | Refactor all to JSON Schema | Mixed state
   - **Answer:** Continue with Zod (Recommended)
   - **Rationale:** Consistency with existing 5 tools; dual-validator overhead is acceptable at current scale

2. **[Scope]** `list_runtime_probes` has low agent value. Include as MCP tool or keep CLI-only?
   - Options: Include as MCP tool (Recommended) | Keep CLI-only
   - **Answer:** Include as MCP tool (Recommended)
   - **Rationale:** Completes the suite; low effort; consistent surface

3. **[Risk]** Phase 4's verify-claim refactor is highest-risk (process.exit audit, root threading). Proceed or skip?
   - Options: Agentize with full refactor (Recommended) | Keep CLI-only
   - **Answer:** Agentize with full refactor (Recommended)
   - **Rationale:** Highest agent value (P1); structured enums + dry-run are genuinely useful

4. **[Architecture]** At 12 tools, should we keep single server or plan for separation?
   - Options: Keep single server (Recommended) | Plan for separation now
   - **Answer:** Keep single server (Recommended)
   - **Rationale:** Shared state, auth, audit trail; revisit at tool #13

#### Confirmed Decisions
- Schema language: Zod — consistency with existing tools
- Tool count: 12 in single server — separation deferred
- list_probes: Included in MCP scope — completes the suite
- verify-claim: Full refactor accepted — risk accepted for high agent value

#### Action Items
- [x] No plan changes needed — all answers align with existing plan direction

#### Impact on Phases
- No phase changes required; all validation answers confirm existing plan decisions

### Whole-Plan Consistency Sweep
- Verified: Zod decision consistent across all phase code examples
- Verified: Single server architecture consistent across plan.md and all phases
- Verified: 12-tool count consistent (5 existing + 7 new)
- Verified: No contradictions between validation answers and red-team findings
- Status: **Zero unresolved contradictions**

## Success Criteria

- [x] All 7 new tools callable via MCP with structured JSON responses
- [x] Server size under 400 lines (modularized)
- [x] Existing 5 tools unchanged and functional
- [x] Write gate allows `records/index/**` and `records/capabilities/**` with observation
- [x] list-verified rewritten in pure JS, no `yq` dependency
- [x] All existing tests pass
- [x] New tests for each MCP tool handler
- [x] Audit trail logs all tool calls
