---
phase: 1
title: "Measurement baseline"
date: "2026-08-03"
---

# Phase 1 — Measurement baseline

## Test file inventory

- Total test files in vitest include glob: **300** (299 passed + 1 skipped, vitest summary).
- Total tests: **2832 passed**, 4 skipped (2836 total).
- e2e files (matching `connectMcpServer|with-mcp-server`): **19**.
- Confirmed missing parallel runner: `tools/scripts/run-pnpm-test-namespaced.mjs` is absent (deleted 2026-07-13 per vitest-migration closeout). `pnpm test` is plain serial `vitest run` — no runner to resurrect.

## Timing matrix (vitest 4.1.10, Node 24)

| Run   | Coverage | Vitest duration | Wall-clock     | Tests                |
|-------|----------|-----------------|----------------|----------------------|
| Cold  | istanbul | 153.55s         | 2:35.04        | 2832 passed          |
| Warm  | istanbul | 153.55s         | 2:35.10        | 2832 passed          |
| Off   | disabled | 134.47s         | 2:15.62        | 2832 passed          |

Vitest breakdown (cold): transform 20.18s, import 71.46s, tests 294.72s.
Vitest breakdown (coverage-off): transform 7.70s, import 48.74s, tests 283.28s.

## Cost isolation

- **Coverage transform tax:** 153.55 − 134.47 = **19.08s** (matches plan's ~18s estimate).
- **Warm-cache delta:** 0s. Vite transform cache is irrelevant here — vitest's import phase and per-test execution dominate.
- **Dominant remaining cost:** `tests 283s` summed across workers (per-worker wall ≈ 150–180s). The ~19 e2e files each spend 1–4s on `connectMcpServer` / `loop.mjs` subprocess startup.

## Scope decision

- Coverage-off alone saves ~19s, leaves ~135s of test-execution cost → insufficient.
- Tiering required: pre-commit runs only unit (no e2e spawn), pre-push runs the full suite.
- **Proceed with Phase 2 as written** (explicit e2e list + guard test).

## e2e file list (19 files)

```
.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs
tools/learning-loop-mastra/__tests__/agent-parity.test.cjs
tools/learning-loop-mastra/__tests__/cli-mcp-subset-registration.test.js
tools/learning-loop-mastra/__tests__/cli-read-parity.test.js
tools/learning-loop-mastra/__tests__/cli-write-parity.test.js
tools/learning-loop-mastra/__tests__/connect-mcp-server-mutex.test.js
tools/learning-loop-mastra/__tests__/legacy-mcp/change-log-operation-envelope.test.js
tools/learning-loop-mastra/__tests__/legacy-mcp/loop-get-instruction.test.js
tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-list-id-stdio.test.js
tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-patch-derived-schema.test.js
tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-patch-entry-kind-invariant.test.js
tools/learning-loop-mastra/__tests__/legacy-mcp/zod-coerce-top-level.test.js
tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js
tools/learning-loop-mastra/__tests__/mcp-wire-budget.test.js
tools/learning-loop-mastra/__tests__/meta-state-patch-jit-payload.test.js
tools/learning-loop-mastra/__tests__/mutex-scope.test.js
tools/learning-loop-mastra/__tests__/server-runid.test.js
tools/learning-loop-mastra/__tests__/storage-parity.test.cjs
tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs
```

Markers used: `connectMcpServer` (server-spawning call) OR `with-mcp-server` (import path of the MCP-server helper). Excluded false positives: `mcp-config.test.js` mentions `server.js` in a comment but only parses JSON config (no actual spawn).

The Phase 2 guard test will reuse the same grep pattern to assert the e2e project's `include` set stays in lockstep with this derived list — drift becomes a loud failure, not a silent slowdown.
