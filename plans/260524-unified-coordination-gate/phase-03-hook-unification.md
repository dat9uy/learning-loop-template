---
phase: 3
title: Hook-Unification
status: completed
effort: 4h
dependencies:
  - 2
---

# Phase 3: Hook-Unification

## Overview

Create universal hook scripts in `tools/coordination-gate/hooks/` that work for both Claude Code and Droid CLI. These scripts import from `../core/` and handle stdin/stdout protocol adaptation. Update `.claude/coordination/hooks/` to be thin wrappers.

## Requirements

- Functional: Three universal hooks: `bash-gate.js`, `write-gate.js`, `inbound-gate.js`
- Functional: Hooks work with both Claude Code and Droid CLI stdin formats
- Functional: `.claude/coordination/hooks/` are thin wrappers (<50 lines each)
- Functional: Tool name normalization (Bash↔Execute, Edit/Write↔Create/Edit/ApplyPatch)
- Non-functional: Identical gate decisions before and after unification

## Architecture

### Universal Hook Scripts

```
tools/coordination-gate/hooks/
├── lib/
│   └── protocol-adapter.js      # stdin parsing, stdout formatting, tool name normalization
├── bash-gate.js                 # PreToolUse for Bash/Execute
├── write-gate.js                # PreToolUse for Edit/Write/Create/ApplyPatch
└── inbound-gate.js              # UserPromptSubmit
```

### Protocol Adapter

The adapter normalizes between Claude Code and Droid CLI input formats:

| Field | Claude Code | Droid CLI | Adapter Action |
|-------|-------------|-----------|----------------|
| tool_name | `Bash` | `Execute` | Normalize to internal `bash` |
| tool_name | `Edit`, `Write` | `Create`, `Edit`, `ApplyPatch` | Normalize to internal `write` |
| command | `tool_input.command` | `tool_input.command` | Pass through |
| file_path | `tool_input.file_path` | `tool_input.file_path` | Pass through |
| prompt | `prompt` | `prompt` | Pass through |
| exit code | 0=allow, 2=block | 0=allow, 2=block | Same |

### Output Format

Both Claude Code and Droid support the same JSON output structure:
```json
{
  "decision": "block",
  "reason": "...",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "..."
  }
}
```

### Thin Wrapper Strategy

`.claude/coordination/hooks/bash-coordination-gate.cjs` becomes:
```javascript
#!/usr/bin/env node
// Thin wrapper — delegates to universal hook
const { execSync } = require('child_process');
const path = require('path');
const script = path.join(__dirname, '../../../tools/coordination-gate/hooks/bash-gate.js');
execSync(`node ${script}`, { stdio: 'inherit' });
```

## Related Code Files
- Create: `tools/coordination-gate/hooks/lib/protocol-adapter.js`
- Create: `tools/coordination-gate/hooks/bash-gate.js`
- Create: `tools/coordination-gate/hooks/write-gate.js`
- Create: `tools/coordination-gate/hooks/inbound-gate.js`
- Modify: `.claude/coordination/hooks/bash-coordination-gate.cjs` → thin wrapper
- Modify: `.claude/coordination/hooks/write-coordination-gate.cjs` → thin wrapper
- Modify: `.claude/coordination/hooks/inbound-state-gate.cjs` → thin wrapper
- Modify: `.claude/settings.json` → update hook paths

## Implementation Steps

1. **Create protocol adapter** (30 min)
   - `protocol-adapter.js` with functions:
     - `parseInput(stdin)` — parse JSON from stdin
     - `normalizeToolName(toolName)` — map Bash→bash, Execute→bash, etc.
     - `formatOutput(decision)` — format JSON for stdout
     - `exitCode(decision)` — map decision to exit code

2. **Create universal bash-gate.js** (45 min)
   - Read stdin, parse with protocol adapter
   - Import `matchConstraintPattern`, `readObservations`, `evaluateBudget`, `makeGateDecision` from `../core/`
   - Import `commandWritesToRecords` logic from current hook
   - Output decision JSON, exit with appropriate code
   - Must handle both `Bash` and `Execute` tool names

3. **Create universal write-gate.js** (45 min)
   - Read stdin, parse with protocol adapter
   - Import `globMatch`, `readPreflightMarker`, `checkDecisionRecords`, etc. from `../core/`
   - Replicate all write-gate rules: records/** block, schemas/** block, product/** preflight, etc.
   - Output decision JSON, exit with appropriate code
   - Must handle `Edit`, `Write`, `Create`, `ApplyPatch` tool names

4. **Create universal inbound-gate.js** (30 min)
   - Read stdin, parse with protocol adapter
   - Import `detectStateChange`, `readActiveObservations`, `findStaleObservations` from `../core/`
   - Replicate inbound gate logic: pattern detection, staleness check, marker write
   - Output soft warning via `hookSpecificOutput.additionalContext`

5. **Convert .claude hooks to thin wrappers** (30 min)
   - Replace `bash-coordination-gate.cjs` with wrapper
   - Replace `write-coordination-gate.cjs` with wrapper
   - Replace `inbound-state-gate.cjs` with wrapper
   - Update `.claude/settings.json` if paths change

6. **Run tests** (30 min)
   - Run existing hook tests: `node --test '.claude/coordination/__tests__/*.test.cjs'`
   - Fix any failures

## Success Criteria

- [x] `tools/coordination-gate/hooks/` contains 3 universal hook scripts
- [x] Protocol adapter handles both Claude Code and Droid CLI formats
- [x] `.claude/coordination/hooks/` are thin wrappers (<50 lines each)
- [x] All existing hook tests pass
- [x] Gate decisions are identical before/after (verified by test)

## Completion Notes

- Created `protocol-adapter.js` with `parseInput`, `normalizeToolName`, `extractCommand`, `extractFilePath`, `extractPrompt`, `formatOutput`, `exitCode`, `formatSoftWarning`
- Created `bash-gate.js` handling both `Bash` and `Execute` tool names
- Created `write-gate.js` handling `Edit`, `Write`, `Create`, `ApplyPatch`
- Created `inbound-gate.js` with cross-surface marker writing (respects `GATE_MARKER_PATH`)
- Thin wrappers use `execFileSync` with `input: stdin` and `env: process.env` for proper forwarding
- Fixed `toRelative()` to handle absolute paths correctly

## Risk Assessment

- **Risk**: Universal hooks miss edge cases present in original CJS hooks
  - Mitigation: Port logic line-by-line; run full test suite
- **Risk**: Droid CLI tool names differ more than expected
  - Mitigation: Protocol adapter is extensible; add normalization rules as needed
- **Risk**: Path resolution breaks (hooks run from different cwd)
  - Mitigation: Use `__dirname` resolution; test with `GATE_ROOT` override
- **Risk**: CJS hooks can't import ESM core
  - Mitigation: Use `createRequire` or execSync node pattern
