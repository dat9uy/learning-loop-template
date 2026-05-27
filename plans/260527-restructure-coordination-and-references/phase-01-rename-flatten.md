---
phase: 1
title: "Rename+Flatten"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Rename+Flatten

## Overview

Rename `tools/coordination-gate/` to `tools/learning-loop-mcp/` and flatten the `mcp/` subfolder so its contents (server.js, tool-registry.js, workflow-runner.js, agent-manifest.json, lib/, tools/) sit at the top level. Import paths to `core/` and `lib/` are simplified. Hook wrappers and all consumers are updated.

## Requirements
- Functional: All files move to new paths; no logic changes.
- Non-functional: Import paths in server.js, tool-registry.js, workflow-runner.js, and all tools/*.js updated.

## Architecture

```
BEFORE                          AFTER
tools/coordination-gate/       tools/learning-loop-mcp/
├── core/                       ├── core/          ← unchanged
├── hooks/                      ├── hooks/         ← unchanged
├── mcp/                        ├── server.js      ← was mcp/server.js
│   ├── server.js               ├── tool-registry.js
│   ├── tool-registry.js        ├── workflow-runner.js
│   ├── workflow-runner.js      ├── agent-manifest.json
│   ├── agent-manifest.json     ├── lib/           ← was mcp/lib/
│   ├── lib/                    ├── tools/         ← was mcp/tools/
│   └── tools/                  └── __tests__/     ← unchanged
└── __tests__/
```

## Related Code Files
- Create: `tools/learning-loop-mcp/` (rename via git mv)
- Modify: `tools/learning-loop-mcp/server.js` — update `MANIFEST_PATH`, `name`
- Modify: `tools/learning-loop-mcp/tool-registry.js` — `gate-logging.js` import path
- Modify: `tools/learning-loop-mcp/workflow-runner.js` — if any relative imports (none currently)
- Modify: `tools/learning-loop-mcp/tools/*.js` — update imports to `core/` and `lib/`
- Modify: `tools/learning-loop-mcp/__tests__/*.js` — update import paths
- Modify: `.claude/coordination/hooks/*.cjs` — point to `tools/learning-loop-mcp/hooks/`
- Modify: `.factory/coordination/hooks/*.cjs` — point to `tools/learning-loop-mcp/hooks/`
- Modify: `CLAUDE.md` — update path references
- Delete: `tools/coordination-gate/` (moved)

## Implementation Steps

1. **Git-move the directory**
   - `git mv tools/coordination-gate tools/learning-loop-mcp`
   - Verify: `ls tools/learning-loop-mcp/` shows core/, hooks/, mcp/, __tests__/

2. **Flatten `mcp/` contents**
   - `git mv tools/learning-loop-mcp/mcp/server.js tools/learning-loop-mcp/server.js`
   - `git mv tools/learning-loop-mcp/mcp/tool-registry.js tools/learning-loop-mcp/tool-registry.js`
   - `git mv tools/learning-loop-mcp/mcp/workflow-runner.js tools/learning-loop-mcp/workflow-runner.js`
   - `git mv tools/learning-loop-mcp/mcp/agent-manifest.json tools/learning-loop-mcp/agent-manifest.json`
   - `git mv tools/learning-loop-mcp/mcp/lib tools/learning-loop-mcp/lib`
   - `git mv tools/learning-loop-mcp/mcp/tools tools/learning-loop-mcp/tools`
   - Remove empty `tools/learning-loop-mcp/mcp/`

3. **Update `server.js`**
   - Change `name: "coordination-gate"` → `name: "learning-loop-mcp"`
   - Change `console.error("coordination-gate:` prefixes → `console.error("learning-loop-mcp:`
   - Update `MANIFEST_PATH` from `join(__dirname, "tools", "manifest.json")` — still correct after flatten
   - Update `import { resolveRoot } from "../../lib/resolve-root.js"` → `import { resolveRoot } from "../lib/resolve-root.js"`

4. **Update `tool-registry.js`**
   - Change `import { appendGateLog } from "../../lib/gate-logging.js"` → `from "../lib/gate-logging.js"`

5. **Update all `tools/*.js` imports**
   - `../../core/gate-logic.js` → `../core/gate-logic.js`
   - `../../../lib/resolve-root.js` → `../../lib/resolve-root.js`
   - `../../../lib/gate-logging.js` → `../../lib/gate-logging.js`
   - `../../core/file-readers.js` → `../core/file-readers.js`
   - `../../core/decision-writer.js` → `../core/decision-writer.js`
   - `../../core/experiment-writer.js` → `../core/experiment-writer.js`
   - `../../core/risk-writer.js` → `../core/risk-writer.js`
   - `../../core/observation-writer.js` → `../core/observation-writer.js`
   - `../../core/inbound-state.js` → `../core/inbound-state.js`
   - `../../core/record-writer.js` → `../core/record-writer.js`
   - `../lib/source-ref-validator.js` → `./lib/source-ref-validator.js` (relative to new server.js)
   - Note: `gate-tool.js` also imports `../../core/inbound-state.js` — update to `../core/inbound-state.js`

6. **Update `manifest.json`** — paths remain `./tools/*.js` (relative to server.js, unchanged)

7. **Update `agent-manifest.json`**
   - Change `"server": "coordination-gate"` → `"server": "learning-loop-mcp"`

8. **Update test files**
   - `__tests__/cross-surface.test.js`: `join(__dirname, "..", "hooks", "bash-gate.js")` — still correct (test dir unchanged)
   - `__tests__/mcp-lifecycle-integration.test.js`: imports from `../core/` and `../mcp/tools/` → `../tools/`

9. **Update hook wrappers**
   - `.claude/coordination/hooks/bash-coordination-gate.cjs`: `tools/coordination-gate/hooks/bash-gate.js` → `tools/learning-loop-mcp/hooks/bash-gate.js`
   - `.claude/coordination/hooks/write-coordination-gate.cjs`: same pattern
   - `.claude/coordination/hooks/inbound-state-gate.cjs`: same pattern
   - `.factory/coordination/hooks/*-coordination-gate.cjs`: same pattern

10. **Update hook wrappers atomically**
    - **Critical:** All 6 wrapper files must be updated in the **same git commit** as the `git mv`. If the wrappers are stale for even one commit, hooks will hit `ENOENT` and fail-open, creating a complete gate bypass window.
    - Update paths in:
      - `.claude/coordination/hooks/bash-coordination-gate.cjs`
      - `.claude/coordination/hooks/write-coordination-gate.cjs`
      - `.claude/coordination/hooks/inbound-state-gate.cjs`
      - `.factory/coordination/hooks/bash-coordination-gate.cjs`
      - `.factory/coordination/hooks/write-coordination-gate.cjs`
      - `.factory/coordination/hooks/inbound-state-gate.cjs`

11. **Update `CLAUDE.md`**
    - All `tools/coordination-gate/` → `tools/learning-loop-mcp/`
    - All `tools/coordination-gate/mcp/` → `tools/learning-loop-mcp/`

## Success Criteria
- [x] `node tools/learning-loop-mcp/server.js` starts without import errors
- [x] `node --test 'tools/learning-loop-mcp/__tests__/*.test.js'` passes
- [x] `rg "coordination-gate" tools/learning-loop-mcp/` returns zero matches
- [x] `ls tools/learning-loop-mcp/mcp/` returns "No such file or directory"
- [x] Deepest import in `tools/learning-loop-mcp/tools/*.js` is `../../lib/` (was `../../../lib/`)

## Risk Assessment
- **Risk:** `manifest.json` uses `./tools/*.js` paths relative to `server.js` — after flattening, `server.js` is now one level up, so `./tools/*.js` still resolves to `tools/learning-loop-mcp/tools/*.js`. Correct. Verify with `node -e "const m=require('./tools/learning-loop-mcp/tools/manifest.json'); console.log(m.length)"`.
- **Risk:** Hook wrapper CJS files reference the universal hook by absolute path — updating the string is sufficient. The universal hook itself (ESM) does not change.
- **Mitigation:** Run server smoke test after every import update.
