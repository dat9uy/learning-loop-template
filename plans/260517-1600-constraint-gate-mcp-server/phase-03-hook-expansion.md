---
phase: 3
title: "Hook Expansion"
status: pending
priority: P1
effort: 1.5h
dependencies: [1]
---

# Phase 3: Hook Expansion

## Overview

Create two new hooks for Edit/Write and Bash gating. Shared utilities in `gate-utils.cjs`. Hooks use file-based coordination (no MCP calls). Profile selection defaults to most restrictive.

## Context Links

- Existing hook: `.claude/coordination/hooks/skill-coordination-gate.cjs`
- Hook tests: `.claude/coordination/__tests__/skill-coordination-gate.test.cjs`
- Coordination config: `.claude/coordination/coordination-config.json`
- settings.json: `.claude/settings.json`
- Brainstorm: `plans/reports/brainstorm-20260517-constraint-gate-architecture.md`

## Requirements

**Functional:**
- `write-coordination-gate.cjs` intercepts `Edit` and `Write` calls
- `bash-coordination-gate.cjs` intercepts `Bash` calls
- Both use shared `lib/gate-utils.cjs` for config reading, pattern matching
- For Edit/Write: check target path against coordination config write forbidlists
- For Bash: check command against constraint patterns (word-boundary regex)
- Profile selection: default to `code-generation` (most restrictive), override via `.claude/coordination/.active-profile` state file
- Same block/allow semantics as existing hook (exit 2 = block, exit 0 = allow)
- Fail-open on missing config files (match existing pattern)

**Non-functional:**
- <50ms per check (match existing hook performance)
- CJS modules (match existing hook format)
- No MCP calls (synchronous file-based only)

## Architecture

```
.claude/coordination/hooks/
├── skill-coordination-gate.cjs   # existing, unchanged
├── write-coordination-gate.cjs   # NEW: gates Edit + Write
├── bash-coordination-gate.cjs    # NEW: gates Bash
└── lib/
    └── gate-utils.cjs            # shared: config reading, pattern matching
```

**gate-utils.cjs** (CJS, single source of truth for patterns):
- `readCoordinationConfig(coordDir)` → parse coordination-config.json
- `readObservations(observationsDir)` → scan and parse YAML (with `uniqueKeys: false`)
- `readActiveProfile(coordDir)` → read `.active-profile` file, default to `code-generation`
- `CONSTRAINT_PATTERNS` — word-boundary regex (same as gate-logic.js in MCP server)
- `matchConstraintPattern(command)` → split on `;`, `&`, `|`, check each segment
- `extractBashCommands(command)` → split on shell operators
- All readers fail-open (return empty/default on error, log to stderr)

**write-coordination-gate.cjs:**
1. Read stdin → extract `tool_input.file_path`
2. Read coordination config + active profile
3. Match path against profile's `write_forbidlist` glob patterns
4. If forbidden → exit 2 + block JSON
5. Else → exit 0

**bash-coordination-gate.cjs:**
1. Read stdin → extract `tool_input.command`
2. Call `matchConstraintPattern(command)` → check each segment
3. If constrained: call `readObservations()` → check for matching `constraint_type`
4. If no observation: exit 2 + block reason
5. If budget constraint: read budget YAML directly (gate-utils reads the same budget files)
6. If budget exhausted: exit 2 + escalate reason
7. Else → exit 0

**Profile selection:**
- Default: `code-generation` profile (most restrictive forbidlist)
- Override: write profile name to `.claude/coordination/.active-profile` file
- The learning-loop coordinator sets this file when activating a profile
- Read on each hook invocation (stateless)

**Hook ordering:** Claude Code runs all matching hooks; ALL must pass (AND semantics). If scout-block allows but coordination-gate blocks, the call is blocked. This is correct behavior.

## Related Code Files

- Create: `.claude/coordination/hooks/write-coordination-gate.cjs`
- Create: `.claude/coordination/hooks/bash-coordination-gate.cjs`
- Create: `.claude/coordination/hooks/lib/gate-utils.cjs`
- Create: `.claude/coordination/__tests__/write-coordination-gate.test.cjs`
- Create: `.claude/coordination/__tests__/bash-coordination-gate.test.cjs`
- Modify: `.claude/settings.json` (add hook matchers for Edit|Write and Bash)
- Read: `.claude/coordination/hooks/skill-coordination-gate.cjs` (pattern reference)

## Tests Before (TDD)

1. **`write-coordination-gate.test.cjs`** — Edit/Write gating:
   - `Edit` with path `records/claims/foo.yaml` → exit 2 (forbidden by code-generation profile)
   - `Edit` with path `product/api/main.py` → exit 0 (allowed)
   - `Write` with path `schemas/observation.schema.json` → exit 2 (forbidden)
   - `Write` with path `tools/constraint-gate/server.js` → exit 0 (allowed)
   - Missing coordination config → exit 0 (fail-open)

2. **`bash-coordination-gate.test.cjs`** — Bash gating:
   - `Bash` with `docker run ubuntu` → exit 2 (constrained, no observation)
   - `Bash` with `sudo chown root file` → exit 2 (constrained)
   - `Bash` with `ls -la` → exit 0 (not constrained)
   - `Bash` with `git status` → exit 0 (not constrained)
   - `Bash` with `pip install requests` → exit 2 (constrained)
   - `Bash` with `cat docker-compose.yml` → exit 0 (word boundary: no match)
   - `Bash` with `echo "undocumented"` → exit 0 (word boundary: no match)
   - `Bash` with `docker run ubuntu ; sudo apt install` → exit 2 (split on `;`, both match)

3. **`bash-coordination-gate.test.cjs`** — Profile selection:
   - Default profile → code-generation (most restrictive)
   - `.active-profile` file contains `plan-execution` → uses plan-execution forbidlist
   - Missing `.active-profile` → defaults to code-generation

4. **Existing tests still pass** (Skill gating unchanged)

## Implementation Steps

1. Create `lib/gate-utils.cjs`:
   - `readCoordinationConfig(coordDir)` → parse coordination-config.json
   - `readObservations(observationsDir)` → scan and parse YAML (with `uniqueKeys: false`)
   - `readActiveProfile(coordDir)` → read `.active-profile`, default to `code-generation`
   - `CONSTRAINT_PATTERNS` — word-boundary regex (same patterns as gate-logic.js)
   - `matchConstraintPattern(command)` → split on operators, check each segment
   - `extractBashCommands(command)` → split on `;`, `&`, `|`
   - `globMatch(pattern, path)` → simple glob matching for forbidlists
   - All readers fail-open (return empty on error, log to stderr)
2. Create `write-coordination-gate.cjs`:
   - Read stdin → extract `tool_input.file_path`
   - Call `readCoordinationConfig()` + `readActiveProfile()`
   - Check path against profile's `write_forbidlist`
   - Exit 2 if forbidden, exit 0 if allowed
3. Create `bash-coordination-gate.cjs`:
   - Read stdin → extract `tool_input.command`
   - Call `matchConstraintPattern()` → check each segment
   - If constrained: call `readObservations()` → check `constraint_type` field
   - If no observation: exit 2 + block reason
   - If budget constraint: read budget YAML via gate-utils, check `current >= budget`
   - If budget exhausted: exit 2 + escalate reason
4. Add tests to new test files (same pattern as existing hook tests)
5. Update `settings.json`:
   - Add `{ "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "node .claude/coordination/hooks/write-coordination-gate.cjs" }] }`
   - Add `{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "node .claude/coordination/hooks/bash-coordination-gate.cjs" }] }`
6. Run all tests (existing + new)

## Success Criteria

- [ ] Edit/Write calls gated against coordination config forbidlists
- [ ] Bash calls gated against constraint patterns (word-boundary)
- [ ] `cat docker-compose.yml` does NOT match docker constraint
- [ ] Profile selection defaults to code-generation, overridable via state file
- [ ] Existing Skill gating unchanged (all 11 existing tests pass)
- [ ] New tests pass for Edit, Write, Bash gating
- [ ] Hook performance <50ms
- [ ] Fail-open on missing coordination config

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| CJS can't import ESM gate-logic | gate-utils.cjs is CJS, patterns defined there as single source of truth |
| Hook becomes too complex | Keep pattern matching simple, expand incrementally |
| Breaking existing Skill gating | Run existing tests first, keep Skill logic untouched |
| Profile state file stale | Read on each invocation, default to most restrictive |
| Shared lib bug affects all hooks | Wrap each utility call in try/catch (fail-open per hook) |

## Regression Gate

```bash
node .claude/coordination/__tests__/skill-coordination-gate.test.cjs
node .claude/coordination/__tests__/write-coordination-gate.test.cjs
node .claude/coordination/__tests__/bash-coordination-gate.test.cjs
node --test tools/constraint-gate/*.test.js
```
