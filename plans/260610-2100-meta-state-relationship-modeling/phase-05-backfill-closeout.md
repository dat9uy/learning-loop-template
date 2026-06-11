---
phase: 5
title: "Backfill + E2E Cold-Session Replay + Closeout"
status: pending
priority: P2
effort: "1.5h"
dependencies: ["phase-04-cascade-sweep"]
---

# Phase 5: Backfill + E2E Cold-Session Replay + Closeout

## Overview

Final phase. Closes the loop by (a) writing the E2E cold-session replay test that exercises the full "X is related to Y" script against the live registry, gated on `META_STATE_E2E=1`; (b) running the full test suite to confirm no regressions; (c) operator-side backfill of the 13 currently-expired findings (this is the plan's success criterion: the new tool is reachable for all 13; the operator invokes it on their schedule); (d) updating the warm-tier advisory to surface the backlog; (e) writing the closeout journal.

## Requirements

### Functional

**(a) E2E cold-session replay test:**
- New file: `tools/learning-loop-mcp/__tests__/meta-state-reopen-e2e-cold-session.test.cjs`.
- Gated on `process.env.META_STATE_E2E === "1"` (default off, opposite of `SKIP_REAL_REGISTRY_TESTS=1`).
- Before mutating the live registry, asserts that the 2 fixture IDs do not already exist:
  - `meta-260608T1522Z-test-1-cold-session-hangs-in-mcp-gapped-env`
  - `meta-260608T1618Z-corrected-diagnosis-for-meta-260608t1522z-test-1-cold-sessio`
  - If they do, abort with a clear "live registry already has these ids; rerun with META_STATE_E2E=1 to allow mutation, or update the test to use temp copies via GATE_ROOT".
- Replays the session-bug scenario from c319eb97:
  1. `meta_state_relationship_validate({ description: '...new finding description with both ids...' })` → returns `warned: true, orphans: [...]`.
  2. `meta_state_report({ ..., reopens: ['<id_1>', '<id_2>'] })` → persists the new entry.
  3. For each expired finding, `meta_state_migrate_expired_to_stale({id})` → returns `migrated: true`.
  4. `meta_state_relationships({id: '<id_1>', direction: "inbound"})` → returns `reopened_by: ['<new_finding_id>']`.
  5. `meta_state_resolve({id: '<id_1>', cascade_from: ['<new_finding_id>']})` → returns `migrated_via_cascade: true, status: "stale"`.
  6. `meta_state_resolve({id: '<id_1>'})` → applies consult-gate, transitions to `resolved`.
- After the test, cleans up: removes the new entry; restores the 2 expired parents to their original status (or accepts that they're now `stale` and notes the change in the test's teardown log).
- Assertions:
  - `reopens_inverse` has both old ids mapped to the new id.
  - `loop_describe({tier: "cold"})` includes the new finding in `top_references`.
  - All 5 steps return expected shapes.

**(b) Full test suite:**
- Run `pnpm test` (or whatever the project's full test command is). All existing tests pass.
- Run `pnpm test:cold-session`. Passes (L2 probe flakiness aside; not blocked by this plan).
- Total test count increases by ~12-15 (3 in Phase 1 + 5 in Phase 2 + 5 in Phase 3 + 1 cascade in Phase 4 + 1 hook-drift in Phase 4 + ~1 E2E stub in Phase 5).

**(c) Operator-side backfill:**
- This is NOT a code step. It's an operator decision + action.
- Plan records the backfill as the plan's completion criterion (per D7).
- The plan ships the mechanism (Phase 2 tool, Phase 4 cascade delegation); operator runs the tool on each of the 13 expired findings.
- The plan's success metric is "the new tool is reachable for all 13 currently-expired findings" (i.e., the tool can be called for each id and produces the expected migration). Operator's choice when to actually invoke.

**(d) Warm-tier advisory for backlog:**
- Add a small block to `loop-describe-tool.js` that, when `tier: "warm"` and `expired_count > 0` AND `expired.oldest_age > 7d`, surfaces a `pending_expired_migration` advisory line in the `discoverability_hints` block (or as a separate `advisories` field).
- The advisory text: `"Pending expired migration: <N> expired findings predate the stale redesign. Run meta_state_migrate_expired_to_stale per finding to bring them into the new lifecycle."`

**(e) Closeout journal:**
- Run `/ck:journal` to capture the closeout, the 2 new tools, the cascade rewire, the 11th hint, and the operator backfill plan.
- The journal entry cites the gap report, the brainstorm, the plan, and the 4 atomic changes.

### Non-functional
- E2E test is gated; default behavior is `test.skip` (no-op).
- Operator backfill is a documented runbook, not a code change.
- Journal entry is auto-suggested at plan completion; not a hard requirement.

## Architecture

**(a) E2E test design:**

The test follows the precedent of `__tests__/meta-state-reopen-backfill-integration.test.js` (a `test.skip` that runs only on opt-in). The new test is more elaborate: it's a multi-step scenario, not a single assertion.

The test uses the live registry (`resolveRoot()` defaults to cwd). Before mutating, it reads the live registry and asserts the 2 fixture IDs do not already exist. If they do, the test aborts (no mutation). If they don't, the test runs the full script.

The test cleanup is best-effort: the new finding is removed from the registry, and the 2 expired parents are restored to `expired` status (via a direct `updateEntry` call with the right patch, but bypassing `meta_state_resolve` to avoid the consult-gate). If the test fails mid-way, the cleanup is still attempted (in a `finally` block).

**(c) Operator backfill runbook:**

A `plans/260610-2100-meta-state-relationship-modeling/runbooks/expired-migration.md` document with:
- The 13 expired finding ids (read from the live registry at plan-time).
- The exact tool call for each (a script that loops over the ids and invokes `meta_state_migrate_expired_to_stale`).
- The expected outcome (each becomes `stale`; the agent can then re-verify or close via `meta_state_resolve`).
- A note that this is operator-side work; the plan's success criterion is "the tool is reachable for all 13," not "0 expired remaining."

The runbook is not a code file; it's a markdown file the operator can reference.

**(d) Warm-tier advisory implementation:**

In `tools/learning-loop-mcp/tools/loop-describe-tool.js`, find where the warm-tier payload is built. Add a `pending_expired_migration` field if conditions are met:

```js
if (tier === "warm") {
  const entries = readRegistry(root);
  const expired = entries.filter((e) => e.entry_kind === "finding" && e.status === "expired");
  if (expired.length > 0) {
    const oldestAge = Math.max(...expired.map((e) => Date.now() - new Date(e.created_at).getTime()));
    if (oldestAge > 7 * 24 * 60 * 60 * 1000) {
      payload.pending_expired_migration = {
        count: expired.length,
        oldest_age_days: Math.floor(oldestAge / (24 * 60 * 60 * 1000)),
        hint: `Run meta_state_migrate_expired_to_stale per finding. See plans/260610-2100-meta-state-relationship-modeling/runbooks/expired-migration.md`,
      };
    }
  }
}
```

Add a corresponding test in `__tests__/loop-describe-warm-tier.test.js` that:
- Creates a temp registry with 1 expired entry older than 7 days.
- Calls `loop_describe({tier: "warm"})`.
- Asserts `parsed.pending_expired_migration` is present with `count: 1, oldest_age_days: >= 7`.

## Related Code Files

### Create
- `tools/learning-loop-mcp/__tests__/meta-state-reopen-e2e-cold-session.test.cjs` — gated E2E (~75 lines).
- `plans/260610-2100-meta-state-relationship-modeling/runbooks/expired-migration.md` — operator runbook (~50 lines).

### Modify
- `tools/learning-loop-mcp/tools/loop-describe-tool.js` — add `pending_expired_migration` advisory.
- `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js` — add test for `pending_expired_migration`.

### Read-only
- (Phase 5 produces no further code; the operator invokes `meta_state_migrate_expired_to_stale` 13 times via the runbook.)

## Implementation Steps

### Step 1: E2E cold-session replay test (TDD)

#### Step 1a: Stub the test (default: skip)

```js
// File: tools/learning-loop-mcp/__tests__/meta-state-reopen-e2e-cold-session.test.cjs
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRegistry } from "../core/meta-state.js";

const FIXTURE_IDS = [
  "meta-260608T1522Z-test-1-cold-session-hangs-in-mcp-gapped-env",
  "meta-260608T1618Z-corrected-diagnosis-for-meta-260608t1522z-test-1-cold-sessio",
];

// Real-registry test — gated. The operator runs this AFTER implementing the
// new tools (Phase 2 + 3) and rewiring the cascade (Phase 4).
test.skip("e2e: cold-session 'X is related to Y' script", async () => {
  if (process.env.META_STATE_E2E !== "1") return;

  // Use a temp GATE_ROOT to isolate the test from the live registry.
  const tempRoot = mkdtempSync(join(tmpdir(), "e2e-cold-session-"));
  process.env.GATE_ROOT = tempRoot;
  try {
    // ... (full scenario)
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
    delete process.env.GATE_ROOT;
  }
});
```

The actual scenario body is filled in during implementation; for now, the stub is the placeholder.

#### Step 1b: Write the full scenario

**Pre-flight assertion** (mandatory): if `META_STATE_E2E === "1"` AND `GATE_ROOT` is not set, throw an error to prevent live-registry mutation:
```js
if (process.env.META_STATE_E2E === "1" && !process.env.GATE_ROOT) {
  throw new Error("E2E test requires GATE_ROOT to be set; aborting to prevent live-registry mutation. Set GATE_ROOT to a temp dir.");
}
```

**Full scenario** (all mutations against the temp GATE_ROOT, not the live registry):
1. Read the live registry (read-only) to get the 2 fixture descriptions (so the test uses real text). Do not mutate the live registry.
2. In the temp GATE_ROOT, write the 2 fixtures as `expired` findings.
3. Call `meta_state_relationship_validate({ description: 'related to <id_1> and <id_2>' })`. Assert `warned: true, orphans: [id_1, id_2]`.
4. Call `meta_state_report({ ..., reopens: [id_1, id_2] })`. Capture the new id.
5. For each fixture, call `meta_state_migrate_expired_to_stale({id})`. Assert `migrated: true`.
6. Call `meta_state_relationships({id: id_1, direction: "inbound"})`. Assert `reopened_by: [<new_id>]`.
7. Call `meta_state_resolve({id: id_1, cascade_from: [<new_id>]})`. Assert `migrated_via_cascade: true, status: "stale"`.
8. Call `meta_state_resolve({id: id_1})`. Assert the consult-gate runs (or asserts `resolved: true` if no rules gate).
9. Cleanup: remove the temp GATE_ROOT (the `after()` hook rmSync's it). The live registry is untouched.

### Step 2: Operator-side runbook

Create `plans/260610-2100-meta-state-relationship-modeling/runbooks/expired-migration.md`:

```markdown
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
| ... (11 more) |

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
  // ... 11 more
];

for (const id of ids) {
  const result = await metaStateMigrateExpiredToStaleTool.handler({ id });
  console.log(id, JSON.parse(result.content[0].text));
}
```

## Notes

- The migration is one-way. `expired → stale` only. No `stale → expired` reverse.
- The 24h TTL is cleared (`expires_at: null`). The new `STALENESS_WINDOW_MS` (7 days) applies.
- Each migration stamps `last_verified_at: <now>`. The next 7-day window starts now.
- The migration tool does NOT pass through the `resolution-evidence-required` consult-gate. The gate applies when you later close the entry via `meta_state_resolve`.
```

### Step 3: Warm-tier advisory

In `tools/learning-loop-mcp/tools/loop-describe-tool.js`, add the `pending_expired_migration` block (per Architecture section above).

Add a test in `__tests__/loop-describe-warm-tier.test.js`:

```js
test("warm tier surfaces pending_expired_migration advisory when backlog > 7d", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "warm-advisory-test-"));
  process.env.GATE_ROOT = tempRoot;
  try {
    // Write an expired finding older than 7 days
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    writeFileSync(
      join(tempRoot, "meta-state.jsonl"),
      JSON.stringify({
        id: "meta-old-expired",
        entry_kind: "finding",
        status: "expired",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Old expired finding for advisory test (min 20 chars)",
        created_at: oldDate,
        expires_at: oldDate,
        version: 0,
      }) + "\n",
      "utf8",
    );

    const result = await loopDescribeTool.handler({ tier: "warm" });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.pending_expired_migration);
    assert.equal(parsed.pending_expired_migration.count, 1);
    assert.ok(parsed.pending_expired_migration.oldest_age_days >= 7);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
    delete process.env.GATE_ROOT;
  }
});
```

### Step 4: Run full test suite

```bash
pnpm test
pnpm test:cold-session
```

Confirm:
- All existing tests pass.
- New tests pass.
- No regressions in the cold-session test (it tests the L2 probe + meta_state_report + record_create_decision chain; the new `reopens` field on report should be transparent to it).
- Hook drift prevention test passes.

### Step 5: Operator-side backfill (runbook execution)

The operator (or a delegated agent) runs the runbook script. This is NOT a code step; it's an action on the live registry. The plan records:
- 13 findings migrated to `stale`.
- 0 findings remaining in `expired` (per the brainstorm's completion criterion).
- Plan closes; status flips to `completed`.

### Step 6: Journal

Run `/ck:journal` to capture:
- 4 atomic changes (reopens field, migrate tool, validate tool, cascade rewire + hint + hook backfill).
- 13 expired findings migrated to `stale`.
- E2E test exercising the full script.
- Hook mirror drift closed.

## Success Criteria

- [ ] E2E test stub in place; default behavior is `test.skip`; `META_STATE_E2E=1` runs the full scenario.
- [ ] Operator runbook published at `plans/260610-2100-meta-state-relationship-modeling/runbooks/expired-migration.md`.
- [ ] Warm-tier advisory block surfaces `pending_expired_migration` when conditions met.
- [ ] Advisory test passes.
- [ ] Full `pnpm test` passes; total test count up by ~12-15.
- [ ] `pnpm test:cold-session` passes.
- [ ] Operator backfill executed; 13 findings migrated to `stale`.
- [ ] Plan status flipped to `completed`.
- [ ] Journal entry written.

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| E2E test mutates live registry in unexpected ways | The test is gated; default is skip. The cleanup `finally` block removes the new entry and restores the 2 fixtures. If cleanup fails, the test logs the leak. |
| Operator backfill takes longer than expected | The plan's success criterion is "the new tool is reachable for all 13" — not "0 expired remaining." The plan can close with the runbook published and the operator deciding when to run it. |
| Warm-tier advisory is noisy (always shows even when backlog is small) | The advisory only fires when `oldest_age > 7d`. New expirations (< 7d old) don't surface. Operator can ignore the advisory when the backlog is fresh. |
| `loop-describe-tool.js` has a slow read path for the advisory | The advisory reads the registry; that's already done for other warm-tier fields. The extra filter is O(N) on expired entries only. No new I/O. |
| Journal entry drift from the plan | The journal entry is auto-suggested; if the operator skips it, the plan still closes. The journal is a documentation tool, not a correctness gate. |
| Hook-mirror drift re-emerges | Drift prevention test in Phase 4 catches it. Plan-time decision D6 confirms. |
