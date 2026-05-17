---
title: "Constraint Gate MCP Server"
description: "Build MCP server with check_gate and record_observation tools, expand hook to gate Edit/Write/Bash, enforce coordination constraints mechanically."
status: pending
priority: P1
effort: 6h
branch: "main"
tags: [infra, mcp, enforcement, hooks]
blockedBy: [260517-1400-post-validation-gap-closure]
blocks: []
created: "2026-05-17"
createdBy: "ck:plan"
source: skill
---

# Constraint Gate MCP Server

## Overview

Build a constraint gate MCP server that enforces "observe before workaround" for constraint discovery. The server exposes `check_gate` and `record_observation` tools. The existing hook expands from gating only `Skill` calls to also gating `Edit`, `Write`, and `Bash` calls. The hook does synchronous file-based checks; the MCP server provides the same gate logic as an agent-callable tool.

**Why:** Agent encounters constraints (Docker stale mounts, device limits, sudo requirements) and attempts workarounds before documenting. Advisory rules fail under task-completion pressure. Mechanical enforcement via hooks + MCP server removes the choice.

## Architecture

```
Main Agent                    Hook (PreToolUse)           MCP Server
    │                             │                          │
    ├─ Bash("docker run ...") ──►│                          │
    │                            ├─ pattern match ──────────┤
    │                            ├─ read observations ──────┤
    │                            ├─ read coordination ──────┤
    │                            │◄─ { block } ─────────────┤
    │◄─ hook blocks bash ───────┤                          │
    │                             │                          │
    ├─ MCP: record_observation ─────────────────────────────►│
    │◄─ { recorded } ───────────────────────────────────────┤
    │                             │                          │
    ├─ Bash("docker run ...") ──►│                          │
    │                            ├─ pattern match ──────────┤
    │                            ├─ read observations ──────┤
    │◄─ hook allows bash ───────┤                          │
```

Hook = synchronous enforcement (blocks bad calls). MCP server = proactive tool (agent calls `check_gate` before acting, calls `record_observation` to document).

## Phases

| Phase | Name | Status | Priority | Effort |
|-------|------|--------|----------|--------|
| 1 | [MCP Server Foundation](./phase-01-mcp-server-foundation.md) | Pending | P1 | 2h |
| 2 | [Observation Recording](./phase-02-observation-recording.md) | Pending | P1 | 1h |
| 3 | [Hook Expansion](./phase-03-hook-expansion.md) | Pending | P1 | 1.5h |
| 4 | [Integration & Config](./phase-04-integration-config.md) | Pending | P2 | 30m |
| 5 | [Schema Documentation](./phase-05-schema-documentation.md) | Pending | P3 | 30m |

## Dependencies

- Phase 1: no dependencies (MCP server foundation)
- Phase 2: depends on Phase 1 (adds tool to server created in Phase 1)
- Phase 3: depends on Phase 1 (hook reads same files MCP server reads)
- Phase 4: depends on Phase 1+3 (register MCP server, wire hook)
- Phase 5: independent (schema docs only)
- External: `260517-1400-post-validation-gap-closure` creates cleanup script that the gate should enforce

## Implementation Note

**Call `/ck:agentize` during implementation** to properly package the constraint gate as an agent-friendly CLI/MCP server (npm packaging, stdio transport, credential resolution, docs, tests, companion skill).

## Key Constraints

- Hook must be synchronous (no MCP calls from hook — file-based checks only)
- MCP server stateless between calls (reads files each time)
- Budget checking: extract pure function from check-budget.js, reuse in both ESM (MCP) and CJS (hook via spawnSync)
- Existing observation YAML files read, not modified
- Fail-open on missing/corrupt files (match existing hook pattern)
- Decision vocabulary: `ok`, `block`, `escalate` (canonical set, shared across MCP and hooks)
- Constraint pattern matching: word-boundary regex unified across all phases
- Profile selection: default to most restrictive profile, override via state file or env var
- CJS/ESM boundary: `gate-utils.cjs` is single source of truth for patterns; MCP server imports via `createRequire`

## Red Team Review

### Session — 2026-05-17
**Findings:** 19 unique (after dedup from 29 across 3 reviewers)
**Disposition:** 16 accepted, 3 rejected
**Severity breakdown:** 5 Critical, 7 High, 7 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Gate decision vocab mismatch (blocked vs block) | Critical | Accept | Phase 1, Phase 3 |
| 2 | record_observation params don't match observation schema | Critical | Accept | Phase 2 |
| 3 | Constraint pattern-to-observation matching unspecified | Critical | Accept | Phase 1, Phase 2 |
| 4 | CJS hooks cannot require() ESM check-budget.js | Critical | Accept | Phase 1, Phase 3 |
| 5 | No profile determination mechanism for hooks | Critical | Accept | Phase 3 |
| 6 | "Separate hooks" rationale undermined by shared library | Medium | Reject | — |
| 7 | CLAUDE_PROJECT_DIR path resolution unverified | Medium | Accept | Phase 1, Phase 4 |
| 8 | No path traversal protection on observation writes | High | Accept | Phase 2 |
| 9 | Gate log write corrupts pure gate-logic function | Medium | Accept | Phase 4 |
| 10 | Phase 1-2 dependency claim is false | High | Accept | plan.md |
| 11 | check-budget.js can't be called internally as library | High | Accept | Phase 1 |
| 12 | Constraint pattern matching contradicts between phases | High | Accept | Phase 1, Phase 3 |
| 13 | pnpm validate:records doesn't validate observations | High | Accept | Phase 2 |
| 14 | resource-budget doesn't extend observation schema | High | Accept | Phase 5 |
| 15 | Phase 4 `claude mcp add` assumes CLI | Medium | Accept | Phase 4 |
| 16 | gate-utils.cjs duplication with file-readers.js | Medium | Accept | Phase 1, Phase 3 |
| 17 | check-budget.js exit codes not mapped to decisions | High | Accept | Phase 1 |
| 18 | Hook ordering with global hooks unspecified | Medium | Accept | Phase 3 |
| 19 | MCP check_gate redundant with hook | Medium | Reject | — |
| 20 | Observation YAML duplicate keys crash parser | Critical | Accept | Phase 1 |
| 21 | Phase 2 duplicate detection ambiguous | High | Accept | Phase 2 |
| 22 | MCP check_gate interface mismatches hook | Medium | Accept | Phase 1 |
| 23 | Gate log has no reader/consumer | Medium | Reject | — |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01 through phase-05
- Decision deltas checked: 16 accepted findings
- Reconciled stale references: 1 (architecture diagram "blocked" → "block")
- Unresolved contradictions: 0

Checks performed:
- Decision vocabulary (`ok`/`block`/`escalate`): consistent across all phases
- Phase dependencies: Phase 2→[1], Phase 3→[1], Phase 4→[1,3], Phase 5 independent
- Word-boundary regex: defined in Phase 1, referenced in Phase 3, same patterns
- Budget reading: YAML direct read in both Phase 1 (MCP) and Phase 3 (hook), no spawn
- `constraint_type` field: referenced in Phases 1, 2, 3, 5 — consistent
- Profile selection: Phase 3 defines `.active-profile` state file mechanism
- Duplicate YAML keys: `uniqueKeys: false` in Phase 1 and Phase 3
- Path traversal: Phase 2 has `path.basename` + resolved path check
- Logging: Phase 4 puts it in server.js, NOT in gate-logic.js (pure)
- Root resolution: Phase 1 uses `import.meta.url`, not env vars
- Schema inheritance: Phase 5 correctly documents independent schemas (no inheritance claim)
