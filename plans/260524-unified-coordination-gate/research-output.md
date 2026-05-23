# Research Output: Unified Coordination Gate

## Duplication Inventory

### Hook → MCP Core Function Mapping

| Hook File (CJS) | Hook Function | MCP Core File (ESM) | MCP Function | Notes |
|-----------------|---------------|---------------------|--------------|-------|
| `gate-utils.cjs:47` | `matchConstraintPattern` | `gate-logic.js:55` | `matchConstraintPattern` | **IDENTICAL** — same regex splitting, same pattern matching |
| `gate-utils.cjs:69` | `readObservations` | `file-readers.js:22` | `readObservations` | **IDENTICAL** — same dir scanning, same YAML parsing |
| `gate-utils.cjs:94` | `globMatch` | `gate-logic.js:25` | `globMatch` | **IDENTICAL** — same regex construction |
| `gate-utils.cjs:108` | `readLastOperatorMessage` | `inbound-state.js:12` | `readLastOperatorMessage` | **IDENTICAL** — same marker path, same TTL logic |
| `gate-utils.cjs:123` | `checkObservationStaleness` | `inbound-state.js:29` | `checkObservationStaleness` | **IDENTICAL** — same staleness logic |
| `gate-utils.cjs:160` | `extractFrontmatter` | — | — | **HOOK ONLY** — used by write-gate for plan.md scanning |
| `gate-utils.cjs:178` | `hasProductBuildTag` | — | — | **HOOK ONLY** — frontmatter tag check |
| `gate-utils.cjs:185` | `extractSurfaces` | — | — | **HOOK ONLY** — frontmatter surface extraction |
| `gate-utils.cjs:190` | `checkDecisionRecords` | — | — | **HOOK ONLY** — decision record existence check |
| `gate-utils.cjs:229` | `readPreflightMarker` | — | — | **HOOK ONLY** — preflight TTL check |
| `gate-utils.cjs:244` | `writePreflightMarker` | — | — | **HOOK ONLY** — atomic marker write |
| `gate-utils.cjs:258` | `inferSurface` | — | — | **HOOK ONLY** — path → surface inference |
| `gate-utils.cjs:282` | `hasDecisionRecords` | — | — | **HOOK ONLY** — wrapper around checkDecisionRecords |

### Hook-Only Logic (Not in MCP Core)

| File | Logic | Why Not in MCP? |
|------|-------|-----------------|
| `bash-coordination-gate.cjs:18` | `commandWritesToRecords` regex patterns | Bash-specific path detection |
| `bash-coordination-gate.cjs:33` | `readBudgets` | Inline budget reading (MCP uses `file-readers.js:readBudgets`) |
| `bash-coordination-gate.cjs:95` | Budget exhaustion check | Inline (MCP uses `gate-logic.js:evaluateBudget`) |
| `bash-coordination-gate.cjs:108` | Observation existence check | Inline (MCP uses `gate-logic.js:checkObservationExists`) |
| `inbound-state-gate.cjs:25` | `STATE_CHANGE_PATTERNS` | Inbound gate specific |
| `inbound-state-gate.cjs:55` | `detectStateChange` | Inbound gate specific |
| `inbound-state-gate.cjs:68` | `readActiveObservations` | Filters for active only (MCP reads all) |
| `inbound-state-gate.cjs:91` | `findStaleObservations` | Uses absolute time threshold |
| `inbound-state-gate.cjs:106` | `writeOperatorMessageMarker` | Writes marker file |
| `inbound-state-gate.cjs:122` | `emitSoft` | JSON output formatting |
| `inbound-state-gate.cjs:130` | `buildContextMessage` | Message construction |

### MCP-Only Logic (Not in Hooks)

| File | Logic | Why Not in Hooks? |
|------|-------|-----------------|
| `gate-logic.js:86` | `checkObservationExists` | Pure function extracted from inline hook logic |
| `gate-logic.js:101` | `evaluateBudget` | Pure function extracted from inline hook logic |
| `gate-logic.js:116` | `makeGateDecision` | Pure function extracted from inline hook logic |
| `gate-logic.js:173` | `evaluateWritePath` | Write-path gate (MCP tool uses this) |
| `gate-logic.js:35` | `pathMatchesObservation` | Write-path helper |
| `file-readers.js:55` | `readBudgets` | Budget reading (hooks inline this) |

## Droid CLI Protocol Compatibility

### Confirmed Compatible

| Aspect | Claude Code | Droid CLI | Status |
|--------|-------------|-----------|--------|
| Hook events | `PreToolUse`, `UserPromptSubmit` | `PreToolUse`, `UserPromptSubmit` | ✅ Same |
| Exit codes | 0=allow, 2=block | 0=allow, 2=block | ✅ Same |
| Stdin format | JSON with `tool_name`, `tool_input` | JSON with `tool_name`, `tool_input` | ✅ Same |
| Stdout format | JSON with `decision`, `reason` | JSON with `decision`, `reason` | ✅ Same |
| `hookSpecificOutput` | Supported | Supported | ✅ Same |
| Matcher syntax | `Edit\|Write`, `Bash` | `Edit\|Create\|ApplyPatch`, `Execute` | ⚠️ Different names |

### Tool Name Differences

| Operation | Claude Code | Droid CLI | Adapter Action |
|-----------|-------------|-----------|----------------|
| Shell command | `Bash` | `Execute` | Normalize both → `bash` |
| File edit | `Edit` | `Edit` | No change |
| File create | `Write` | `Create` | Normalize both → `write` |
| Patch apply | — | `ApplyPatch` | Treat as `write` |

## Extraction Boundary

### Moves to `core/` (universal)

1. **patterns.json** — constraint regex patterns
2. **resolve-root.js** — project root resolution
3. **gate-logic.js** — all pure decision functions
4. **file-readers.js** — observation/budget reading
5. **observation-writer.js** — observation YAML writing
6. **inbound-state.js** — staleness checking
7. **gate-logging.js** — gate-log.jsonl appending
8. **record-writer.js** — decision/experiment/risk writing
9. **decision-writer.js** — decision record specifics
10. **experiment-writer.js** — experiment record specifics
11. **risk-writer.js** — risk record specifics

### Stays surface-specific

1. **Hook scripts** — stdin/stdout protocol, exit codes, tool name normalization
2. **MCP tool definitions** — schema, descriptions, handler wiring
3. **MCP server bootstrap** — transport, connection

### New: Protocol Adapter

1. **protocol-adapter.js** — normalize tool names, format output, map exit codes

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CJS can't import ESM core | Medium | High | Use `createRequire` or execSync pattern |
| Hook behavior drift during port | Low | High | Line-by-line port; comprehensive tests |
| Droid matcher syntax differs | Low | Medium | Test with actual Droid; adapter handles it |
| Path resolution (cwd) issues | Medium | Medium | Use `__dirname` + `GATE_ROOT` env |
| Performance (extra process spawn) | Low | Low | Measure; optimize if >50ms |

## Recommended Implementation Order

1. Create `tools/coordination-gate/core/` with all shared modules
2. Create `tools/coordination-gate/hooks/` with universal scripts
3. Convert `.claude/hooks/` to thin wrappers
4. Create `.factory/` mirror
5. Verify with cross-surface tests
