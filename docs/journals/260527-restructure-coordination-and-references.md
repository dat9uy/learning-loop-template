---
date: "2026-05-27T00:00:00Z"
tags: [brainstorm, architecture, mcp, project-organization]
---

# Restructure Coordination Gate & Co-locate References

Brainstormed two structural issues with /ck:brainstorm:

1. `.claude/skills/learning-loop/references/` and `evals/` describe system rules the MCP server enforces, but live in a Claude-specific path. `.factory/skills/learning-loop/` only has `SKILL.md` — the referenced files do not exist there. Active inconsistency.

2. `tools/coordination-gate/mcp/` is unnecessarily nested. `mcp/tools/*.js` imports core via `../../core/` and shared libs via `../../../lib/`. Server name "coordination-gate" does not match repo brand.

Agreed on **Approach C — Full Restructure**:
- Rename `tools/coordination-gate/` → `tools/learning-loop-mcp/`
- Flatten `mcp/` contents to top level (server.js, tools/, lib/)
- Co-locate `references/` and `evals/` inside the new directory
- Update both skill files to point to new paths
- Rename server name to `"learning-loop-mcp"`
- **Add Node.js subpath imports** (`"imports"` in `package.json`) to eliminate `../../` entirely — `#mcp/core/`, `#lib/`, etc.

Report written: `plans/reports/brainstorm-260527-restructure-coordination-and-references.md`

Implementation planning deferred to later session.
