---
title: "Eliminate hand-rolled MCP stdio clients and fix pnpm test deadlock"
description: "Convert all hand-rolled MCP stdio/JSON-RPC clients to the official @modelcontextprotocol/sdk Client, default test storage to memory, add a test timeout, and close meta-260621T1743Z."
status: pending
priority: P1
branch: "260619-2246-phase-d-plan-2-storage"
tags: [mcp, stdio, sdk, test, deadlock, technical-debt]
blockedBy: []
blocks: []
created: "2026-06-21T15:23:57.189Z"
createdBy: "ck:plan"
source: skill
related:
  - plans/reports/debug-260621-2034-GH-2246-pnpm-test-deadlock-root-cause-report.md
  - plans/reports/scout-260621-2217-GH-2246-hand-rolled-mcp-stdio-report.md
  - plans/reports/brainstorm-260621-1355-GH-2246-pnpm-test-glob-problem-report.md
  - meta-260621T1743Z-the-full-pnpm-test-glob-fired-by-pre-commit-hook-package-jso
---

# Eliminate hand-rolled MCP stdio clients and fix pnpm test deadlock

## Overview

The pre-commit `pnpm test` deadlock (`meta-260621T1743Z`) is caused by hand-rolled MCP stdio parsers in four test files that cannot handle the server's stdout log line. This plan replaces all hand-rolled MCP stdio clients (five tests + one production Droid hook) with the official `@modelcontextprotocol/sdk Client`, defaults spawned test servers to in-memory storage, and adds a 30s test timeout so future hangs fail fast.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Prepare shared helper](./phase-01-prepare-shared-helper.md) | Pending |
| 2 | [Rewrite MCP stdio tests with SDK](./phase-02-rewrite-mcp-stdio-tests-with-sdk.md) | Pending |
| 3 | [Refactor Droid hook to SDK client](./phase-03-refactor-droid-hook-to-sdk-client.md) | Pending |
| 4 | [Runner hardening and finding closeout](./phase-04-runner-hardening-and-finding-closeout.md) | Pending |
| 5 | [Verification](./phase-05-verification.md) | Pending |

## Dependencies

- Phase 2 and Phase 3 depend on Phase 1 (shared helper with memory storage default).
- Phase 4 depends on Phase 2 and Phase 3 (code changes must be in place before closeout).
- Phase 5 depends on Phase 4.
- `plans/260619-2246-phase-d-plan-2-storage` is completed; this plan's changes to `with-mcp-server.js` are a follow-up refactor, not a blocker.

## Acceptance Criteria

- [ ] `pnpm test` no longer deadlocks on the four affected test files.
- [ ] All hand-rolled JSON-RPC MCP clients are removed from tests and the Droid hook.
- [ ] `tools/learning-loop-mastra/__tests__/with-mcp-server.js` defaults to `MASTRA_STORAGE_DRIVER=memory`.
- [ ] `package.json` `test` script includes `--test-timeout=30000`.
- [ ] `meta-260621T1743Z` is updated with the correct root cause and `evidence_test` path and resolved.
- [ ] Full `pnpm test` completes without deadlock.

## Open Questions

1. Should `MASTRA_STORAGE_DRIVER=memory` be overridable per call, or a hard default in the helper?
2. Should the Droid hook SDK conversion retain the exact 10s timeout, or can it use the SDK's built-in request timeout?
3. Do we need a `meta_state_log_change` entry for the transport-layer migration, or is resolving the finding sufficient?
