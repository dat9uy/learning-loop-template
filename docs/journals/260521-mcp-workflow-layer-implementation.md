# MCP Workflow Layer Implementation — 5-Phase Complete

**Date**: 2026-05-21
**Severity**: Medium
**Component**: Coordination hooks, MCP server, workflow runner, docs
**Status**: Resolved

## What Happened

Executed the full 5-phase MCP workflow layer plan (`plans/260521-0200-mcp-workflow-layer`) end-to-end with TDD mode active. All phases completed; test suite reports 227/227 pass with zero regressions.

## Phase Summary

| Phase | Deliverable | Status |
|-------|-------------|--------|
| 1 | Minimal hook tests (`write-coordination-gate-minimal.test.cjs`) | Done |
| 2 | Shrunk write gate, F12 atomic marker fix, `.bak` retained | Done |
| 3 | `notify_artifact_change` + `trigger_workflow` MCP tools, log rotation | Done |
| 4 | `workflows.json` registry, `workflow-runner.js`, e2e evidence-changed chain | Done |
| 5 | Docs updated (`system-architecture.md`, `operator-guide.md`) | Done |

## Key Implementation Decisions

- **Minimal hook retained hard blocks** for `records/observations/**`, `schemas/**`, `node_modules/**`, `dist/**`, `build/**`, and catch-all `**`. Evidence path keeps write-path observation check.
- **Path traversal fix in `validateCommand`** (code-reviewer finding): original `startsWith("tools/")` allowed `tools/../../etc/passwd`. Fix resolves against `root/tools/` and verifies prefix with path separator.
- **Stdio isolation**: all workflow spawns use `{ stdio: "pipe", detached: true }` so child output never corrupts MCP transport.
- **Separate log files**: `gate-log.jsonl` for audit, `workflow-log.jsonl` for workflow stdout/stderr. Prevents concurrent-append corruption.
- **Fire-and-forget workflows**: MCP returns immediately; failure logs to `workflow-log.jsonl` and writes `.workflow-failures` marker. No retries.
- **F12 race fixed** with atomic temp+rename pattern in `inbound-state-gate.cjs` before shrinking the hook.

## Critical Finding from Review

Code reviewer flagged command-injection risk in `validateCommand`. Three path-traversal cases added to tests. Fix verified before merge.

## Test Coverage

- `write-coordination-gate-minimal.test.cjs`: 17 tests covering allow/block paths, observation staleness, evidence escalation.
- `workflow-runner.test.js`: registry load, glob matching, command validation (including traversal), spawn stdio isolation, e2e evidence-changed chain.
- `server.test.js`: `notify_artifact_change` and `trigger_workflow` tool coverage.
- Existing suites: all pass, no regression.

## Rollback

`cp .claude/coordination/hooks/write-coordination-gate.cjs.bak .claude/coordination/hooks/write-coordination-gate.cjs` restores previous gate if needed.

## Next Steps

1. Production validation of auto-triggered `extract-index` runtime on real evidence writes.
2. Schedule `.bak` deletion after one full production cycle.
3. Consider incremental `extract-index` if full-scan latency becomes problematic.

---

**Unresolved questions**
- None.
