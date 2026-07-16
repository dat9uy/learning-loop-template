import { describe, test, beforeEach, afterEach } from "vitest";
import assert from "node:assert";
import {
  readRegistry,
  writeEntry,
  updateEntry,
  filterEntries,
  generateId,
  tryClaimSessionId,
} from "./meta-state.js";
import { mkdtempSync, writeFileSync, utimesSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REGISTRY_FILENAME = "meta-state.jsonl";

function makeEntry(overrides = {}) {
  const now = new Date();
  return {
    id: overrides.id ?? generateId("test"),
    entry_kind: overrides.entry_kind ?? "finding",
    category: overrides.category ?? "gate-logic-bug",
    severity: overrides.severity ?? "warning",
    affected_system: overrides.affected_system ?? "gate-logic",
    description: overrides.description ?? "Test meta-state entry description",
    evidence_journal: overrides.evidence_journal ?? "docs/journals/test.md",
    ...(overrides.evidence_code_ref && { evidence_code_ref: overrides.evidence_code_ref }),
    ...(overrides.evidence_test && { evidence_test: overrides.evidence_test }),
    // Plan 260707-0812 Phase 2: enum collapsed to {open, resolved, superseded}.
    // `expires_at` and `acked_at` are vestigial — no longer written by any tool.
    status: overrides.status ?? "open",
    created_at: overrides.created_at ?? now.toISOString(),
    resolved_at: overrides.resolved_at ?? null,
    resolved_by: overrides.resolved_by ?? null,
    ...overrides,
  };
}

describe("meta-state registry core", () => {
  let tempDir;
  const originalEnv = process.env.GATE_ROOT;

  function getRegistryPath() {
    return join(tempDir, REGISTRY_FILENAME);
  }

  test("readRegistry returns empty array when file does not exist", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-test-"));
    process.env.GATE_ROOT = tempDir;
    const entries = readRegistry(tempDir);
    assert.deepStrictEqual(entries, []);
    process.env.GATE_ROOT = originalEnv;
  });

  test("writeEntry creates valid JSONL with one line per entry", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-test-"));
    process.env.GATE_ROOT = tempDir;
    const e1 = makeEntry({ id: generateId("first"), description: "First entry for write test" });
    const e2 = makeEntry({ id: generateId("second"), description: "Second entry for write test" });
    await writeEntry(tempDir, e1);
    await writeEntry(tempDir, e2);
    const entries = readRegistry(tempDir);
    assert.strictEqual(entries.length, 2);
    assert.strictEqual(entries[0].id, e1.id);
    assert.strictEqual(entries[1].id, e2.id);
    process.env.GATE_ROOT = originalEnv;
  });

  test("updateEntry patches existing entry by id", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-test-"));
    process.env.GATE_ROOT = tempDir;
    const e = makeEntry({ id: generateId("patch-test") });
    await writeEntry(tempDir, e);
    const now = new Date().toISOString();
    await updateEntry(tempDir, e.id, { last_verified_at: now });
    const entries = readRegistry(tempDir);
    const updated = entries.find((entry) => entry.id === e.id);
    assert.ok(updated);
    // Plan 260707-0812 Phase 2: enum is {open, resolved, superseded}; the
    // legacy `acked_at` field is gone (replaced by `last_verified_at`).
    assert.strictEqual(updated.last_verified_at, now);
    assert.strictEqual(updated.category, e.category);
    process.env.GATE_ROOT = originalEnv;
  });

  // Plan 260712-0109 Phase 1 Fix B: defense-in-depth strip of smuggled entry_kind
  // at the core layer. Direct updateEntry callers (promote-rule, dispatch,
  // re-verify, resolve, supersede) bypass the patch schema; the strip at the
  // Object.assign boundary ensures identity cannot flip even if a caller smuggles
  // entry_kind into the patch.
  test("updateEntry strips smuggled entry_kind from patch (defense-in-depth, Fix B)", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-defense-"));
    process.env.GATE_ROOT = tempDir;
    const id = generateId("defense-test");
    await writeEntry(tempDir, makeEntry({ id, description: "Finding for updateEntry defense-in-depth test (min 20 chars)" }));
    await updateEntry(tempDir, id, { entry_kind: "rule", description: "patched" });
    const entry = readRegistry(tempDir).find((e) => e.id === id);
    assert.equal(entry.entry_kind, "finding", "entry_kind must NOT flip to 'rule'");
    assert.equal(entry.description, "patched", "legitimate field must still apply");
    process.env.GATE_ROOT = originalEnv;
  });

  test("filterEntries by category", async () => {
    const entries = [
      makeEntry({ id: "a1", category: "gate-logic-bug" }),
      makeEntry({ id: "a2", category: "schema-drift" }),
      makeEntry({ id: "a3", category: "gate-logic-bug" }),
    ];
    const result = filterEntries(entries, { category: "gate-logic-bug" });
    assert.strictEqual(result.length, 2);
    assert.ok(result.every((e) => e.category === "gate-logic-bug"));
  });

  test("filterEntries by status", async () => {
    const entries = [
      makeEntry({ id: "b1", status: "open" }),
      makeEntry({ id: "b2", status: "open" }),
      makeEntry({ id: "b3", status: "open" }),
    ];
    const result = filterEntries(entries, { status: "open" });
    assert.strictEqual(result.length, 3);
    assert.deepStrictEqual(result.map((e) => e.id).sort(), ["b1", "b2", "b3"]);
  });

  test("filterEntries by affected_system", async () => {
    const entries = [
      makeEntry({ id: "c1", affected_system: "gate-logic" }),
      makeEntry({ id: "c2", affected_system: "mcp-tools" }),
    ];
    const result = filterEntries(entries, { affected_system: "mcp-tools" });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, "c2");
  });

  test("filterEntries by multiple fields (intersection)", async () => {
    const entries = [
      makeEntry({ id: "d1", category: "gate-logic-bug", status: "open" }),
      makeEntry({ id: "d2", category: "gate-logic-bug", status: "open" }),
      makeEntry({ id: "d3", category: "schema-drift", status: "open" }),
    ];
    const result = filterEntries(entries, { category: "gate-logic-bug", status: "open" });
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result.map((e) => e.id).sort(), ["d1", "d2"]);
  });

  test("updateEntry on Phase B appends a new line (inline compaction removed)", async () => {
    // Plan 260716-1101 Tier 2 Phase B: inline compaction is REMOVED. Phase B
    // is true-append only — no full rewrite means no piggyback compaction.
    // Compaction becomes Phase C's `compact-registry.sh --full` responsibility.
    // This test pins the new behavior: updateEntry appends a new line for the
    // patched entry while the old terminal entry stays in the file (the
    // projection picks the max-version per id; the list-tool layer filters
    // terminal entries from the default response).
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-test-"));
    process.env.GATE_ROOT = tempDir;
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const oldTerminal = makeEntry({
      id: generateId("old-terminal"),
      status: "resolved",
      created_at: eightDaysAgo.toISOString(),
      resolved_at: eightDaysAgo.toISOString(),
    });
    const freshReported = makeEntry({
      id: generateId("fresh-reported"),
      status: "open",
    });
    await writeEntry(tempDir, oldTerminal);
    await writeEntry(tempDir, freshReported);
    // Phase B: updateEntry appends a new line for the patched entry; the
    // old terminal entry remains in the file (compaction is Phase C only).
    await updateEntry(tempDir, freshReported.id, { description: "Updated description for Phase B test." });
    const entries = readRegistry(tempDir);
    // The file has 3 lines now: oldTerminal v0, freshReported v0, freshReported v1.
    // Projection (last-wins-by-max-version) dedupes per id → 2 entries returned.
    assert.strictEqual(entries.length, 2);
    const freshFromRegistry = entries.find((e) => e.id === freshReported.id);
    assert.strictEqual(freshFromRegistry.description, "Updated description for Phase B test.");
    assert.strictEqual(freshFromRegistry.version, 1);
    process.env.GATE_ROOT = originalEnv;
  });

  test("concurrent writes do not corrupt JSONL", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-test-"));
    process.env.GATE_ROOT = tempDir;
    const promises = [];
    for (let i = 0; i < 5; i++) {
      const e = makeEntry({ id: generateId(`concurrent-${i}`), description: `Concurrent write test entry ${i}` });
      promises.push(writeEntry(tempDir, e));
    }
    await Promise.all(promises);
    const entries = readRegistry(tempDir);
    assert.strictEqual(entries.length, 5);
    for (const entry of entries) {
      assert.ok(entry.id);
      assert.ok(entry.category);
    }
    process.env.GATE_ROOT = originalEnv;
  });

  test("generateId matches expected format", async () => {
    const id = generateId("test-slug");
    assert.ok(/^meta-\d{6}T\d{4}Z-test-slug$/.test(id), `id "${id}" did not match expected format`);
  });

  test("updateEntry returns null when entry id not found", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-test-"));
    process.env.GATE_ROOT = tempDir;
    const e = makeEntry({ id: generateId("exists") });
    await writeEntry(tempDir, e);
    const result = await updateEntry(tempDir, "meta-000000T0000Z-nonexistent", { status: "open" });
    assert.strictEqual(result, null);
    process.env.GATE_ROOT = originalEnv;
  });

  test("filterEntries with empty filters returns all entries", async () => {
    const entries = [
      makeEntry({ id: "e1" }),
      makeEntry({ id: "e2" }),
    ];
    const result = filterEntries(entries, {});
    assert.strictEqual(result.length, 2);
  });

  test("tryClaimSessionId: 5 concurrent calls with same key yield 1 finding", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-claim-"));
    process.env.GATE_ROOT = tempDir;

    const key = {
      sessionId: "test-session-123",
      subtype: "mcp-client-loading",
      runtime: "droid",
      layer: "L2",
    };

    const entryBuilder = () => ({
      id: generateId("claim-test"),
      entry_kind: "finding",
      category: "mcp-tool-missing",
      severity: "warning",
      affected_system: "mcp-tools",
      subtype: "mcp-client-loading",
      description: "Claim test finding. runtime: droid; layer: L2;",
      evidence_code_ref: "tools/test.js",
      session_id: key.sessionId,
      status: "open",
      created_at: new Date().toISOString(),
      version: 0,
    });

    const results = await Promise.all([
      tryClaimSessionId(tempDir, key, entryBuilder),
      tryClaimSessionId(tempDir, key, entryBuilder),
      tryClaimSessionId(tempDir, key, entryBuilder),
      tryClaimSessionId(tempDir, key, entryBuilder),
      tryClaimSessionId(tempDir, key, entryBuilder),
    ]);

    const claimed = results.filter((r) => r.claimed);
    assert.strictEqual(claimed.length, 1, `expected exactly 1 claim, got ${claimed.length}`);

    const entries = readRegistry(tempDir);
    const matches = entries.filter((e) =>
      e.session_id === key.sessionId
      && e.subtype === key.subtype
      && e.description.includes(`runtime: ${key.runtime}`)
      && e.description.includes(`layer: ${key.layer}`),
    );
    assert.strictEqual(matches.length, 1, `expected exactly 1 registry entry, got ${matches.length}`);

    process.env.GATE_ROOT = originalEnv;
  });
});

describe("meta-state T4 auto_resolve removal", () => {
  test("metaStateEntrySchema strips unknown auto_resolve_file input", async () => {
    const { metaStateEntrySchema } = await import("./meta-state.js");
    const result = metaStateEntrySchema.safeParse({
      id: "meta-test-auto-resolve-strip",
      entry_kind: "finding",
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Test with auto_resolve_file should have it stripped",
      auto_resolve_file: "tools/test.js",
      created_at: new Date().toISOString(),
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.auto_resolve_file, undefined);
  });

  test("metaStateEntrySchema accepts input without auto_resolve fields", async () => {
    const { metaStateEntrySchema } = await import("./meta-state.js");
    const result = metaStateEntrySchema.safeParse({
      id: "meta-test-auto-resolve-accept",
      entry_kind: "finding",
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Test without auto_resolve fields should pass",
      created_at: new Date().toISOString(),
    });
    assert.strictEqual(result.success, true);
  });

  test("checkAutoResolve is no longer exported", async () => {
    const mod = await import("./meta-state.js");
    assert.strictEqual(mod.checkAutoResolve, undefined);
  });
});

describe("meta-state change-log compaction guard", () => {
  let tempDir;
  const originalEnv = process.env.GATE_ROOT;

  test("compaction does not remove old terminal change-log entries", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-cl-compact-"));
    process.env.GATE_ROOT = tempDir;
    const { writeEntry, updateEntry, readRegistry } = await import("./meta-state.js");

    try {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const oldTerminal = {
        id: "meta-260601T0000Z-old-terminal-finding",
        entry_kind: "finding",
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Old terminal finding that should be compacted.",
        status: "resolved",
        created_at: eightDaysAgo.toISOString(),
        resolved_at: eightDaysAgo.toISOString(),
      };
      const oldChangeLog = {
        id: "meta-260601T0000Z-old-change-log",
        entry_kind: "change-log",
        change_dimension: "semantic",
        change_target: "core/test.js",
        change_diff: { added: [], removed: [], changed: [] },
        reason: "Old change-log entry that must NOT be compacted even if old.",
        status: "active", // change-log immutable audit log: status="active" (literal)
        created_at: eightDaysAgo.toISOString(),
      };
      await writeEntry(tempDir, oldTerminal);
      await writeEntry(tempDir, oldChangeLog);
      // Plan 260715-0801 Tier 1: change-logs are immutable. The previous test
      // mutated `status` to "resolved" to simulate a terminal state, but the
      // core-layer guard in `updateEntry` now rejects any in-place mutation
      // of a change-log. The invariant the test was checking — change-logs
      // skip compaction — is still enforced by the entry_kind branch in
      // `updateEntry`'s compaction filter; we verify that branch directly by
      // asserting `updateEntry` THROWS on a change-log (immutability) and
      // then checking the change-log survives the compaction window.

      // Trigger compaction via update on a different entry
      const fresh = {
        id: "meta-260602T0000Z-fresh",
        entry_kind: "finding",
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Fresh entry to trigger compaction.",
        status: "open",
        created_at: new Date().toISOString(),
      };
      await writeEntry(tempDir, fresh);
      // Phase B (Plan 260716-1101): updateEntry true-appends; no inline
      // compaction. Compaction is Phase C's `compact-registry.sh --full`
      // responsibility. The Phase B invariants we still pin:
      //   - change-logs are immutable (writeEntry can't change their status)
      //   - updateEntry on a change-log id throws change_log_immutable
      await updateEntry(tempDir, fresh.id, { description: "Updated Phase B append" });

      const entries = readRegistry(tempDir);
      // Phase B: no compaction → 3 entries (oldTerminal v0, oldChangeLog v0,
      // fresh v1). Projection dedupes to one entry per id (max-version).
      assert.strictEqual(entries.length, 3);
      const ids = entries.map((e) => e.id);
      assert.ok(ids.includes(oldTerminal.id), "Old terminal finding stays in registry (Phase B has no inline compaction)");
      assert.ok(ids.includes(oldChangeLog.id), "Old change-log must still be present (immutability invariant)");
      assert.ok(ids.includes(fresh.id), "Fresh entry should remain");

      // Confirm the core-layer immutability guard: any attempt to update
      // a change-log entry throws `change_log_immutable`.
      await assert.rejects(
        () => updateEntry(tempDir, oldChangeLog.id, { status: "resolved" }),
        /change_log_immutable/,
        "updateEntry must reject in-place mutation of a change-log",
      );
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });
});

describe("meta-state description marker drift detector", () => {
  test("every active mcp-client-loading finding has runtime: and layer: markers", async () => {
    const { readRegistry } = await import("./meta-state.js");
    const projectRoot = resolve(process.cwd());
    const entries = readRegistry(projectRoot);
    const active = entries.filter((e) =>
      e.entry_kind === "finding"
      && e.subtype === "mcp-client-loading"
      && (e.status === "active" || e.status === "open"),
    );

    // If no active entries, the test trivially passes.
    for (const e of active) {
      assert.ok(
        e.description.includes("runtime:"),
        `finding ${e.id} is missing runtime: marker in description`,
      );
      assert.ok(
        e.description.includes("layer:"),
        `finding ${e.id} is missing layer: marker in description`,
      );
    }
  });
});
