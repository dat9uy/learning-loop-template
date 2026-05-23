---
title: "Learning Loop Meta-Level Gap Closure"
description: "Close systematic gaps in the learning loop's MCP tooling, schema validation, agent behavior rules, and governance mechanisms identified through meta-level evidence analysis."
status: pending
priority: P1
branch: "main"
tags: [product-build, meta, governance, tooling]
blockedBy: []
blocks: []
created: "2026-05-23T18:00:49.819Z"
createdBy: "ck:plan"
source: skill
---

# Learning Loop Meta-Level Gap Closure

## Overview

This plan addresses systematic gaps in the learning loop template identified through analysis of 50+ meta-level assertions, evidence files, and recent implementation sessions. The gaps span five categories: MCP CRUD incompleteness, schema/tooling drift, agent behavior rules, governance documentation, and integration test coverage. Each phase includes TDD structure with tests written before implementation.

## Key Gaps Addressed

1. **MCP CRUD Gaps** (5 findings): Missing `source_refs` on update tools, no `verification` block on experiment create/update, no `delete_record` tool, missing source ref validation at creation time
2. **Skill Template Gaps** (4 findings): Memory dependence, domain overfit, unencoded decisions, evidence authority violations
3. **Observation Discovery**: Agents don't check `records/observations/` before asking user about external system state
4. **Capability Schema**: Minimal map-oriented shape; deferred fields (`description`, `method`, `prerequisites`, `verified_by`) held for N>=3
5. **N=1 vs N>=2 Classification**: Heuristic for gap closure sample-count requirements not enforced
6. **Preflight Gate**: Proven effective but needs hardening (block mode, positive contract)
7. **Knowledge Pack Consumption**: Pattern documented but not in active use after retirement
8. **AJV Validation**: Deferred from YAML parser swap; silent-pass gaps detected

## Phases

| Phase | Name | Status | Effort | Priority |
|-------|------|--------|--------|----------|
| 1 | [Research](./phase-01-research.md) | Pending | 2h | P1 |
| 2 | [Governance](./phase-02-governance.md) | Pending | 3h | P1 |
| 3 | [MCP-Completeness](./phase-03-mcp-completeness.md) | Pending | 6h | P1 |
| 4 | [Schema-Tooling](./phase-04-schema-tooling.md) | Pending | 5h | P2 |
| 5 | [Agent-Behavior](./phase-05-agent-behavior.md) | Pending | 4h | P2 |
| 6 | [Integration-Test](./phase-06-integration-test.md) | Pending | 4h | P1 |
| 7 | [Validation](./phase-07-validation.md) | Pending | 3h | P1 |

## Dependencies

- Phase 1 must complete before all other phases (research informs scope)
- Phase 3 (MCP) must complete before Phase 6 (Integration Test)
- Phase 4 (Schema) must complete before Phase 6 (Integration Test)
- Phase 2 (Governance) can run in parallel with Phases 3-5 after Phase 1

## Cross-Plan Relationships

- Complements: `260522-2008-macro-layer-implementation` (MCP gaps discovered during macro session)
- Supersedes aspects of: `260520-2133-meta-process-skill-template-fix` (skill template gaps)
- Informed by: `260512-0046-meta-evidence-gap-revisit` (N=1 vs N>=2 classification)

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| MCP tool changes break existing workflows | High | Full integration test suite before merge |
| Schema changes invalidate historical records | Medium | Prospective-only convention; no retroactive changes |
| Agent behavior rules are ignored | Medium | Gate enforcement + skill reference updates (acknowledged as best-effort) |
| Scope creep into domain work | Medium | Strict meta-scope boundary; no product code changes |
| `source_refs` validation at creation breaks existing automation | Medium | Warn-only mode for migration; strict mode after transition |

## Success Criteria

- [ ] All 5 MCP CRUD gaps closed with tests
- [ ] 4 skill template gaps resolved in skill references
- [ ] Observation-state-check rule canonized in operator-guide
- [ ] Capability schema enrichment plan documented (N>=3 trigger preserved)
- [ ] N=1/N>=2 classification enforced in meta-evidence workflow
- [ ] Preflight gate verified (already blocks; tests confirm)
- [ ] All tests pass: `pnpm check` green
- [ ] Decision records created for each major policy change
- [ ] Red-team critical issues (C1-C5) resolved in plan

## Red-Team Review Status

Red-team review completed. Critical issues identified and plan updated:
- C1 (delete tool authorization): Hardened with per-type deletable statuses, operator_confirmation flag, reason minimum length
- C2 (source_refs immutability): Changed to append-only on update; immutable list preserved
- C3 (datetime pattern): Verified current schemas are strict; plan updated to loosen pattern and fix 4 affected records
- C4 (preflight block mode): Removed from scope; preflight already blocks unconditionally
- C5 (agent behavior enforceability): Acknowledged as best-effort; enforcement via gate layer only

## Validation Log

### Session 1 — 2026-05-24
**Trigger:** Post-red-team validation interview before implementation
**Questions asked:** 4

#### Questions & Answers

1. **[Failure Handling]** If a bug in new MCP tools causes `pnpm validate:records` to fail, should implementation STOP or continue?
   - Options: STOP immediately | Continue and batch-fix at the end
   - **Answer:** STOP immediately — any validation failure blocks the entire implementation
   - **Rationale:** MCP tools are the core enforcement layer; a bug could corrupt the record ledger or allow invalid records to persist. Stopping ensures each phase is mechanically sound before proceeding.

2. **[Record Fix Strategy]** For superseded `claim-vnstock-runtime-403-root-cause.yaml`, drop empty `product` block or fill with `decision_refs: []`?
   - Options: Drop the empty block | Fill with empty array
   - **Answer:** Drop the empty `product` block — superseded claims don't need product approval sections
   - **Rationale:** Superseded claims are frozen-legacy audit trail. An empty product block implies pending approval intent, which is misleading for a superseded claim.

3. **[Source Ref Validation Mode]** Should `source_refs` validation at creation be STRICT or WARN during transition?
   - Options: STRICT — reject immediately | WARN — allow with deprecation warnings
   - **Answer:** STRICT — reject invalid refs immediately; fix any broken automation as we go
   - **Rationale:** The loop advertises "MCP-first record access" with validation. Warn mode creates a limbo state where invalid records exist but are flagged, complicating the mental model. Strict mode forces correctness from day one.

4. **[Implementation Pacing]** Should all 7 phases be implemented in one session or split across multiple?
   - Options: One session | Multiple sessions | Parallel sessions
   - **Answer:** One session — implement all phases sequentially in a single cook session
   - **Rationale:** The plan is mechanically focused with clear dependencies. Splitting across sessions risks context loss and inconsistency. The ~27h estimate is conservative; actual implementation should be faster with focused context.

#### Confirmed Decisions
- **Validation failure handling:** STOP immediately — no red state allowed during implementation
- **Superseded claim fix:** Drop empty product block
- **Source ref validation:** STRICT mode from day one
- **Implementation pacing:** Single session, all phases sequential

#### Action Items
- [ ] Update Phase 4 to specify "drop empty product block" for superseded claim
- [ ] Update Phase 3 to specify STRICT validation mode (no warn transition)
- [ ] Update Phase 6 integration tests to validate STOP-on-failure behavior
- [ ] Ensure `pnpm check` is run after EACH phase, not just at the end

#### Impact on Phases
- Phase 3: Source ref validation is STRICT; no warn mode fallback
- Phase 4: Superseded claim gets empty block dropped, not filled
- Phase 6: Integration tests must assert that validation failures block progression
- Phase 7: Validation gate runs after each phase, not just at the end

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01 through phase-07
- Decision deltas checked: 4 (failure handling, record fix, validation mode, pacing)
- Reconciled stale references: 0
- Unresolved contradictions: 0
