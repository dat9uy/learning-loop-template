---
phase: 2
title: "phase-02-config-files"
status: pending
effort: ""
---

# Phase 2: Configuration Files (.mastracode/)

## Overview

Create the 4 declarative config files that Mastra Code reads on startup. **MCP-only integration model** (per red-team fix F2: hybrid model out of scope; programmatic deferred to follow-up plan). Uses Phase 1 probe results to populate hook matchers with actual tool names.

**Hard dependency:** Phase 1 probe MUST complete and exit 0 before Phase 2 starts. The `hooks.json` `matcher.tool_name` for the write-gate is the Phase 1 probe value for Mastra Code's built-in write/edit tool. If Phase 1 did not document a tool name, Phase 2 cannot ship.

## Requirements

- **Functional:** Mastra Code, when launched from project root, discovers + parses all 4 files without error
- **Non-functional:** all paths git-trackable (no generated content); JSON valid; conventions match Mastra Code's discovery priority
- **Testability:** each file passes `node -e "JSON.parse(require('fs').readFileSync('<path>'))"`

## Architecture

Per mastracode-prep research:

| File | Purpose | Discovery priority |
|------|---------|--------------------|
| `.mastracode/mcp.json` | MCP server registration (PRIMARY path per MCP-only model) | Highest (project-local) |
| `.mastracode/hooks.json` | Lifecycle hook commands (declarative JSON) | Higher (project-local) |
| `.mastracode/settings.json` | Shell passthrough + theme + settings | Project-local |
| `.mastracode/database.json` | Storage overrides (resourceId) | Project-local |

**MCP-only model:** Phase 4 smoke test exercises MCP integration via `.mastracode/mcp.json`. Programmatic integration (`createMastraCode({ tools })`) is out-of-scope for Plan 4 and deferred to a follow-up plan (per red-team F2 + predict report's MCP-only endorsement).

## Related Code Files

- Create: `.mastracode/mcp.json` (8 lines)
- Create: `.mastracode/hooks.json` (~30 lines)
- Create: `.mastracode/settings.json` (~10 lines)
- Create: `.mastracode/database.json` (4 lines)
- Modify: `.gitignore` (add `.mastracode/data/` to gitignore; the DB file is generated)

## Implementation Steps

1. **Create `.mastracode/mcp.json`:**

   ```json
   {
     "mcpServers": {
       "learning-loop": {
         "command": "node",
         "args": ["tools/learning-loop-mastra/mastra/server.js"]
       }
     }
   }
   ```

   Matches contract Req #2 `mcp-client-config` validator shape (after Phase 3 amend the RUNTIMES entry path).

2. **Create `.mastracode/hooks.json`** (using Phase 1 probe results for actual write/edit tool names):

   ```json
   {
     "PreToolUse": [
       {
         "type": "command",
         "command": "node tools/learning-loop-mastra/hooks/legacy/bash-gate.js",
         "matcher": { "tool_name": "execute_command" },
         "timeout": 5000,
         "description": "Learning-loop bash coordination gate"
       },
       {
         "type": "command",
         "command": "node tools/learning-loop-mastra/hooks/legacy/write-gate.js",
         "matcher": { "tool_name": "<TBD_FROM_PROBE>" },
         "timeout": 5000,
         "description": "Learning-loop write coordination gate (matches Write/Edit tools)"
       }
     ],
     "UserPromptSubmit": [
       {
         "type": "command",
         "command": "node tools/learning-loop-mastra/hooks/legacy/inbound-gate.js",
         "timeout": 5000,
         "description": "Learning-loop inbound state gate (meta-state first)"
       }
     ],
     "SessionStart": [
       {
         "type": "command",
         "command": "node tools/learning-loop-mastra/hooks/legacy/recurrence-check-on-start.js",
         "timeout": 10000,
         "description": "Learning-loop gate-log recurrence check"
       }
     ]
   }
   ```

   `<TBD_FROM_PROBE>` is the actual Mastra Code built-in write/edit tool name (Phase 1 R2 resolution). If the tool name differs from `execute_command`, Phase 1 will document; Phase 2 uses the documented value.

3. **Create `.mastracode/settings.json`** (minimal):

   ```json
   {
     "shellPassthrough": false,
     "omScope": "project"
   }
   ```

   Per mastracode-prep §6: full schema not exhaustive in docs but `shellPassthrough` + `omScope` are documented fields. `omScope: "project"` matches our OM scope (out of Plan 4 scope; preempts future hardening).

4. **Create `.mastracode/database.json`** (sets `resourceId` for runtime identity):

   ```json
   {
     "resourceId": "mastra-code"
   }
   ```

   Per harness-class §5: `resourceId` is the framework-level runtime identifier. Semantically equivalent to `RUNTIME_ID` convention. The hardening plan's R2 write-gate can key on this for Mastra Code.

5. **Update `.gitignore`** to exclude `.mastracode/data/` (generated LibSQL DB file).

6. **Validate JSON:** `for f in .mastracode/*.json; do node -e "JSON.parse(require('fs').readFileSync('$f'))" || echo "INVALID: $f"; done`.

7. **Smoke check discovery:** run `node scripts/probe-mastracode.cjs` again; confirm `createMastraCode` reports all 4 files were read with the expected content.

## Success Criteria

- [ ] All 4 config files exist at `.mastracode/` + pass JSON validation
- [ ] `hooks.json` matcher `tool_name` for write-gate matches the actual Mastra Code built-in tool name (from Phase 1 probe)
- [ ] `.gitignore` excludes `.mastracode/data/`
- [ ] Phase 1 probe rerun confirms all 4 files were discovered + parsed by Mastra Code
- [ ] 1 atomic commit: 4 files created + 1 `.gitignore` line

## Risk Assessment

- **R2 (write/edit tool names):** if probe reveals tool names differ from docs, must update `hooks.json` matcher before merging. Probe MUST complete before this phase.
- **Mastra Code schema drift:** documented fields (`shellPassthrough`, `omScope`) are not exhaustive. Probe confirms which fields are read; if `database.json` resourceId field is wrong shape, Phase 1 finding + Phase 2 fix.

## Cross-references

- **Research:** `plans/reports/research-260626-2314-phase-e-plan-4-mastracode-prep-report.md` §2-6
- **Contract validator:** `tools/learning-loop-mastra/interface/contract.js` (RUNTIMES entry needs update in Phase 3)
- **Universal hooks:** `tools/learning-loop-mastra/hooks/legacy/{bash,write,inbound}-gate.js` + `recurrence-check-on-start.js`