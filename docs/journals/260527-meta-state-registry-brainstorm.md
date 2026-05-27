---
date: "2026-05-27T16:30:00Z"
tags: [brainstorm, meta-state, observation-taxonomy, mcp, learning-loop]
---

# Meta-State Registry Brainstorm

## What we discussed

The user flagged a core tension in the observation system: `records/observations/` conflates external state (vendor APIs, device slots, budgets) with meta-level findings (gate logic bugs, record repair traps, schema gaps). `philosophy.md` says observations are "the authoritative source for external facts" — but the system has no canonical home for findings about itself.

## What we decided

1. **Dual-track taxonomy** — keep external observations in `records/observations/` unchanged; create a new **meta-state registry** at `tools/learning-loop-mcp/meta-state.jsonl`
2. **Meta-state is MCP-native, not YAML** — agent-discovered, agent-maintained, operator-acknowledged; no gate interaction; no external state semantics
3. **State machine** — `reported` → `active` (via ack) → `auto-resolved`/`expired`; 24h TTL on un-acked entries
4. **Four MCP tools** — `meta_state_report`, `meta_state_list`, `meta_state_ack`, `meta_state_resolve`
5. **Scoped budget escalation** — deferred to a future discussion about external observations; not part of this design

## What we rejected

- Extending external observation schema with `meta-observation` type — breaks `philosophy.md` boundary
- Journal-only — not machine-queryable, violates trajectory gradient
- Budget/constraint terminology in meta-state — meta-level is a state machine, not a resource limit

## Design artifact

`plans/reports/brainstorm-260527-meta-state-registry.md` — full report with requirements, evaluated approaches, entry format, state machine, MCP tool specs, implementation file list, risks, and success metrics.

## Open items

- Implementation plan: deferred to future `/ck:plan` session
- Scoped budget escalation in `gate-logic.js`: separate future discussion
- External observation taxonomy (budgets vs flags vs findings): separate future discussion
