---
phase: 1
title: Research
status: completed
effort: 1h
dependencies: []
---

# Phase 1: Research

## Overview

Catalog all gate logic duplication between hooks and MCP server, research Droid CLI hook protocol compatibility, and define the exact extraction boundary for the shared core.

## Requirements

- Functional: Complete inventory of duplicated logic with file:line references
- Functional: Droid CLI hook protocol documented (stdin format, exit codes, JSON output)
- Functional: Extraction boundary defined — what moves to core, what stays in surface-specific adapters
- Non-functional: No code changes in this phase

## Architecture

Research follows the duplication-first chain: read hook files → read MCP core files → map equivalent functions → identify extraction candidates. The goal is a 1:1 mapping between hook logic and MCP core functions.

## Related Code Files
- Read: `.claude/coordination/hooks/bash-coordination-gate.cjs`
- Read: `.claude/coordination/hooks/write-coordination-gate.cjs`
- Read: `.claude/coordination/hooks/inbound-state-gate.cjs`
- Read: `.claude/coordination/hooks/lib/gate-utils.cjs`
- Read: `tools/constraint-gate/gate-logic.js`
- Read: `tools/constraint-gate/file-readers.js`
- Read: `tools/constraint-gate/inbound-state.js`
- Read: `tools/constraint-gate/observation-writer.js`
- Read: `tools/constraint-gate/resolve-root.js`
- Read: `tools/constraint-gate/gate-logging.js`
- Read: Droid docs: hooks-guide, hooks-reference, skills

## Implementation Steps

1. **Duplication inventory** (20 min)
   - Map each function in `gate-utils.cjs` to its equivalent in `gate-logic.js`/`file-readers.js`
   - Document line ranges and behavioral differences (if any)
   - Identify functions that exist only in hooks (e.g., `writePreflightMarker`) vs only in MCP

2. **Droid protocol research** (20 min)
   - Confirm Droid PreToolUse hook receives same JSON schema as Claude Code
   - Confirm exit code semantics: 0=allow, 2=block
   - Confirm JSON output format for `hookSpecificOutput`
   - Document any differences in tool naming (Execute vs Bash, Create vs Write)

3. **Extraction boundary design** (15 min)
   - Define `core/` module boundaries: gate-logic, file-readers, observation-writer, inbound-state, gate-logging, resolve-root, patterns
   - Define adapter layer: stdin/stdout parsing, exit code mapping, tool name normalization
   - Document CJS/ESM interop strategy

4. **Write research output** (5 min)
   - Write findings to `plans/260524-unified-coordination-gate/research-output.md`
   - Include: duplication map, Droid protocol notes, extraction boundary, risk list

## Output Artifact

- **Create**: `plans/260524-unified-coordination-gate/research-output.md`
  - Duplication map table (hook function → MCP function → core module)
  - Droid protocol compatibility notes
  - Extraction boundary diagram
  - Risk list with mitigations

## Success Criteria

- [x] Complete duplication inventory with file:line references
- [x] Droid hook protocol documented and confirmed compatible
- [x] Extraction boundary defined with module boundaries
- [x] Research output reviewed and approved before proceeding to Phase 2

## Completion Notes

- Research output written to `research-output.md`
- Droid CLI protocol confirmed compatible (same stdin/stdout, exit codes, JSON format)
- Extraction boundary: 11 modules to `core/`, 3 surface-specific adapters
- Key finding: `gate-utils.cjs` and `gate-logic.js` share 90%+ identical logic

## Risk Assessment

- **Risk**: Droid hook protocol differs significantly from Claude Code
  - Mitigation: Document differences; adapter layer handles normalization
- **Risk**: Some hook logic is subtly different from MCP equivalent
  - Mitigation: Flag differences in research output; Phase 2 resolves by picking one as canonical
