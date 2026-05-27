---
phase: 4
title: "Config+Docs+Skills Update"
status: pending
priority: P1
effort: "2h"
dependencies: [1, 2, 3]
---

# Phase 4: Config+Docs+Skills Update

## Overview

Update all configuration files, documentation, and skill files that reference the old `coordination-gate` paths. This phase touches `package.json`, `.mcp.json`, `README.md`, `CLAUDE.md`, docs, and the coordination-gate skill files.

## Requirements
- Functional: `package.json` script, `.mcp.json` entrypoint, and skill files point to new paths.
- Functional: Hook wrapper CJS files point to `tools/learning-loop-mcp/hooks/`.
- Non-functional: Historical plans and reports are NOT retroactively edited.

## Architecture

Files to update:
| File | Before | After |
|------|--------|-------|
| `package.json` | `"gate:server": "node tools/coordination-gate/mcp/server.js"` | `"gate:server": "node tools/learning-loop-mcp/server.js"` |
| `.mcp.json` | `{"coordination-gate": {"args": ["tools/coordination-gate/mcp/server.js"]}}` | `{"learning-loop-mcp": {"args": ["tools/learning-loop-mcp/server.js"]}}` |
| `README.md` | `tools/constraint-gate/` + `tools/coordination-gate/` | `tools/learning-loop-mcp/` |
| `CLAUDE.md` | `tools/coordination-gate/` + `tools/coordination-gate/mcp/` | `tools/learning-loop-mcp/` |
| `docs/operator-guide.md` | `write-coordination-gate.cjs` + `bash-coordination-gate.cjs` | keep filenames, update context if needed |
| `docs/system-architecture.md` | `coordination-gate` in diagram | `learning-loop-mcp` |
| `docs/charter.md` | `write-coordination-gate.cjs` | keep filename |
| `.factory/skills/coordination-gate/SKILL.md` | `tools/coordination-gate/mcp/server.js` | `tools/learning-loop-mcp/server.js` |
| `.claude/skills/coordination-gate/SKILL.md` | `tools/coordination-gate/mcp/server.js` | `tools/learning-loop-mcp/server.js` |
| Hook wrappers (`.claude/`, `.factory/`) | `tools/coordination-gate/hooks/` | `tools/learning-loop-mcp/hooks/` |

## Related Code Files
- Modify: `package.json` — script path
- Modify: `.mcp.json` — server name and args
- Modify: `README.md` — lane descriptions and quick commands
- Modify: `CLAUDE.md` — all path references
- Modify: `docs/operator-guide.md` — gate context references
- Modify: `docs/system-architecture.md` — diagram text
- Modify: `.factory/skills/coordination-gate/SKILL.md` — entrypoint path
- Modify: `.claude/skills/coordination-gate/SKILL.md` — entrypoint path
- Modify: `.factory/coordination/hooks/*.cjs` — universal hook path
- Modify: `.claude/coordination/hooks/*.cjs` — universal hook path
- Modify: `.claude/coordination/hooks/lib/gate-utils.cjs` — `patterns.json` hardcoded path (update or schedule deletion)
- Modify: `.claude/coordination/__tests__/*.test.cjs` — hardcoded `tools/coordination-gate/mcp/` paths

## Implementation Steps

1. **Update `package.json`**
   - Change `"gate:server": "node tools/coordination-gate/mcp/server.js"` → `"node tools/learning-loop-mcp/server.js"`

2. **Update `.mcp.json`**
   - Change server key from `"coordination-gate"` → `"learning-loop-mcp"`
   - Change args from `["tools/coordination-gate/mcp/server.js"]` → `["tools/learning-loop-mcp/server.js"]`

3. **Update `README.md`**
   - In Lanes table: `tools/constraint-gate/` → `tools/learning-loop-mcp/`
   - If any quick commands reference `gate:server`, update
   - Constraint Enforcement section: `MCP server` reference updated

4. **Update `CLAUDE.md`**
   - All `tools/coordination-gate/` → `tools/learning-loop-mcp/`
   - All `tools/coordination-gate/mcp/` → `tools/learning-loop-mcp/`
   - Hook wrapper table updated
   - MCP server path updated
   - `agent-manifest.json` path updated

5. **Update docs**
   - `docs/operator-guide.md`: Any mention of `tools/coordination-gate/mcp/agent-manifest.json` → `tools/learning-loop-mcp/agent-manifest.json`
   - `docs/system-architecture.md`: Update ASCII diagram labels
   - `docs/charter.md`: Any tool path references

6. **Update coordination-gate skills**
   - `.factory/skills/coordination-gate/SKILL.md`: `tools/coordination-gate/mcp/server.js` → `tools/learning-loop-mcp/server.js`
   - `.factory/skills/coordination-gate/SKILL.md`: `tools/coordination-gate/mcp/agent-manifest.json` → `tools/learning-loop-mcp/agent-manifest.json`
   - `.claude/skills/coordination-gate/SKILL.md`: same updates

7. **Update hook wrappers**
   - Already covered in Phase 1, but double-check all 6 wrapper files:
     - `.claude/coordination/hooks/bash-coordination-gate.cjs`
     - `.claude/coordination/hooks/write-coordination-gate.cjs`
     - `.claude/coordination/hooks/inbound-state-gate.cjs`
     - `.factory/coordination/hooks/bash-coordination-gate.cjs`
     - `.factory/coordination/hooks/write-coordination-gate.cjs`
     - `.factory/coordination/hooks/inbound-state-gate.cjs`

8. **Update `.claude/coordination/hooks/lib/gate-utils.cjs`**
   - Change `path.join(__dirname, '../../../../tools/coordination-gate/core/patterns.json')` → `path.join(__dirname, '../../../../tools/learning-loop-mcp/core/patterns.json')`
   - Note: `gate-utils.cjs` is dead code in production (thin wrappers now delegate to universal ESM hooks), but is still imported by `.claude/coordination/__tests__/*.test.cjs`. Update its path to avoid test breakage, then schedule deletion in a follow-up cleanup.

9. **Update `.claude/coordination/__tests__/*.test.cjs`**
   - `gate-integration.test.cjs:133`: `tools/coordination-gate/mcp/server.js` → `tools/learning-loop-mcp/server.js`
   - `inbound-state-gate.test.cjs:380`: `tools/coordination-gate/mcp/server.js` → `tools/learning-loop-mcp/server.js`
   - `inbound-state-gate.test.cjs:381`: `tools/coordination-gate/core/inbound-state.js` → `tools/learning-loop-mcp/core/inbound-state.js`
   - `inbound-state-gate.test.cjs:385`: `tools/coordination-gate/mcp/tools/gate-tool.js` → `tools/learning-loop-mcp/tools/gate-tool.js`
   - `bash-coordination-gate.test.cjs`: Any hardcoded `tools/coordination-gate/` paths → `tools/learning-loop-mcp/`
   - `write-coordination-gate.test.cjs`: Same pattern
   - `gate-utils.test.cjs`: Same pattern
   - `integration-test.sh` (if it exists): Remove or update — it references the old `skill-coordination-gate.cjs` hook which was already deleted.

10. **Update `tools/validate-plan-loop/integration.test.js`**
    - Contains `"write-coordination-gate.cjs"` in a test assertion — this is a filename, not a path, so it stays as-is.

## Success Criteria
- [x] `rg "coordination-gate" package.json .mcp.json` returns zero matches
- [x] `rg "tools/coordination-gate" README.md CLAUDE.md docs/` returns zero matches
- [x] `rg "tools/coordination-gate" .factory/skills/coordination-gate/SKILL.md` returns zero matches
- [x] `rg "tools/coordination-gate" .claude/skills/coordination-gate/SKILL.md` returns zero matches
- [x] `node tools/learning-loop-mcp/server.js` starts successfully
- [x] All hook wrappers resolve to existing files

## Risk Assessment
- **Risk:** `.factory/settings.json` and `.claude/settings.json` reference hook files by filename only (not path), so they don't need changes. The wrapper files themselves contain the path.
- **Risk:** `docs/system-architecture.md` may have ASCII art with `coordination-gate` labels — update the text labels but don't over-engineer the art.
- **Risk:** `records/` YAML files reference old paths in their source_refs. Do NOT modify historical records.
- **Mitigation:** Grep inventory for every known config and doc file.
