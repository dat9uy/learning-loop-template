---
date: 2026-05-20
type: architectural-planning
tags: [coordination, learning-loop, model-collapse, red-team, planning]
severity: high
status: deferred-pending-user-review
---

# 260520 — Coordination Model Collapse: Planning Complete

## What Happened

Docs-only `/ck:cook` on Plan 4 (`docs-canonicalization-machine-extracted-index`) got blocked by `skill-coordination-gate.cjs` (`skill-coordination-gate.cjs:48-71`). Zero runtime risk, zero irreversible change — pure markdown edits — yet the gate fired because `cook` is in `skill-registry.json` and every registered skill is unconditionally blocked. User rejected `.bypass-next`. This was not a one-off; the gate logic itself is wrong for this work class.

Deep analysis then found the real disease: two contradictory risk models living in the same system.

- **Model A (profile-based):** `skill-registry.json` + `coordination-config.json` + `active-profile` + `.bypass-next`. Coarse skill-name gating. Assumes all plans are state-changing. No plan-awareness.
- **Model B (observation-based):** `write-coordination-gate.cjs` inspects actual file paths, applies `write_allowlist`/`write_forbidlist` per profile, checks domain. Precise but only runs *after* a skill emits a write request.

Model A blocks before work starts. Model B audits after. They fight: A blocks docs-only work that B would have allowed; A's `.bypass-next` lets through work B would have blocked. The system is schizophrenic.

## Root Cause

Skill-name gating (Model A) is a failed abstraction. Risk lives in *what* changes, not *which* skill changes it. `cook` on docs is safe; `cook` on records is not. The skill name carries zero risk signal. Model B already knows this — it inspects paths. Model A does not.

`.bypass-next` is a self-harm mechanism: it trains operators to disable the very system meant to protect them, and it bypasses both A and B, not just A.

`active-profile` is stateful indirection that adds fragility: a stale profile allows wrong writes.

## Plan

Collapse Model A into Model B. Six phases:

1. **Analysis & Design** — finalize domain taxonomy, file-to-domain map, gate interaction matrix.
2. **Remove skill gate + registry** — delete `skill-coordination-gate.cjs`, `skill-registry.json`, `active-profile`, `.bypass-next`. Update `CLAUDE.md` to remove coordination fallback instructions.
3. **Make write gate domain-aware** — `write-coordination-gate.cjs` reads plan frontmatter `tags`, resolves plan type → domain → profile. No stateful profile. No skill-name gating.
4. **Consolidate bash + MCP gates** — apply same domain rules to bash and MCP tool calls.
5. **Update docs + tests** — rewrite coordination docs, add negative tests for deleted paths, add positive tests for domain-aware dispatch.
6. **Validate + migrate** — whole-plan consistency sweep, run against Plan 4 to confirm docs-only cook passes.

## Red Team Impact

15 findings (3 Critical, 5 High, 7 Medium). All accepted.

Critical finding: deleting `skill-coordination-gate.cjs` and `skill-registry.json` in Phase 2 would leave the bash gate (`bash-coordination-gate.cjs`) as a no-op because it reads `skill-registry.json` to know which commands to intercept. Delete config before guard → guard blind.

Plan corrected: bash gate fix moved from Phase 4 to Phase 2. Hardcoded critical command list added to bash gate so it no longer depends on registry. Observation-integrity rule added: any gate that needs state must verify the state file exists before trusting it. Docs list expanded to cover the corrected sequence.

Whole-plan consistency sweep after correction: zero unresolved contradictions.

## Decision

User deferred implementation. Session ended. Plan 5 (`260520-0157-coordination-model-collapse`) ready for review. Plan 4 remains blocked until this lands — it is the first test case.

## Next Steps

- User reviews 6-phase plan.
- When approved, execute Phase 1–6 in order.
- After Phase 6, re-run `/ck:cook --auto` on Plan 4 to verify docs-only path is unblocked.
- If any red team finding re-emerges during implementation, stop and re-audit.
