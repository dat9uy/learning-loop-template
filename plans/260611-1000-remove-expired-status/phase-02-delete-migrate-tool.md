---
phase: 2
title: 'Delete migrate tool, script, runbook, and manifest entries'
status: completed
priority: P2
effort: 30m
dependencies:
  - 1
---

# Phase 2: Delete migrate tool, script, runbook, and manifest entries

## Overview

After Phase 1 retargets the cascade to `stale` and removes the import of `metaStateMigrateExpiredToStaleTool` from the resolve handler, the migrate tool itself is no longer needed. Delete the tool file, the one-shot migration script, the operator runbook, the manifest entry, and the agent-manifest entry. Also delete the test file for the migrate tool and the `loop_describe` warm-tier advisory that surfaces the `expired` migration backlog (no backlog to surface — count is 0).

## Requirements

- Functional:
  - `tools/learning-loop-mcp/tools/meta-state-migrate-expired-to-stale-tool.js` is deleted.
  - `tools/learning-loop-mcp/__tests__/meta-state-migrate-expired-to-stale-tool.test.js` is deleted.
  - `tools/learning-loop-mcp/tools/manifest.json` line 56 (the tool registration `{ "file": "./tools/meta-state-migrate-expired-to-stale-tool.js", "export": "metaStateMigrateExpiredToStaleTool" }`) is deleted.
  - `tools/learning-loop-mcp/agent-manifest.json` line 90 (`"meta_state_migrate_expired_to_stale"` in the `tools` array of the `mcp` group) is deleted.
  - `scripts/migrate-expired-to-stale.mjs` is deleted.
  - `plans/260610-2100-meta-state-relationship-modeling/runbooks/expired-migration.md` is deleted (the runbook was a one-shot guide; the migration is complete and the tool is gone).
  - `tools/learning-loop-mcp/tools/loop-describe-tool.js:77-88` (the `pending_expired_migration` warm-tier advisory block) is deleted.
- Non-functional:
  - No dangling imports: `grep -rn "meta-state-migrate-expired-to-stale-tool" tools/ scripts/ 2>/dev/null` returns 0 matches after this phase.
  - `pnpm test` passes (modulo the test files Phase 3 will rewrite).
  - The MCP server starts successfully (no missing module error from the deleted file).

## Architecture

### Why the deletions are safe

- The tool is unreferenced after Phase 1's import removal in `meta-state-resolve-tool.js`.
- The script (`scripts/migrate-expired-to-stale.mjs`) was a one-shot runner of the tool; it ran successfully on 2026-06-11 (commit `4be590f` is the post-migration commit). No new `expired` findings will ever be created, so the script is useless.
- The runbook documents a procedure for migrating the 13 historical entries; that procedure is complete and the runbook is obsolete.
- The `loop_describe` warm-tier advisory (`pending_expired_migration`) is computed from `allEntries.filter((e) => e.entry_kind === "finding" && e.status === "expired")`; with the enum change in Phase 1, no entry can have `status: "expired"`, so the filter is always empty and the advisory block is dead code.
- The test file (`__tests__/meta-state-migrate-expired-to-stale-tool.test.js`) tests the tool that's being deleted.

### Why we delete the test file

The test file is 100% coupled to the tool: it imports `metaStateMigrateExpiredToStaleTool`, exercises its handler, and asserts its return shape. After the tool is deleted, the test file fails to import. There is no value in keeping the test file around as a historical reference (the change-log entry for the ship records the design); delete it cleanly.

## Related Code Files

### Modify
- `tools/learning-loop-mcp/tools/manifest.json` — remove line 56
- `tools/learning-loop-mcp/agent-manifest.json` — remove line 90 (the `"meta_state_migrate_expired_to_stale"` string in the `tools` array)
- `tools/learning-loop-mcp/tools/loop-describe-tool.js` — remove lines 77-88 (the `pending_expired_migration` block)

### Delete
- `tools/learning-loop-mcp/tools/meta-state-migrate-expired-to-stale-tool.js`
- `tools/learning-loop-mcp/__tests__/meta-state-migrate-expired-to-stale-tool.test.js`
- `scripts/migrate-expired-to-stale.mjs`
- `plans/260610-2100-meta-state-relationship-modeling/runbooks/expired-migration.md`

## Implementation Steps

1. **Verify no dangling references**: `grep -rln 'meta-state-migrate-expired-to-stale-tool\|metaStateMigrateExpiredToStaleTool\|meta_state_migrate_expired_to_stale\|migrate-expired-to-stale\|migrate_expired_to_stale' tools/ scripts/ AGENTS.md .factory/ docs/ 2>/dev/null`. The expected hits are the 5 files in this phase's file list plus 1 hit in `AGENTS.md:199` (the cross-reference script — that's Phase 4's edit) plus 4+ hits in `docs/journals/260609-stale-flag-redesign*.md` and `plans/260610-2100-meta-state-relationship-modeling/plan.md` (historical, leave). The live code paths should only have references inside the files being deleted and the 1 AGENTS.md hit.
2. **Delete `tools/learning-loop-mcp/tools/meta-state-migrate-expired-to-stale-tool.js`**.
3. **Delete `tools/learning-loop-mcp/__tests__/meta-state-migrate-expired-to-stale-tool.test.js`**.
4. **Edit `tools/learning-loop-mcp/tools/manifest.json`**: remove the line `{ "file": "./tools/meta-state-migrate-expired-to-stale-tool.js", "export": "metaStateMigrateExpiredToStaleTool" },` and reformat the surrounding JSON.
5. **Edit `tools/learning-loop-mcp/agent-manifest.json`**: remove `"meta_state_migrate_expired_to_stale"` from the `tools` array of the `mcp` group. Reformat the surrounding JSON.
6. **Delete `scripts/migrate-expired-to-stale.mjs`**.
7. **Delete `plans/260610-2100-meta-state-relationship-modeling/runbooks/expired-migration.md`**.
8. **Edit `tools/learning-loop-mcp/tools/loop-describe-tool.js`**: remove the `pending_expired_migration` block at lines 77-88 (the `if (expired.length > 0) { ... }` block). Leave a 1-line comment `// No expired-status advisory; status was removed in plan 260611-1000-remove-expired-status.`.
9. **Run `pnpm test -t 'meta-state-list-compact|loop-describe-warm-tier|meta-state-resolve-cascade'`** to confirm the deletions didn't break the remaining tests.
10. **Start the MCP server** (`node tools/learning-loop-mcp/server.js &` then `kill %1` after 2s) to confirm it boots without missing-module errors.
11. **Commit** with message: `chore(meta-state): delete migrate tool + script + runbook (phase 2)`.

## Success Criteria

- [ ] `ls tools/learning-loop-mcp/tools/meta-state-migrate-expired-to-stale-tool.js 2>&1` reports "No such file or directory".
- [ ] `ls scripts/migrate-expired-to-stale.mjs 2>&1` reports "No such file or directory".
- [ ] `grep -n 'meta_state_migrate_expired_to_stale\|metaStateMigrateExpiredToStaleTool' tools/learning-loop-mcp/tools/manifest.json tools/learning-loop-mcp/agent-manifest.json tools/learning-loop-mcp/tools/loop-describe-tool.js` returns 0 matches.
- [ ] `grep -rn 'pending_expired_migration' tools/learning-loop-mcp/tools/loop-describe-tool.js tools/learning-loop-mcp/__tests__/` returns 0 matches (the test in `loop-describe-warm-tier.test.js:84-111` will be removed in Phase 3; if Phase 3 has not yet run, the test still references the deleted block, but the test is also being deleted, so this is fine).
- [ ] `pnpm test -t 'meta-state-list-compact|loop-describe-warm-tier|meta-state-resolve-cascade'` passes.

## Risk Assessment

- **Risk**: the agent-manifest has a non-trivial JSON shape; removing one string from a `tools` array is straightforward, but the reformatting must preserve the JSON structure.
- **Mitigation**: use `node -e` to validate the JSON after the edit (`node -e "JSON.parse(require('fs').readFileSync('tools/learning-loop-mcp/agent-manifest.json', 'utf8'))"`). Use the same check for `tools/manifest.json`.
- **Risk**: the MCP server is started by `loop-surface-inject.cjs` at session start; a missing module error would prevent all MCP tools from loading.
- **Mitigation**: the start-server sanity check in step 10 catches this before commit. The Phase 1 test (`meta-state-resolve-cascade-stale.test.js`) also exercises the resolve tool's import chain, so a missing import would fail that test.
