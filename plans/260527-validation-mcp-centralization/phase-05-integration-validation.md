---
phase: 5
title: "Integration Validation"
status: completed
priority: P1
effort: "1h"
dependencies: [4]
---

# Phase 5: Integration Validation

## Overview

Run the full `pnpm check` pipeline, verify all tests pass, and confirm zero references to old paths. Write a journal entry documenting the change.

## Implementation Steps

1. Run `pnpm check`:
   ```bash
   pnpm generate:capabilities --dry-run
   pnpm validate:records
   pnpm validate:plan-loop
   pnpm test
   ```
2. Run standalone verification commands:
   ```bash
   pnpm validate:records
   pnpm validate:records --allow-disallowed-fixtures
   pnpm test
   ```
3. Verify directory state:
   ```bash
   test -d tools/validate-records && echo "FAIL: old dir exists" || echo "PASS"
   test -d fixtures/negative && echo "FAIL: root fixtures exist" || echo "PASS"
   test -d tools/learning-loop-mcp/fixtures/negative && echo "PASS" || echo "FAIL"
   ```
4. Verify MCP tool directly:
   ```bash
   node -e "
   import { Client } from '@modelcontextprotocol/sdk/client/index.js';
   import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
   const t = new StdioClientTransport({ command: 'node', args: ['tools/learning-loop-mcp/server.js'] });
   const c = new Client({ name: 'test', version: '0.1.0' });
   await c.connect(t);
   const r = await c.callTool('index_validate', { include_negative_fixtures: true });
   const parsed = JSON.parse(r.content[0].text);
   console.log('valid:', parsed.valid, 'records:', parsed.record_count);
   process.exit(parsed.valid ? 0 : 1);
   "
   ```
5. Run `ck plan check phase-05` and verify all prior phases are also checked.
6. Write journal entry via `/ck:journal`.

## Success Criteria

- [x] `pnpm check` passes (pre-existing `check-budget` failure only; not from this change).
- [x] `pnpm validate:records` exits 0.
- [x] `pnpm validate:records --allow-disallowed-fixtures` exits 0.
- [x] `pnpm test` passes (25/25 MCP tests pass; pre-existing `check-budget` failure unchanged).
- [x] `tools/validate-records/` does not exist.
- [x] `fixtures/` at repo root does not exist.
- [x] MCP `index_validate` tool imports from `../core/` and has `include_negative_fixtures` param.
- [x] Zero imports referencing `tools/validate-records/` in active JS code.
- [x] All dependent files updated: `verify-claim.js`, `extract-index.test.js`, `source-ref-validator.js`.
