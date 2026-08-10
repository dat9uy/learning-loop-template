# Baseline counts (frozen 2026-08-10, HEAD 0dee3e44)

## Test file inventory
| Scope | Count |
|---|---|
| `__tests__/legacy-mcp/` test files | 172 |
| `__tests__/` test files (incl. legacy) | 277 |
| `core/` colocated test files | 23 |
| `tools/handlers/` colocated test files | 3 |
| `.claude/coordination/__tests__/` | 7 |
| `.factory/hooks/__tests__/` | 2 |
| `tools/scripts/__tests__/` | 13 |
| repo total (excl. `product/`) | 335 |

## `pnpm test:unit` baseline (2026-08-10 09:57 UTC)
- Test Files: 295 passed | 1 skipped (296)
- Tests: 3197 passed | 4 skipped (3201)
- Exit code: 0
- Duration: ~52s

## Tier classification of the 172 legacy files
- unit: 40
- integration: 109
- e2e: 23

## Generated/disposable artifacts present at baseline
- `coverage/` (from e2e/full runs; disposable, gitignored)
- `.test-logs/vitest-results.json` (gitignored)
- `.loop/runtime-state-local.jsonl` (existing sidecar)
