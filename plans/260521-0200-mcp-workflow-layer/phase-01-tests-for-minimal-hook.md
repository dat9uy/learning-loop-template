---
phase: 1
title: "Tests for Minimal Hook"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Tests for Minimal Hook

## Overview

Write comprehensive tests for the new minimal hook behavior BEFORE modifying the hook. This is the TDD foundation: lock current hard-blocking behavior into tests, then shrink the hook with confidence.

## Requirements

- Functional: Tests cover unconditional blocks, evidence write-path, schema block, and allow paths
- Non-functional: Tests run with `node --test`, no external dependencies beyond `node:fs`, `node:path`

## Architecture

Test harness spawns the hook via `child_process.spawn` and pipes the PreToolUse JSON payload to stdin. Captures stdout and exit code. `node --test` does NOT feed stdin to spawned scripts; the harness must explicitly pipe the input.

## Related Code Files

- Create: `.claude/coordination/hooks/write-coordination-gate-minimal.test.cjs`
- Read for context: `.claude/coordination/hooks/write-coordination-gate.cjs`
- Read for context: `.claude/coordination/hooks/bash-coordination-gate.cjs`

## Implementation Steps

1. **Create test file** at `.claude/coordination/hooks/write-coordination-gate-minimal.test.cjs`
2. **Use `child_process.spawn`** to launch the hook with JSON piped to stdin
3. **Test unconditional block**: `records/observations/**` → exit 2, decision: block
4. **Test evidence allow**: `records/evidence/**` with active write-path observation → exit 0
5. **Test evidence block**: `records/evidence/**` with no write-path observation → exit 2, observation_required: true
6. **Test evidence escalate**: `records/evidence/**` with stale observation + `.last-operator-message` marker → exit 2, inbound_gate: true
7. **Test schema block**: `schemas/**` → exit 2, decision: block
8. **Test build-artifact blocks**: `node_modules/**`, `dist/**`, `build/**` → exit 2
9. **Test catch-all block**: unknown paths (`vendor-secrets.env`, `tmp/.steal`) → exit 2
10. **Test allow paths**: `docs/**`, `plans/**`, `tools/**`, `.claude/**` → exit 0
11. **Test MCP delegation stub**: create a mock that verifies hook would call MCP for non-critical paths (optional, document if deferred)
12. **Add hook tests to `pnpm test`**: update `package.json` test script to include `.claude/coordination/__tests__/*.test.cjs`

## Success Criteria

- [ ] All 11+ test cases pass against CURRENT hook behavior
- [ ] Tests isolate each scenario with temp directories
- [ ] No test depends on real project state (uses `GATE_ROOT` override)
- [ ] Test harness uses `child_process.spawn` with explicit stdin pipe (not `node --test` auto-stdin)
- [ ] `pnpm test` runs both tool tests and hook tests

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Current hook behavior changes during test writing | Low | Tests verify against current file; if hook changes, tests catch regression |
| Evidence write-path tests need observation YAML fixtures | Low | Generate fixtures inline in test setup |
