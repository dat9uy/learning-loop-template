---
title: "Self-Enforcing Loop Architecture: Meta-State as Rule Registry"
description: "Make meta-state.jsonl the rule registry: extend schema with promoted_to_rule, gate reads/enforces active rules, new loop_describe tool with tier-aware reads (hot/warm/cold/summary). Three surgical changes; no new artifact types, no new schemas, no new directories."
status: pending
priority: P2
branch: "main"
tags: [meta, gate, mcp, refactor, tdd, anti-pattern]
blockedBy: []
blocks: []
created: "2026-06-01T20:44:48.709Z"
createdBy: "ck:plan"
source: skill
---

# Self-Enforcing Loop Architecture: Meta-State as Rule Registry

## Overview

Implements the architecture in `plans/reports/brainstorm-260602-self-enforcing-loop-architecture.md` (which supersedes rejected `brainstorm-260601-meta-taxonomy-redesign.md` and superseded `brainstorm-260602-agent-docs-plans-default-pattern.md`).

**Core shift:** rules become state (in `meta-state.jsonl` with `promoted_to_rule` field), not content (no new schemas, no new YAML, no new philosophy text). Gate reads promoted rules and enforces them. Agent discovers the loop's surface via a new `loop_describe` MCP tool with tiered reads to prevent context bloat.

**Three surgical changes + migration:**
1. Extend `meta-state-report-tool.js` zod schema: `loop-anti-pattern` category, `subtype`, `promoted_to_rule`
2. Add `loadPromotedRules` + `applyPromotedRules` to `core/gate-logic.js`; wire into gate pipeline
3. Create `tools/loop-describe-tool.js` MCP tool with tier-aware reads
4. Migrate `meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal` to first active rule

**Surface:** `meta` (changes to the loop's own machinery, not `product/**`).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Schema Extension](./phase-01-schema-extension.md) | Pending |
| 2 | [Gate Reads Promoted Rules](./phase-02-gate-reads-promoted-rules.md) | Pending |
| 3 | [New loop_describe Tool](./phase-03-new-loop-describe-tool.md) | Pending |
| 4 | [Migration and Validation](./phase-04-migration-and-validation.md) | Pending |

## Cross-Plan Dependencies

| Relationship | Plan | Status |
|---|---|---|
| Builds on | `260527-meta-state-registry` | completed |
| Builds on | `260520-write-gate-observation-unification` | completed |
| Replaces design from | `260601-meta-1to1-artifact-cleanup` | completed |

## Resolved Decisions (from brainstorm)

1. **Category:** `loop-anti-pattern` (single category) with `subtype` (escape-hatch-abuse, new-artifact-type, schema-bloat)
2. **Promotion:** Hybrid — auto-suggest after 2+ occurrences, operator approves
3. **Pattern syntax:** Regex for commands, glob for paths
4. **loop_describe injection:** Manual call; tool description recommends at session start
5. **Ack lifecycle:** Standard meta-state lifecycle (reported → active → resolved)
6. **96 meta index entries:** Stay dormant; one-by-one curation is operator work
7. **Tool descriptions:** Module `description` field, not manifest
8. **meta_state_list relationship:** Complementary; `loop_describe` composes with it

## Context Tiering

| Tier | Returns | Size | When |
|---|---|---|---|
| hot | active promoted rules | ~5KB | gate; "is X safe?" |
| warm | + active findings + surface | 10-25KB | "what is the loop?" (default) |
| cold | full history | 25-100KB | audit only |
| summary | counts only | <1KB | pre-flight |

`loop_describe({ tier })` exposes the tier parameter. Agent picks from task; operator can override.

## Source Documents

- `plans/reports/brainstorm-260602-self-enforcing-loop-architecture.md` (design)
- `docs/philosophy.md` (loop philosophy)
- `docs/observation-vs-meta-state.md` (layer separation)
- `tools/learning-loop-mcp/core/meta-state.js` (registry primitives)
- `tools/learning-loop-mcp/core/gate-logic.js` (constraint patterns)
- `meta-state.jsonl` (existing entries; first rule will be promoted from `meta-260602T0000Z-...`)

## Success Criteria (Whole-Plan)

- [ ] `loop-anti-pattern` category accepted by `meta_state_report`
- [ ] Gate enforces active promoted rules (regex + glob)
- [ ] `loop_describe` tool returns 4 tiers correctly
- [ ] First anti-pattern rule promoted and demonstrably enforced
- [ ] `pnpm test` passes
- [ ] `pnpm validate:records` passes
- [ ] No regression in existing constraint patterns
- [ ] All 4 phase regression gates pass

## Red Team Review

### Session — 2026-06-02
**Findings:** 15 (15 accepted, 0 rejected)
**Severity breakdown:** 0 Critical, 8 High, 7 Medium
**Method:** Three-lens consolidated review (Security Adversary + Failure Mode Analyst + Assumption Destroyer)
**Report:** `reports/from-code-reviewer-to-planner-red-team-three-lens-consolidated-plan-review-report.md`

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Operator Impersonation — agent can promote own rules via `meta_state_report` | High | Accept | Phase 1, Phase 2, Phase 4 |
| 2 | `meta-state.jsonl` not protected by write gate | High | Accept | Phase 2 |
| 3 | Regex DoS via catastrophic backtracking | Medium | Accept | Phase 2 |
| 4 | Module Import Attack Surface — single bad module crashes `loop_describe` | Medium | Accept | Phase 3 |
| 5 | Path Traversal in Glob Patterns | Medium | Accept | Phase 2 |
| 6 | mtime Granularity Race — 1s granularity causes stale cache | High | Accept | Phase 2 |
| 7 | No Circuit Breaker for False-Positive Rule | High | Accept | Phase 2, Phase 4 |
| 8 | Migration Script Atomicity Gap | High | Accept | Phase 4 |
| 9 | TDD Test Environment Pollution Risk | Medium | Accept | Phase 4 |
| 10 | Tier Escalation Failure Has No Fallback | Medium | Accept | Phase 3 |
| 11 | Schema Parity Test Is Conceptually Wrong (move to `core/meta-state.js`) | High | Accept | Phase 1 |
| 12 | Backward Compat with Existing Entries (migrate all 10, not just 1) | High | Accept | Phase 3, Phase 4 |
| 13 | Auto-Resolve Interacts with `promoted_to_rule` | Medium | Accept | Phase 4 |
| 14 | Agent Tier Meta-Cognition Not in Prompt | Medium | Accept | Phase 3 |
| 15 | Operator Review Workflow Missing (no `preview: true`) | Medium | Accept | Phase 2, Phase 4 |

### Net Plan Changes From Red Team

**New components:**
- `meta_state_promote_rule` tool (operator-only role, supports `preview: true`)
- `meta_state_preview_rule` tool (returns `{ pattern, sample_matches }` without activating)
- `version` field on meta-state entries (compare-and-swap)
- `status: "disabled"` mechanism for runaway rules
- Bash gate PATH_WRITE_PATTERNS extended to include `meta-state.jsonl`
- Glob scope whitelist in `applyPromotedRules`
- `safe-regex` complexity check + 50ms timeout in regex matching
- Per-import try/catch + 1s timeout + circuit breaker in `loop_describe`
- `degraded: true` flag in `loop_describe` responses
- Legacy category fallback in `loop_describe`
- Documentation updates to `CLAUDE.md` and `AGENTS.md`

**Migrated entries:** All 10 existing anti-pattern entries, not just the one.

**Test count changes:** Phase 1 (12 unchanged), Phase 2 (16 → 19 with circuit breaker, glob scope, regex complexity), Phase 3 (14 → 17 with degraded, legacy fallback, circuit breaker), Phase 4 (8 → 12 with CAS, all 10 entries, GATE_ROOT assertion, recovery flow).

### Whole-Plan Consistency Sweep

After applying findings, re-read all plan files. No contradictions found:

- All 4 phases reference the same shared `metaStateEntrySchema` in `core/meta-state.js` (RT Finding 11).
- All phases use the same `meta_state_promote_rule` tool for rule activation (RT Finding 1).
- All phases reference the same `version` field CAS pattern (RT Finding 8).
- All phases reference the same `meta-state.jsonl` bash gate protection (RT Finding 2).
- All phases use the same `status: "disabled"` recovery flow (RT Finding 7).
- Phase 3's documentation update and Phase 4's legacy fallback are consistent (RT Findings 12, 14).
- `loop_describe` references the new schema consistently across Phase 3 and Phase 4.
- No stale references to `promoted_to_rule` in `meta_state_report` (RT Finding 1 applied).
- No stale references to `record-writer.js` for meta-state schema (RT Finding 11 applied).

**Sweep result:** Zero unresolved contradictions. Plan is ready for cook.
