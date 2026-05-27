---
phase: 5
title: "Integration Validation"
status: pending
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

- [ ] `pnpm check` exits 0.
- [ ] `pnpm validate:records` exits 0.
- [ ] `pnpm validate:records --allow-disallowed-fixtures` exits 0.
- [ ] `pnpm test` exits 0.
- [ ] `tools/validate-records/` does not exist.
- [ ] `fixtures/` at repo root does not exist.
- [ ] MCP direct call to `index_validate` with `include_negative_fixtures: true` returns `valid: true`.
- [ ] Journal entry written in `docs/journals/`.
