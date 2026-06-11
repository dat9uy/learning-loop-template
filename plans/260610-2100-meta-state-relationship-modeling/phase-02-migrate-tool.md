---
phase: 2
title: "Migrate Tool: meta_state_migrate_expired_to_stale"
status: pending
priority: P2
effort: "1.5h"
dependencies: ["phase-01-schema-tools"]
---

# Phase 2: Migrate Tool — meta_state_migrate_expired_to_stale

## Overview

Close the legacy migration gap (Gap 2 in the gap report). Adds the `meta_state_migrate_expired_to_stale` tool: a single-id operator transition that moves an `expired` finding to the new `stale` lifecycle, clearing `expires_at` and stamping `last_verified_at: now`. One primitive, two callers (operator invokes directly; `meta_state_resolve` cascade invokes as a delegate in Phase 4).

## Requirements

### Functional
- `meta_state_migrate_expired_to_stale({ id: 'meta-...' })` validates:
  - Entry exists
  - `entry_kind === "finding"`
  - `status === "expired"`
  - `expires_at` is non-null AND `Date.now() > new Date(expires_at).getTime()` (past 24h TTL)
- On valid input, stamps:
  - `status: "stale"`
  - `expires_at: null` (TTL no longer applies)
  - `last_verified_at: <now>` (freshness anchor for `STALENESS_WINDOW_MS` = 7 days)
  - `version: entry.version + 1` (CAS-safe)
- Returns the new entry shape (id, status, last_verified_at, version).
- On invalid input, returns `{ migrated: false, reason: '<specific_reason>', id }`:
  - `not_found` — entry does not exist
  - `wrong_kind` — entry is not a finding (e.g., a change-log or rule)
  - `wrong_status` — entry is not `expired` (e.g., `active`, `resolved`, `superseded`, `auto-resolved`, `stale`)
  - `not_past_ttl` — `expires_at` is null OR `Date.now() <= new Date(expires_at).getTime()` (operator moved too fast, or the entry has a corrupted `expires_at`)

### Non-functional
- One-way only. No `stale → expired` reverse (would re-lock a now-re-verifiable entry).
- Reuses the past-TTL arithmetic from `checkExpiry()` (`core/meta-state.js:482-492`), but does NOT call `checkExpiry()` itself (it only fires for `status: "reported"`). Inline the `Date.now() > new Date(entry.expires_at).getTime()` check.
- Bypasses the `resolution-evidence-required` consult-gate. Rationale: the migration is a state-machine transition (not a resolve), so it does not pass through `meta_state_resolve`'s gate. Document this in the tool description + JSDoc.
- `appendGateLog` records the migration (operator audit trail).
- ~60 lines of handler + tests.

## Architecture

**Data flow:**
1. Operator invokes `meta_state_migrate_expired_to_stale({ id: 'meta-260606T1830Z-...' })`.
2. Handler resolves root, reads registry, finds entry.
3. Validates kind, status, TTL.
4. Builds patch: `{ status, expires_at: null, last_verified_at: <now>, version: entry.version + 1 }`.
5. Calls `updateEntry(root, id, patch)` (which handles the `enqueue` lock + file write + cache invalidation; no need to re-implement).
6. Returns new entry shape.
7. `appendGateLog` records `tool: "meta_state_migrate_expired_to_stale"`, `id`, `from_status: "expired"`, `to_status: "stale"`, `timestamp`.

**Locking:** `updateEntry` (from `core/meta-state.js`) already runs under the per-process `enqueue` lock. No additional locking needed. The `meta_state_resolve` cascade (Phase 4) calls this tool from within its own `enqueue` lock — JavaScript single-threaded, no deadlock.

**TTL math reuse:** Inline `Date.now() > new Date(entry.expires_at).getTime()`. Do NOT extract to a shared helper. Two callers, different status preconditions; the cost of a 1-line duplication is lower than the cost of a 3-branch shared helper.

**Why not call `checkExpiry()`:** The function only returns `"stale"` for `status: "reported"` past TTL. The migrate tool's preconditions are different (status must be `expired`, not `reported`). The math is the same, but the gating is different. Re-implementing the past-TTL check is correct here.

**CAS / version increment contract:** The patch includes `version: (entry.version ?? 0) + 1`. Before implementation, **read `core/meta-state.js#updateEntry` source to confirm its CAS contract.** If `updateEntry` auto-captures `_expected_version` from the pre-read AND auto-increments version on apply, the handler should NOT include `version` in the patch (let `updateEntry` increment). If `updateEntry` only checks CAS without incrementing, the handler's pre-increment is correct. Implementation step: read the source, document the contract in a code comment, and adjust the patch shape accordingly.

## Related Code Files

### Create
- `tools/learning-loop-mcp/tools/meta-state-migrate-expired-to-stale-tool.js` — the tool (~60 lines).
- `tools/learning-loop-mcp/__tests__/meta-state-migrate-expired-to-stale-tool.test.js` — 5 scenarios (~90 lines).

### Reference
- `tools/learning-loop-mcp/core/meta-state.js:482-492` — `checkExpiry()` (read for the past-TTL arithmetic; do not call).
- `tools/learning-loop-mcp/tools/meta-state-archive-tool.js` — model for a small tool with idempotent preconditions.
- `tools/learning-loop-mcp/__tests__/meta-state-archive-tool.test.js` — model for the test pattern.

## Implementation Steps

### Step 1: TDD RED — write failing tests

```js
// File: __tests__/meta-state-migrate-expired-to-stale-tool.test.js
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateMigrateExpiredToStaleTool } from "../tools/meta-state-migrate-expired-to-stale-tool.js";
import { readRegistry, writeEntry, generateId } from "../core/meta-state.js";

function makeTempRoot() {
  return mkdtempSync(join(tmpdir(), "migrate-test-"));
}

function makeExpiredFixture(root, { id, createdHoursAgo, expiresHoursAgo = 0 } = {}) {
  const now = Date.now();
  const entry = {
    id: id ?? generateId("test-fixture"),
    entry_kind: "finding",
    category: "loop-anti-pattern",
    severity: "warning",
    affected_system: "mcp-tools",
    description: "Test fixture for migration tool (min 20 chars).",
    status: "expired",
    created_at: new Date(now - createdHoursAgo * 60 * 60 * 1000).toISOString(),
    expires_at: new Date(now - expiresHoursAgo * 60 * 60 * 1000).toISOString(),
    acked_at: null,
    resolved_at: null,
    resolved_by: null,
    version: 0,
  };
  return entry;
}

describe("meta_state_migrate_expired_to_stale", () => {
  let root;

  before(() => {
    root = makeTempRoot();
    process.env.GATE_ROOT = root;
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
    delete process.env.GATE_ROOT;
  });

  // T1: happy path
  it("migrates an expired finding to stale", async () => {
    const fixture = makeExpiredFixture(root, {
      id: "meta-test-happy",
      createdHoursAgo: 48,
      expiresHoursAgo: 24,
    });
    await writeEntry(root, fixture);

    const result = await metaStateMigrateExpiredToStaleTool.handler({ id: "meta-test-happy" });
    const parsed = JSON.parse(result.content[0].text);

    assert.equal(parsed.migrated, true);
    assert.equal(parsed.id, "meta-test-happy");
    assert.equal(parsed.status, "stale");
    assert.equal(parsed.expires_at, null);
    assert.ok(parsed.last_verified_at);

    const entries = readRegistry(root);
    const updated = entries.find((e) => e.id === "meta-test-happy");
    assert.equal(updated.status, "stale");
    assert.equal(updated.expires_at, null);
    assert.equal(updated.version, 1);
  });

  // T2: wrong status (active, not expired)
  it("rejects active entries", async () => {
    const fixture = { ...makeExpiredFixture(root, { id: "meta-test-active" }), status: "active" };
    await writeEntry(root, fixture);

    const result = await metaStateMigrateExpiredToStaleTool.handler({ id: "meta-test-active" });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.migrated, false);
    assert.equal(parsed.reason, "wrong_status");
  });

  // T3: wrong kind (change-log)
  it("rejects non-finding entries", async () => {
    const changeLog = {
      id: "meta-test-changelog",
      entry_kind: "change-log",
      change_dimension: "semantic",
      change_target: "test",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "Test changelog fixture (min 20 chars)",
      status: "active",
      created_at: new Date().toISOString(),
    };
    await writeEntry(root, changeLog);

    const result = await metaStateMigrateExpiredToStaleTool.handler({ id: "meta-test-changelog" });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.migrated, false);
    assert.equal(parsed.reason, "wrong_kind");
  });

  // T4: not past TTL
  it("rejects entries that are not past TTL", async () => {
    const now = Date.now();
    const fixture = {
      ...makeExpiredFixture(root, { id: "meta-test-notpast" }),
      expires_at: new Date(now + 60 * 60 * 1000).toISOString(), // 1h in the future
    };
    await writeEntry(root, fixture);

    const result = await metaStateMigrateExpiredToStaleTool.handler({ id: "meta-test-notpast" });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.migrated, false);
    assert.equal(parsed.reason, "not_past_ttl");
  });

  // T5: missing entry
  it("rejects missing entries", async () => {
    const result = await metaStateMigrateExpiredToStaleTool.handler({ id: "meta-test-missing" });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.migrated, false);
    assert.equal(parsed.reason, "not_found");
  });
});
```

Run: `pnpm test:unit -- meta-state-migrate-expired-to-stale-tool.test.js`. All 5 tests should fail (tool doesn't exist).

### Step 2: TDD GREEN — implement the tool

```js
// File: tools/meta-state-migrate-expired-to-stale-tool.js
import { z } from "zod";
import { readRegistry, updateEntry } from "#mcp/core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const metaStateMigrateExpiredToStaleTool = {
  name: "meta_state_migrate_expired_to_stale",
  description:
    "Migrate a single `expired` finding to the new `stale` lifecycle (one-way). " +
    "The 24h TTL no longer applies (expires_at is cleared); the entry is now re-verifiable " +
    "via meta_state_re_verify and closeable via meta_state_resolve. " +
    "Preconditions: entry exists, entry_kind === 'finding', status === 'expired', " +
    "expires_at is non-null AND past. " +
    "This is a state-machine transition, not a resolve — it bypasses the `resolution-evidence-required` " +
    "consult-gate by design (the gate is for closing findings, not for migrating lifecycle). " +
    "Use when an operator wants to bring a legacy `expired` finding into the new lifecycle. " +
    "Not for fresh reports (use meta_state_report), active findings (use meta_state_re_verify), " +
    "or terminal closes (use meta_state_resolve).",
  schema: {
    id: z.string().describe("Exact id of the `expired` finding to migrate."),
  },
  handler: async ({ id }) => {
    const root = resolveRoot();
    const entries = readRegistry(root);
    const entry = entries.find((e) => e.id === id);

    if (!entry) {
      const result = { migrated: false, reason: "not_found", id };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_migrate_expired_to_stale", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    if (entry.entry_kind !== "finding") {
      const result = { migrated: false, reason: "wrong_kind", id, entry_kind: entry.entry_kind };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_migrate_expired_to_stale", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    if (entry.status !== "expired") {
      const result = { migrated: false, reason: "wrong_status", id, current_status: entry.status };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_migrate_expired_to_stale", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    if (!entry.expires_at || Date.now() <= new Date(entry.expires_at).getTime()) {
      const result = { migrated: false, reason: "not_past_ttl", id, expires_at: entry.expires_at };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_migrate_expired_to_stale", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    const now = new Date().toISOString();
    const patch = {
      status: "stale",
      expires_at: null,
      last_verified_at: now,
      version: (entry.version ?? 0) + 1,
    };
    await updateEntry(root, id, patch);

    const result = {
      migrated: true,
      id,
      status: "stale",
      expires_at: null,
      last_verified_at: now,
      version: patch.version,
    };
    appendGateLog(root, { timestamp: now, tool: "meta_state_migrate_expired_to_stale", ...result });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};
```

Run tests. All 5 should pass.

### Step 3: Register in manifest

Edit `tools/learning-loop-mcp/tools/manifest.json`. Add entry (preserves alphabetical order, placed before `meta-state-relationships-tool.js`):
```json
{ "file": "./tools/meta-state-migrate-expired-to-stale-tool.js", "export": "metaStateMigrateExpiredToStaleTool" },
```

(The full agent-manifest.json update with both new tools happens in Phase 4. This step just registers it with the server so tests can run.)

## Success Criteria

- [ ] T1–T5 pass.
- [ ] Tool is registered in `tools/manifest.json`.
- [ ] Past-TTL math is correct (T4: future expires_at rejected).
- [ ] `expires_at` is cleared to `null` after migration.
- [ ] `last_verified_at` is set to the migration time.
- [ ] `version` is incremented (CAS-safe).
- [ ] `appendGateLog` records the migration.
- [ ] Tool description documents the consult-gate bypass rationale.

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| `checkExpiry()` reuse is wrong (only fires for `reported`) | Phase 2 inlines the past-TTL check, NOT a call to `checkExpiry()`. Documented in the gap report and the plan-time decisions log. |
| `updateEntry` may reject version mismatch | Test T1 verifies version increments. If `updateEntry` has its own CAS check, the increment must be done inside the lock; verify by reading `core/meta-state.js` `updateEntry` source. |
| Operator runs on wrong entry (e.g., active) | T2 / T3 explicitly assert `wrong_status` / `wrong_kind` rejection. |
| Race with `meta_state_resolve` cascade in Phase 4 | Both run under the same `enqueue` lock. JS single-threaded; no race. |
| Audit-trail: migration not recorded in registry | `appendGateLog` records. Gate log is the operator audit trail (per `core/gate-logic.js`). The migrated entry itself does not gain a new field, but the gate log captures the transition. |
| One-way direction accidentally reversed | No `stale → expired` code path exists. Tests assert the only direction is `expired → stale`. |
