# Plan completion: GH-2246 MCP stdio SDK conversion

## Plan

`plans/260621-2223-GH-2246-mcp-stdio-sdk-conversion/plan.md`

## Status

Completed.

## Phase summary

| Phase | Status | Key result |
|-------|--------|------------|
| 1: Prepare shared helper | completed | `with-mcp-server.js` defaults to `MASTRA_STORAGE_DRIVER=memory`; optional `env` override added |
| 2: Rewrite MCP stdio tests with SDK | completed | 5 tests converted; ~1,100 lines of hand-rolled JSON-RPC removed |
| 3: Refactor Droid hook to SDK client | completed | `.factory/hooks/loop-surface-inject.cjs` uses `@modelcontextprotocol/sdk Client` |
| 4: Runner hardening and finding closeout | completed | `--test-timeout=30000` added; `meta-260621T1743Z` resolved |
| 5: Verification | completed | Full `pnpm test` green |

## Test results

- Focused rewritten MCP tests: 32/32 pass
- `.factory/hooks/__tests__/`: 13/13 pass
- Full `pnpm test`: 1114 pass / 0 fail / 1 skipped
- No deadlock observed

## Files changed

- `tools/learning-loop-mastra/__tests__/with-mcp-server.js`
- `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs`
- `tools/learning-loop-mcp/__tests__/loop-get-instruction.test.js`
- `tools/learning-loop-mcp/__tests__/meta-state-patch-derived-schema.test.js`
- `tools/learning-loop-mcp/__tests__/zod-coerce-top-level.test.js`
- `tools/learning-loop-mcp/__tests__/meta-state-list-id-stdio.test.js`
- `.factory/hooks/loop-surface-inject.cjs`
- `package.json`
- `tools/learning-loop-mastra/__tests__/storage-parity.test.cjs` (env override for libsql)
- `tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs` (stale tool-count expectation relaxed)
- `meta-state.jsonl` (finding resolved)

## Open questions

1. Should a regression test be added to guard `transport._process.unref()` in the Droid hook if the SDK private field changes?
2. Should `meta_state_log_change` be filed for the transport-layer migration, or is resolving the finding sufficient?
