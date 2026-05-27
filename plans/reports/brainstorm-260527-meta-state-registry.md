---
title: "Meta-State Registry for Learning Loop Self-Awareness"
description: "Brainstorm report: agent-maintained meta-state registry separate from external observations, capturing system-level findings across sessions"
status: agreed
priority: P1
tags: [brainstorm, meta-state, observation-taxonomy, mcp, learning-loop]
created: "2026-05-27T00:00:00Z"
createdBy: "ck:brainstorm"
---

# Meta-State Registry for Learning Loop Self-Awareness

## Problem Statement

The current observation system (`records/observations/*.yaml`) conflates two distinct concerns:

1. **External state** — vendor API status, device slots, cleanup requirements. Operator-managed. Gate-enforced.
2. **Meta-level findings** — gate logic bugs, record repair traps, schema gaps. Agent-discovered. No canonical home.

`philosophy.md` states observations are "the authoritative source for external facts." This is correct for external state but leaves meta-level findings with no durable, machine-readable location. Journal entries (e.g., Part 4 in `260527-workflow-coordination-integration.md`) capture meta-level findings, but journals are narrative, not machine-queryable.

The result: agents rediscover the same system bugs across sessions because there is no machine-readable registry of known issues.

## Requirements

| Requirement | Detail |
|-------------|--------|
| **Expected output** | Lightweight JSONL registry at `tools/learning-loop-mcp/meta-state.jsonl` plus 4 MCP tools (`meta_state_report`, `meta_state_list`, `meta_state_ack`, `meta_state_resolve`). |
| **Acceptance criteria** | Agent can report a finding → query it in next session → see auto-resolve when code changes. No gate interaction. No YAML schema. 24h TTL on un-acked entries. |
| **Scope boundary** | Does NOT modify `records/observations/` schema, gate logic, bash gate, write gate, or external observation behavior. Pure additive feature. |
| **Non-negotiable constraints** | Must live outside `records/` (ephemeral, not verified knowledge). Must be surface-universal (not `.factory/` or `.claude/` specific). Must not gate commands. |
| **Touchpoints** | `tools/learning-loop-mcp/server.js` (tool registration). `tools/learning-loop-mcp/tools/` (new tool files). `tools/learning-loop-mcp/core/` (maybe a lightweight reader). `agent-manifest.json` (new tool group). |

## Scout Findings

- 9 observation files in `records/observations/` — mix of budgets, constraint flags, behavior findings, compound state
- `gate-logic.js` `makeGateDecision` (line 115) conflates all budget exhaustion into global escalation, regardless of command type
- `bash-gate.js` scans ALL budgets globally; first exhausted budget wins
- `budget-checker.js` `runCheckBudget` is strictly for external system/resource lookup
- MCP server (`server.js`) loads tools from `tools/manifest.json`; adding 4 new tools is mechanical
- `agent-manifest.json` has 6 tool groups; new group `meta_state` fits naturally
- Existing meta-level findings in journals: record repair trap (Part 4), budget UX gap (Part 2), stale ref issues (Part 3)

## Evaluated Approaches

### Approach A: Extend External Observations

Add `meta-observation` type to existing `records/observations/*.yaml` schema.

**Pros:**
- Single system, single schema
- Gate could theoretically read meta-observations

**Cons:**
- Breaks `philosophy.md` — observations are "external facts," meta-level is internal
- Gate reading meta-observations creates circularity (gate enforces based on bugs in itself)
- YAML overhead for ephemeral agent-reported state
- Write gate blocks `records/observations/**` — agent can't self-report

**Verdict:** REJECTED. Conflates two concerns that need different ownership, lifecycle, and semantics.

### Approach B: Journal-Only (Status Quo)

Keep meta-level findings in `docs/journals/` only. No new infrastructure.

**Pros:**
- Zero code changes
- Human-readable

**Cons:**
- Not machine-queryable — agent must `Read` entire journal files
- No structured fields (category, severity, affected_system)
- No auto-resolve or TTL
- Journals are escape hatch per `philosophy.md` — this would encode procedural knowledge in docs

**Verdict:** REJECTED. Per `trajectory.md`, the gradient moves knowledge FROM docs INTO loop mechanics. Journal-only is a regression.

### Approach C: MCP-Native Meta-State Registry (Chosen)

Lightweight JSONL at `tools/learning-loop-mcp/meta-state.jsonl`. 4 MCP tools. No gate interaction.

**Pros:**
- Agent-first: compact JSONL, one line per entry
- Machine-queryable: `meta_state_list` returns structured entries
- Auto-resolve: file modification triggers status change
- TTL: 24h on un-acked entries prevents false-positive pollution
- Universal: lives in `tools/learning-loop-mcp/`, not surface-specific
- No gate circularity: gate does not read meta-state
- Preserves `records/observations/` unchanged

**Cons:**
- New infrastructure (4 tools, 1 file, 1 core module)
- Agent can create entries — risk of false positives (mitigated by TTL)

**Verdict:** ACCEPTED.

## Design: Meta-State Registry

### Location

`tools/learning-loop-mcp/meta-state.jsonl` — append-only JSONL, one JSON object per line.

Why not `records/`? `records/` is for durable, verified, operator-managed knowledge per `philosophy.md`. Meta-state is ephemeral, agent-maintained findings.

Why not `.factory/` or `.claude/`? Meta-state is surface-universal. Both Claude and Droid agents need to read/write it.

### State Machine

```
reported → active → [auto-resolved | expired]
         ↑
      operator ack
```

| State | Meaning | Transition |
|---|---|---|
| `reported` | Agent created entry | `meta_state_ack` → `active`; 24h pass → `expired`; auto-resolve condition met → `auto-resolved` |
| `active` | Operator acknowledged, no TTL | `meta_state_resolve` → `resolved` |
| `auto-resolved` | File modified or test passed | Terminal |
| `expired` | 24h passed without ack | Terminal |

### Entry Format

```json
{
  "id": "meta-{YYMMDD}T{HHmm}Z-{slug}",
  "category": "gate-logic-bug | record-repair-gap | schema-drift | stale-ref | mcp-tool-missing",
  "severity": "warning | escalate",
  "affected_system": "gate-logic | record-validation | index-extractor | mcp-tools | workflow-registry",
  "description": "Human-readable summary",
  "evidence": {
    "journal": "docs/journals/...md",
    "code_ref": "path/to/file.js:line",
    "test": "test-file.test.js#L42"
  },
  "auto_resolve": {
    "file_modified": "path/to/file.js",
    "line_range": [start, end]
  },
  "status": "reported | active | auto-resolved | expired",
  "created_at": "2026-05-27T14:30:00Z",
  "expires_at": "2026-05-28T14:30:00Z",
  "acked_at": null,
  "resolved_at": null,
  "resolved_by": null
}
```

### MCP Tools

| Tool | Purpose | Authorship |
|---|---|---|
| `meta_state_report` | Create entry. Status: `reported`. 24h TTL. | Agent |
| `meta_state_list` | Query active entries. Filter by category/status/affected_system. | Agent or operator |
| `meta_state_ack` | Promote `reported` → `active` (removes TTL). | Operator |
| `meta_state_resolve` | Mark entry resolved. | Operator or auto-resolve |

### How Sessions Use It

1. **Agent starts session** → `meta_state_list` → sees active entries
2. **"gate-logic-bug active on line 115"** → agent avoids that pattern or proposes fix
3. **Agent fixes** → file modified → next session sees entry `auto-resolved`
4. **Important findings** → operator `meta_state_ack` → permanent until resolved

### Boundary: External Observations Unchanged

`records/observations/` stays exactly as-is. Operator-managed. Gate reads it. Meta-state does not interact with the gate. The two systems are completely separate.

## What Meta-State Does NOT Track

- External vendor API state
- Device slot counts
- Resource limits
- Cleanup requirements
- Anything the operator manages in `records/observations/`

Those remain external observations. Meta-state is strictly for findings about the loop itself.

## Implementation Considerations

### Files to Create

| File | Purpose |
|---|---|
| `tools/learning-loop-mcp/core/meta-state.js` | Read/write JSONL, auto-resolve logic, TTL check |
| `tools/learning-loop-mcp/tools/meta-state-report-tool.js` | `meta_state_report` tool |
| `tools/learning-loop-mcp/tools/meta-state-list-tool.js` | `meta_state_list` tool |
| `tools/learning-loop-mcp/tools/meta-state-ack-tool.js` | `meta_state_ack` tool |
| `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js` | `meta_state_resolve` tool |
| `tools/learning-loop-mcp/core/meta-state.test.js` | Unit tests for core logic |

### Files to Modify

| File | Change |
|---|---|
| `tools/learning-loop-mcp/tools/manifest.json` | Add 4 new tool entries |
| `tools/learning-loop-mcp/agent-manifest.json` | Add `meta_state` tool group |
| `tools/learning-loop-mcp/server.js` | No change — auto-loads from manifest |

### Test Coverage

- `meta_state_report` creates valid JSONL entry
- `meta_state_list` filters by category and status
- `meta_state_ack` removes TTL, sets `acked_at`
- `meta_state_resolve` sets `resolved_at`
- TTL expiry: entry transitions `reported` → `expired` after 24h
- Auto-resolve: file modification detection
- Concurrent append safety (file lock or atomic write)

## Risks

| Risk | Mitigation |
|---|---|
| False positives from agent | 24h TTL; un-acked entries expire silently |
| File corruption from concurrent writes | Atomic append (write to temp, rename) |
| JSONL growth without cleanup | Auto-archive expired entries; periodic compaction |
| Agent over-reports | Require `evidence` field with journal + code_ref + test |
| Operator burden from acks | Most entries auto-resolve or expire; only structural issues need ack |

## Success Metrics

- Agent reports a finding in session N → queries it in session N+1 and finds it
- File modification triggers auto-resolve within one session
- Zero entries older than 7 days in active status
- No false positives lasting > 24h without operator ack

## Next Steps

1. Plan implementation: `/ck:plan` for meta-state registry (4 tools + core module + tests)
2. Scoped budget escalation: separate future discussion about external observation gate behavior
3. External observation taxonomy: future discussion about whether budgets/flags/findings need separate schemas

## Cross-References

- `docs/philosophy.md` — observations are external facts; meta-state is loop self-awareness
- `docs/trajectory.md` — gradient moves knowledge from docs into loop mechanics
- `docs/journals/260527-workflow-coordination-integration.md` — Part 2 (Budget UX gap), Part 4 (Record repair trap) are concrete meta-level findings that would live in meta-state
- `tools/learning-loop-mcp/core/gate-logic.js:115` — example of a finding that would be auto-resolved when modified

---

# Appendix A: Records/Meta Artifact Redesign

The meta-state registry does not eliminate `records/meta/` — it redefines its role. The durable governance layer stays, but shrinks.

## What Stays in `records/meta/`

| Directory | Role | Rationale |
|-----------|------|-----------|
| `decisions/` | Loop architecture changes | Operator assertions, not agent findings. Dimension model, parser swap, preflight gate canonization. |
| `risks/` | Structural risks | Risks that do not expire (capability allowlist overreach). |
| `index/` | Durable verified knowledge | Machine-extracted assertions about loop mechanics. **Note: `claims/` is deprecated; `index/` is the correct artifact.** |

## What Retires from `records/meta/`

| Directory | Replacement | Rationale |
|-----------|-------------|-----------|
| `experiments/` | Registry pattern | "Report → observe → auto-resolve" replaces "hypothesis → test → verify" for loop self-awareness. |
| `evidence/` | Registry entry IS the evidence | The registry entry's `evidence` field (`journal`, `code_ref`, `test`) is structured evidence. No separate raw-material markdown needed. |

## Evidence as Temporary Staging Ground

`records/meta/evidence/` is retained as a *temporary* staging ground for raw material feeding a pending decision. Once the decision is recorded, the evidence is superseded.

**Rule:** If no `index/` entry references a meta-evidence file, that evidence is treated as **superseded / unproven**.

This keeps the philosophy intact — "evidence is source, not proof" — without maintaining a permanent meta-evidence corpus.

## Promotion Flow (Explicit, Not Automatic)

```
Agent reports finding → registry (reported)
Operator acks → registry (active)
Operator manually promotes → records/meta/index/*.yaml (durable)
```

Ack means **"I see it"**. Promotion is a **second deliberate action** that says "this is durable verified knowledge."

| Step | Meaning | Actor | Artifact |
|------|---------|-------|----------|
| `meta_state_report` | "I found something" | Agent | Registry entry (`reported`) |
| `meta_state_ack` | "I see it, don't expire it" | Operator | Registry entry (`active`) |
| Manual promotion | "This is durable knowledge" | Operator | `records/meta/index/*.yaml` |

Auto-resolve handles the common case. Only findings that survive scrutiny and operator judgment become durable index entries.
