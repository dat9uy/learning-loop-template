---
phase: 6
title: "Schema Fingerprint Test"
status: pending
effort: "~30min"
---

# Phase 6: Schema Fingerprint Test

## Overview

Add `tools/learning-loop-mastra/__tests__/schema-fingerprint.test.cjs` asserting `data/mastra-memory.db` table list + column counts match a snapshot. Detects schema drift when `@mastra/libsql` is bumped past 1.13.0. Closes Plan 2 validate decision 2026-06-19 (deferred from Plan 2 closeout to Plan 1a).

## Context Links

- `plans/reports/researcher-A-260619-2246-mastra-libsql-install-api-report.md` §"Open Questions" Q5 (schema fingerprint test for Mastra storage substrate)
- `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` §"Plan 1a candidates" item 1.5 (schema fingerprint test for Mastra storage substrate — list all tables + column counts, assert against known-good baseline)
- `tools/learning-loop-mastra/__tests__/storage-parity.test.cjs` (11 existing tests; new file is sibling)
- `tools/learning-loop-mastra/storage.js` (storage factory; opens `data/mastra-memory.db`)
- `@mastra/libsql` 1.13.0 (pinned)

## Requirements

- **Functional:**
  - Create `schema-fingerprint.test.cjs` with 1 test: open `data/mastra-memory.db` (LibSQL client), query `sqlite_master` for table list + column counts, assert against inline snapshot.
  - Snapshot captures: list of table names + per-table column counts. (Per Plan 2 closeout: Mastra's LibSQL backend auto-creates `mastra_workflow_snapshot`, `mastra_evals`, `mastra_messages`, `mastra_threads`, `mastra_traces`, `mastra_observations`, `mastra_scorers`, `mastra_resources`. Column counts vary by Mastra version.)
- **Non-functional:**
  - Test runs in <200ms (LibSQL is local SQLite).
  - No new dep (uses `@libsql/client` already in `package.json`).

## Architecture

Read-only snapshot test.

| Step | Action |
|---|---|
| RED | Add test file with placeholder snapshot `[]`. Run; expect test FAILS (snapshot doesn't match actual schema). |
| GREEN | Update snapshot inline with actual table list + column counts (captured at first test run). Run; expect test PASSES. |
| VERIFY | Run full `pnpm test`; expect 1094 pass (1093 baseline + 1 new). |

## Related Code Files

- **Modify:** none
- **Create:** `tools/learning-loop-mastra/__tests__/schema-fingerprint.test.cjs` (1 test)
- **Delete:** none

## Implementation Steps

1. Read `tools/learning-loop-mastra/storage.js` (LibSQL config; confirms DB path).
2. Read `tools/learning-loop-mastra/__tests__/storage-parity.test.cjs` (existing test patterns; reuse `@libsql/client` import shape).
3. Create `schema-fingerprint.test.cjs`:
   ```js
   const test = require("node:test");
   const assert = require("node:assert/strict");
   const { createClient } = require("@libsql/client");

   const SNAPSHOT = [
     // Captured at first test run against @mastra/libsql@1.13.0; update via meta_state_log_change on schema bump.
     { name: "mastra_workflow_snapshot", columns: 8 },
     { name: "mastra_evals", columns: 6 },
     // ... (fill in actual values at first run)
   ];

   test("LibSQL schema fingerprint matches snapshot", async () => {
     const db = createClient({ url: "file:./tools/learning-loop-mastra/data/mastra-memory.db" });
     const tables = await db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
     const names = tables.rows.map((r) => r.name);
     for (const expected of SNAPSHOT) {
       assert.ok(names.includes(expected.name), `missing table: ${expected.name}`);
       const cols = await db.execute(`PRAGMA table_info(${expected.name})`);
       assert.strictEqual(cols.rows.length, expected.columns, `column count mismatch for ${expected.name}`);
     }
     await db.close();
   });
   ```
4. Run; first run captures actual schema; populate `SNAPSHOT` with real values; re-run.
5. Run full `pnpm test`; expect 1094 pass.

## Success Criteria

- [ ] `tools/learning-loop-mastra/__tests__/schema-fingerprint.test.cjs` exists.
- [ ] Test asserts table list + per-table column counts match inline snapshot.
- [ ] Snapshot captured against current `@mastra/libsql` 1.13.0.
- [ ] `pnpm test` exits 0 with 1094 pass / 0 fail / 1 skipped.

## Risk Assessment

- **Snapshot stale on `@mastra/libsql` bump.** Risk: medium. Any future bump that changes schema fails the test. Mitigation: this is the **intended behavior** — a bump that changes schema requires deliberate `meta_state_log_change` to update the snapshot (operator-gated). False positives force a schema-change review.
- **Test depends on `data/mastra-memory.db` existing.** Risk: very low. Plan 2 closeout created the file. Mitigation: if file missing, the test throws — surface and fail loudly.

## Security Considerations

None. Read-only query against local SQLite file.

## Next Steps

Phase 7: Pre-Closeout Refresh Hook (resolves fingerprint-drift finding).