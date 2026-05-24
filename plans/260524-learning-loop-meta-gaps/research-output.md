# Research Output: Learning Loop Meta-Level Gap Closure

## Gap Inventory

| Gap ID | Assertion Refs | Evidence Refs | Severity | Priority | Phase |
|--------|---------------|---------------|----------|----------|-------|
| mcp-source-refs-update | mcp-source-refs-missing | mcp-crud-gap-macro-implementation-260522.md | High | P1 | 3 |
| mcp-verification-update | mcp-experiment-verification-block | mcp-crud-gap-macro-implementation-260522.md | High | P1 | 3 |
| mcp-source-refs-validate | mcp-local-source-path-validation, mcp-record-id-exact-match | mcp-crud-gap-macro-implementation-260522.md | High | P1 | 3 |
| mcp-delete-tool | mcp-no-delete-tool | mcp-crud-gap-macro-implementation-260522.md | High | P1 | 3 |
| skill-memory | skill-template-gaps | skill-template-gap-260520T2133Z.md | Medium | P2 | 5 |
| skill-domain-overfit | skill-template-gaps | skill-template-gap-260520T2133Z.md | Medium | P2 | 5 |
| skill-unencoded-decisions | skill-template-gaps | skill-template-gap-260520T2133Z.md | Medium | P2 | 5 |
| skill-evidence-authority | skill-template-gaps | skill-template-gap-260520T2133Z.md | Medium | P2 | 5 |
| observation-state-check | observation-state-check | observation-record-discovery-gap.md | Medium | P2 | 2,5 |
| capability-schema-enrichment | capability-schema | capability-schema-gap.md | Low | P3 | 4 |
| n1-n2-classification | gap-classification | n-equals-one-gap-class.md | Low | P2 | 2 |
| preflight-verification | (already proven) | preflight-gate-effectiveness.md | Low | P1 | 2 |
| ajv-silent-pass | ajv-validation, silent-pass-gap | ajv-dryrun-results-260512.md | High | P1 | 4 |
| datetime-drift | datetime-format | ajv-dryrun-results-260512.md | Medium | P2 | 4 |

## Priority Matrix

P1 (must fix): All MCP CRUD gaps, AJV silent-pass gaps, preflight verification
P2 (should fix): Skill template gaps, observation-state-check, N=1/N>=2 classification, datetime drift
P3 (defer): Capability schema enrichment (N>=3 trigger not yet met)

## Dependency Graph

- Phase 1 (Research) -> all other phases
- Phase 2 (Governance) -> Phase 5 (Agent-Behavior)
- Phase 3 (MCP) -> Phase 6 (Integration-Test)
- Phase 4 (Schema) -> Phase 6 (Integration-Test)
- Phase 3 + Phase 4 -> Phase 7 (Validation)
- Phase 5 can run parallel with 3-4 after Phase 2

## Cross-Check: Already Fixed vs Still Open

| Gap | Status | Notes |
|-----|--------|-------|
| Memory prohibition | Partially fixed | Rule exists in learning-loop-rules.md; needs reinforcement in SKILL.md |
| Domain overfit | Partially fixed | operator-guide.md is domain-neutral now; vnstock appendix exists |
| Observation-state-check | Partially fixed | Rule exists in learning-loop-rules.md; needs operator-guide update |
| N=1/N>=2 classification | Fixed in skill ref | Needs enforcement in meta-evidence workflow |
| Preflight gate | Fully fixed | Tests confirm block mode works |
| MCP CRUD gaps | All open | 5 gaps identified, zero closed |
| AJV silent-pass | Open | 3 records need fixes |
| Datetime drift | Open | 1 record with local-timezone |

## Recommended Phase Assignment

- Phase 2: Create 3 decision records, verify preflight gate
- Phase 3: Close all 5 MCP CRUD gaps
- Phase 4: Fix AJV silent-pass, datetime pattern, integrate AJV
- Phase 5: Harden skill references, create anti-confusion checklist
- Phase 6: Integration tests for MCP lifecycle, gate enforcement, index extraction
- Phase 7: Final validation sweep
