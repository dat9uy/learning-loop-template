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

function makeExpiredFixture({ id, createdHoursAgo = 48, expiresHoursAgo = 24 } = {}) {
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
    const fixture = makeExpiredFixture({
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
    const fixture = { ...makeExpiredFixture({ id: "meta-test-active" }), status: "active" };
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
      ...makeExpiredFixture({ id: "meta-test-notpast" }),
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
