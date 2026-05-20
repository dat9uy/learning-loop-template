---
capability: meta
date: "2026-05-20"
type: journal
scope: planning
---

# Meta-Process Skill Template Fix — Planning Session

## Context

During meta-workflow testing of `260520-2101-fundamental-capability-productization`, four structural gaps surfaced in the learning-loop skill templates and operator-guide.

## Gaps Identified

1. **Memory dependence** — Planner used injected CLAUDE memory (`feedback_vnstock_safe_import.md`) to replicate gate pattern instead of querying `records/index/`.
2. **Domain overfit** — `docs/operator-guide.md` embedded vnstock-specific examples (bootstrap command, device slot budget, gate pattern) with no generic template.
3. **Unencoded decisions** — Plan-level choices (DataFrameEnvelope, gate naming, client-side fetching) lived in prose, not `records/decisions/` artifacts.
4. **Evidence authority violation** — Phase 5 instructed agent-authored evidence creation without operator confirmation, violating `docs/record-system-architecture.md` and `docs/philosophy.md`.

## Consensus Approach

Brainstorm produced two approaches (comprehensive reset vs incremental patch). Chose hybrid:
- **Hard fixes** (A1, A2, A3): memory prohibition + deletion, operator-guide split into generic + vnstock appendix, product-build blueprint update with decision-record requirement and operator-only evidence protocol.
- **Soft capture** (B4): light meta-evidence note documenting gaps; do not flag fundamental plan as failed.

## Plan Created

`plans/260520-2133-meta-process-skill-template-fix/`
- Phase 1: Research and boundary mapping
- Phase 2: Memory prohibition + settings.json disable
- Phase 3: Operator-guide domain split
- Phase 4: Product-build blueprint update
- Phase 5: Meta-evidence + validation

## Validation Interview Findings

Three additional issues surfaced during `/ck:plan validate`:
1. **Write gate blocks meta-evidence** — `records/evidence/**` is blocked. Patched Phase 5 with operator-approval stop before evidence creation.
2. **Global memory injection persists** — Deleting project memory does not stop `~/.claude/CLAUDE.md` from injecting memory. Patched Phase 2 with `.claude/settings.json` disable.
3. **Operator-guide reference drift** — 10+ plans cite specific operator-guide sections that will move. Patched Phase 1 with grep-and-update step.

## Outcome

Plan updated, zero unresolved contradictions. User elected to review plan before cooking.
