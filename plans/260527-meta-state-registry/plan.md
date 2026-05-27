---
title: "Meta-State Registry for Learning Loop Self-Awareness"
description: "Agent-maintained meta-state registry separate from external observations, capturing system-level findings across sessions"
status: pending
priority: P1
branch: "main"
tags: [meta-state, mcp, learning-loop, registry, self-awareness]
blockedBy: []
blocks: []
created: "2026-05-27T18:51:00Z"
createdBy: "ck:plan"
source: skill
---

# Meta-State Registry for Learning Loop Self-Awareness

## Overview

Build a lightweight JSONL-based meta-state registry at `tools/learning-loop-mcp/meta-state.jsonl` with 4 MCP tools (`meta_state_report`, `meta_state_list`, `meta_state_ack`, `meta_state_resolve`). The registry captures agent-discovered system-level findings (gate logic bugs, record repair traps, schema drift) that currently have no durable, machine-readable home. Entries auto-resolve when referenced files change and expire after 24h if un-acked. The registry is completely separate from `records/observations/` (external state, operator-managed, gate-enforced).

## Background

Per `plans/reports/brainstorm-260527-meta-state-registry.md`, the current system conflates two concerns:
1. **External state** — vendor APIs, device slots, budgets. Lives in `records/observations/`. Operator-managed.
2. **Meta-level findings** — gate logic bugs, schema gaps, stale refs. Currently only in journal entries (narrative, not machine-queryable).

Agents rediscover the same system bugs across sessions because there is no canonical registry of known issues. This plan implements Approach C from the brainstorm: an MCP-native JSONL registry with TTL and auto-resolve.

## Key Design Decisions

1. **JSONL, not YAML** — Compact, agent-friendly, no schema overhead for ephemeral state.
2. **No gate interaction** — Meta-state does not feed the gate. Avoids circularity (gate reading bugs in itself).
3. **24h TTL on un-acked entries** — Prevents false-positive pollution. Operator `ack` removes TTL.
4. **Auto-resolve by file mtime** — Entry tracks `file_modified` path; if mtime changes, entry transitions to `auto-resolved`.
5. **Atomic append** — Write to temp + rename (pattern already used in `gate-logic.js` for preflight markers).
6. **Separate from `records/`** — Meta-state is ephemeral agent-maintained findings, not durable verified knowledge.

## Phases

| Phase | Name | Status | Effort | Dependencies |
|-------|------|--------|--------|--------------|
| 1 | [Registry Core](./phase-01-registry-core.md) | Pending | 3h | — |
| 2 | [Tool Registration](./phase-02-tool-registration.md) | Pending | 2h | 1 |
| 3 | [Tests](./phase-03-tests.md) | Pending | 2h | 1 |
| 4 | [Integration Verification](./phase-04-integration-verification.md) | Pending | 1h | 1–3 |

## Dependencies

### Cross-Plan
- `260527-workflow-coordination-integration` (in progress) — Touching same MCP server, same `tools/manifest.json`. No direct file overlap, but both add tool entries to manifest and agent-manifest.json.
- `260527-restructure-coordination-and-references` (in progress) — May move core modules. This plan uses `#mcp/core/` path alias.

### Internal
- Phase 1 must complete before Phases 2 and 3 (core module is imported by tools and tested).
- Phases 2 and 3 can run in parallel after Phase 1.
- Phase 4 depends on all previous phases.
