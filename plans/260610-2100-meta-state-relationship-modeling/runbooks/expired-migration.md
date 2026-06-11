# Expired migration runbook

**Status**: OPTIONAL. The plan ships the mechanism; the operator runs it on their schedule.
**Plan**: 260610-2100-meta-state-relationship-modeling
**Source brainstorm**: plans/reports/brainstorm-260610-2100-meta-state-relationship-modeling-report.md

## The 13 currently-expired findings

(Read from meta-state.jsonl at plan-time; refresh as needed.)

| # | id | created_at |
|---|----|----|
| 1 | meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois | 2026-06-06T11:30:38.791Z |
| 2 | meta-260606T2102Z-agent-used-direct-file-i-o-node-e-scripts-importing-core-met | 2026-06-06T14:02:05.417Z |
| 3 | meta-260606T2106Z-agent-called-meta-state-log-change-mcp-tool-5-times-in-succe | 2026-06-06T14:06:20.751Z |
| 4 | meta-260606T2202Z-top-level-array-and-boolean-parameters-in-mcp-tool-schemas-g | 2026-06-06T15:02:15.475Z |
| 5 | meta-260607T0843Z-claude-code-mcp-test-added | 2026-06-07T01:43:12.961Z |
| 6 | meta-260608T1522Z-test-1-cold-session-hangs-in-mcp-gapped-env | 2026-06-08T08:22:55.802Z |
| 7 | meta-260608T1618Z-corrected-diagnosis-for-meta-260608t1522z-test-1-cold-sessio | 2026-06-08T09:18:05.768Z |
| 8 | meta-260608T1746Z-test-product-web-tests-smoke-reference-test-mjs-line-4-impor | 2026-06-08T10:46:13.341Z |
| 9 | meta-260608T1746Z-test-product-web-tests-smoke-reference-test-mjs-line-5-impor | 2026-06-08T10:46:13.342Z |
| 10 | meta-260608T1746Z-test-product-web-tests-smoke-reference-test-mjs-line-6-impor | 2026-06-08T10:46:13.344Z |
| 11 | meta-260608T1746Z-test-product-web-tests-smoke-reference-test-mjs-line-7-impor | 2026-06-08T10:46:13.346Z |
| 12 | meta-260608T1746Z-test-tools-check-budget-check-budget-function-test-js-line-6 | 2026-06-08T10:46:13.348Z |
| 13 | meta-260608T1746Z-test-tools-learning-loop-mcp-tools-delete-record-tool-test-j | 2026-06-08T10:46:13.533Z |

## Migration script

For each id above:

```
mcp__learning_loop_mcp__meta_state_migrate_expired_to_stale({ id: '<id>' })
```

The expected response is `{ migrated: true, status: "stale", last_verified_at: <now> }`.

## After migration

Each entry is now `stale`. The operator can:
- Re-verify via `meta_state_re_verify({ id })`.
- Close via `meta_state_resolve({ id, resolution: "...", resolved_by: "operator" })`.
- Or leave as `stale` for future review.

## Bulk script (Node)

```js
import { metaStateMigrateExpiredToStaleTool } from "./tools/learning-loop-mcp/tools/meta-state-migrate-expired-to-stale-tool.js";

const ids = [
  "meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois",
  "meta-260606T2102Z-agent-used-direct-file-i-o-node-e-scripts-importing-core-met",
  "meta-260606T2106Z-agent-called-meta-state-log-change-mcp-tool-5-times-in-succe",
  "meta-260606T2202Z-top-level-array-and-boolean-parameters-in-mcp-tool-schemas-g",
  "meta-260607T0843Z-claude-code-mcp-test-added",
  "meta-260608T1522Z-test-1-cold-session-hangs-in-mcp-gapped-env",
  "meta-260608T1618Z-corrected-diagnosis-for-meta-260608t1522z-test-1-cold-sessio",
  "meta-260608T1746Z-test-product-web-tests-smoke-reference-test-mjs-line-4-impor",
  "meta-260608T1746Z-test-product-web-tests-smoke-reference-test-mjs-line-5-impor",
  "meta-260608T1746Z-test-product-web-tests-smoke-reference-test-mjs-line-6-impor",
  "meta-260608T1746Z-test-product-web-tests-smoke-reference-test-mjs-line-7-impor",
  "meta-260608T1746Z-test-tools-check-budget-check-budget-function-test-js-line-6",
  "meta-260608T1746Z-test-tools-learning-loop-mcp-tools-delete-record-tool-test-j",
];

for (const id of ids) {
  const result = await metaStateMigrateExpiredToStaleTool.handler({ id });
  console.log(id, JSON.parse(result.content[0].text));
}
```

## Notes

- The migration is one-way. `expired -> stale` only. No `stale -> expired` reverse.
- The 24h TTL is cleared (`expires_at: null`). The new `STALENESS_WINDOW_MS` (7 days) applies.
- Each migration stamps `last_verified_at: <now>`. The next 7-day window starts now.
- The migration tool does NOT pass through the `resolution-evidence-required` consult-gate. The gate applies when you later close the entry via `meta_state_resolve`.
