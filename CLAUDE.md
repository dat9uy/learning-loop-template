# CLAUDE.md — Learning Loop Template

## Skill Coordination

This repo uses a coordination system for external skills. The system has three
PreToolUse hooks and one MCP server:

- **Bash gate** (`.claude/coordination/hooks/bash-coordination-gate.cjs`) —
  blocks Bash commands that match constraint patterns without active observations
  or with exhausted budgets.
- **Write gate** (`.claude/coordination/hooks/write-coordination-gate.cjs`) —
  blocks file writes based on domain rules (`schemas/**` and
  `records/observations/**` blocked; `docs/**`, `plans/**`, `product/**`,
  `tools/**` allowed).
- **Inbound gate** (`.claude/coordination/hooks/inbound-state-gate.cjs`) —
  warns when operator state-change messages may have stale observations.
- **MCP server** (`tools/constraint-gate/server.js`) — provides `check_gate`
  and `record_observation` tools for agent-driven constraint checks.

Skills can be invoked directly. There is no skill registry, no profile-based
gating, and no coordinator workflow. The bash gate and write gate enforce
safety mechanically.
