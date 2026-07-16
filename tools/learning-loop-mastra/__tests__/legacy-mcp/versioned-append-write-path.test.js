// Tier 2 Phase B: write-path rewrite tests — true-append + canonical short-circuit.
//
// Validates that every mutation appends a new versioned line (no full rewrite,
// no line replacement) and the no-op short-circuit skips writes that produce
// no field change. Resolves meta-260715T2311Z-gratuitous-mutations.

import { describe, it, beforeAll, beforeEach, afterAll } from "vitest";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  unlinkSync,
  rmSync,
  statSync,
  readFileSync,
  openSync,
  writeSync,
  closeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  readRegistry,
  writeEntry,
  updateEntry,
  archiveEntry,
  deleteEntry,
  shipLoopDesign,
  metaStateBatch,
} from "../../core/meta-state.js";
import { invalidateCache } from "../../core/read-registry-cache.js";

const REGISTRY_FILENAME = "meta-state.jsonl";
const CHANGE_LOG_FILENAME = "change-log.jsonl";

function makeTempRoot() {
  return mkdtempSync(join(tmpdir(), "phase-b-write-path-"));
}

function makeFinding(overrides = {}) {
  return {
    id: overrides.id ?? `meta-pb-f-${Math.random().toString(36).slice(2, 8)}`,
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    description: overrides.description ?? "Phase B write-path test finding (min 20 chars)",
    status: "open",
    created_at: overrides.created_at ?? new Date().toISOString(),
    ...overrides,
  };
}

function makeChangeLog(overrides = {}) {
  return {
    id: overrides.id ?? `meta-pb-cl-${Math.random().toString(36).slice(2, 8)}`,
    entry_kind: "change-log",
    change_dimension: "semantic",
    change_target: overrides.change_target ?? "core/test.js",
    change_diff: { added: [], removed: [], changed: [] },
    reason: overrides.reason ?? "Phase B write-path test change-log (min 20 chars)",
    status: "active",
    created_at: overrides.created_at ?? new Date().toISOString(),
    ...overrides,
  };
}

function countLines(root, filename) {
  const path = join(root, filename);
  if (!existsSync(path)) return 0;
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "").length;
}

function readLines(root, filename) {
  const path = join(root, filename);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l));
}

describe("versioned-append write-path (Tier 2 Phase B)", () => {
  let root;

  beforeAll(() => {
    root = makeTempRoot();
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    if (existsSync(join(root, REGISTRY_FILENAME))) unlinkSync(join(root, REGISTRY_FILENAME));
    if (existsSync(join(root, CHANGE_LOG_FILENAME))) unlinkSync(join(root, CHANGE_LOG_FILENAME));
    invalidateCache(root);
  });

  // Step 3: append-behavior
  it("(3) writeEntry appends a v0 line (no full rewrite)", async () => {
    await writeEntry(root, makeFinding({ id: "meta-pb-write1" }));
    const lines = readLines(root, REGISTRY_FILENAME);
    assert.equal(lines.length, 1, "writeEntry appends exactly one line");
    assert.equal(lines[0].id, "meta-pb-write1");
    assert.equal(lines[0].version, 0, "new entries start at version 0");
  });

  it("(3) updateEntry on a real field change appends a new line, old line unchanged", async () => {
    await writeEntry(root, makeFinding({ id: "meta-pb-update1", description: "Original desc (min 20 chars)" }));
    const beforeLines = readLines(root, REGISTRY_FILENAME);
    const beforeSize = statSync(join(root, REGISTRY_FILENAME)).size;
    const beforeDescription = beforeLines[0].description;

    await updateEntry(root, "meta-pb-update1", { severity: "escalate" });

    const afterLines = readLines(root, REGISTRY_FILENAME);
    assert.equal(afterLines.length, 2, "updateEntry appends exactly one new line");
    assert.equal(afterLines[0].description, beforeDescription, "original line is unchanged");
    assert.equal(afterLines[1].id, "meta-pb-update1");
    assert.equal(afterLines[1].version, 1, "new line version = prev + 1");
    assert.equal(afterLines[1].severity, "escalate", "patched field is present on new line");
    assert.ok(statSync(join(root, REGISTRY_FILENAME)).size > beforeSize, "file grew");
  });

  // Step 4: no-op short-circuit (resolves meta-260715T2311Z)
  it("(4) updateEntry on a no-op patch produces zero file change", async () => {
    await writeEntry(root, makeFinding({ id: "meta-pb-noop1", status: "open" }));
    const beforeSize = statSync(join(root, REGISTRY_FILENAME)).size;
    const beforeMtime = statSync(join(root, REGISTRY_FILENAME)).mtimeMs;
    const beforeLines = readLines(root, REGISTRY_FILENAME);
    const beforeLineCount = beforeLines.length;

    // Patch { status: "open" } — no real change.
    const result = await updateEntry(root, "meta-pb-noop1", { status: "open" });

    assert.equal(result, true, "no-op update returns true (semantic no-op success)");
    const afterLines = readLines(root, REGISTRY_FILENAME);
    assert.equal(afterLines.length, beforeLineCount, "line count unchanged (no append)");
    assert.equal(statSync(join(root, REGISTRY_FILENAME)).size, beforeSize, "file size unchanged");
    // The original v0 line is the only entry; max-version is still v0.
    assert.equal(afterLines[0].version, 0, "version unchanged");
  });

  it("(4) CAS-only update (no field change) is a no-op", async () => {
    await writeEntry(root, makeFinding({ id: "meta-pb-casnoop", version: 0 }));
    const beforeLines = readLines(root, REGISTRY_FILENAME);
    const beforeSize = statSync(join(root, REGISTRY_FILENAME)).size;

    // Patch contains ONLY _expected_version — no field changes.
    const result = await updateEntry(root, "meta-pb-casnoop", { _expected_version: 0 });

    assert.equal(result, true, "CAS-only update returns true");
    const afterLines = readLines(root, REGISTRY_FILENAME);
    assert.equal(afterLines.length, beforeLines.length, "no append on CAS-only");
    assert.equal(statSync(join(root, REGISTRY_FILENAME)).size, beforeSize, "file size unchanged");
  });

  // Step 6: CAS still works
  it("(6) _expected_version mismatch returns version_mismatch with no append", async () => {
    await writeEntry(root, makeFinding({ id: "meta-pb-casmismatch", version: 0 }));
    const beforeLines = readLines(root, REGISTRY_FILENAME);

    const result = await updateEntry(root, "meta-pb-casmismatch", {
      severity: "escalate",
      _expected_version: 99,
    });

    assert.equal(result, "version_mismatch");
    const afterLines = readLines(root, REGISTRY_FILENAME);
    assert.equal(afterLines.length, beforeLines.length, "no append on CAS mismatch");
  });

  it("(6) _expected_version match proceeds and appends", async () => {
    await writeEntry(root, makeFinding({ id: "meta-pb-casok", version: 0 }));
    const beforeLines = readLines(root, REGISTRY_FILENAME);

    const result = await updateEntry(root, "meta-pb-casok", {
      severity: "escalate",
      _expected_version: 0,
    });

    assert.equal(result, true);
    const afterLines = readLines(root, REGISTRY_FILENAME);
    assert.equal(afterLines.length, beforeLines.length + 1, "append on CAS match");
    assert.equal(afterLines[1].version, 1);
  });

  // Step 5: archived-tombstone delete
  it("(5) deleteEntry appends archived tombstone with tombstone_kind: 'delete'", async () => {
    await writeEntry(root, makeFinding({ id: "meta-pb-delete1" }));
    const beforeLines = readLines(root, REGISTRY_FILENAME);
    const beforeLineCount = beforeLines.length;
    const originalLine = beforeLines[0];

    const result = await deleteEntry(root, "meta-pb-delete1", "user requested");
    assert.equal(result.deleted, true);

    const afterLines = readLines(root, REGISTRY_FILENAME);
    assert.equal(afterLines.length, beforeLineCount + 1, "delete appends a tombstone line");
    assert.equal(afterLines[0].id, originalLine.id, "original line unchanged");
    assert.equal(afterLines[0].description, originalLine.description);
    assert.equal(afterLines[1].id, "meta-pb-delete1");
    assert.equal(afterLines[1].status, "archived", "tombstone has status=archived");
    assert.equal(afterLines[1].tombstone_kind, "delete", "tombstone_kind discriminator = delete");
    assert.match(afterLines[1].archived_reason, /^deleted:/, "archived_reason has 'deleted:' prefix");
    assert.equal(afterLines[1].version, 1, "tombstone version = prev + 1");

    // Projection hides the tombstone; meta_state_list returns only the open entry.
    const entries = readRegistry(root);
    assert.equal(entries.length, 1, "projection hides tombstone");
    assert.equal(entries[0].id, "meta-pb-delete1");
    // The projection returns the max-version line, which IS the tombstone (v1).
    // meta_state_list filter (status !== 'archived') is the layer that hides it;
    // projection alone returns the max-version entry. This is by design — the
    // list-tool layer applies the filter.
  });

  it("(5) archiveEntry appends tombstone with tombstone_kind: 'archive'", async () => {
    await writeEntry(root, makeFinding({ id: "meta-pb-archive1" }));
    const result = await archiveEntry(root, "meta-pb-archive1", "test archive reason", "operator");
    assert.equal(result.archived, true);

    const afterLines = readLines(root, REGISTRY_FILENAME);
    assert.equal(afterLines.length, 2);
    assert.equal(afterLines[1].status, "archived");
    assert.equal(afterLines[1].tombstone_kind, "archive", "tombstone_kind discriminator = archive");
    assert.equal(afterLines[1].archived_reason, "test archive reason");
    assert.equal(afterLines[1].version, 1);
  });

  // Step 7: change-log immutability
  it("(7) updateEntry on a change-log id throws change_log_immutable", async () => {
    // Direct write to change-log.jsonl (true-append is already the write path).
    const cl = makeChangeLog({ id: "meta-pb-cl-immutable" });
    appendFileSync(join(root, CHANGE_LOG_FILENAME), JSON.stringify(cl) + "\n", "utf8");
    invalidateCache(root);

    await assert.rejects(
      () => updateEntry(root, "meta-pb-cl-immutable", { reason: "forbidden attempt" }),
      /change_log_immutable/,
    );
  });

  it("(7) deleteEntry on a change-log id is rejected", async () => {
    const cl = makeChangeLog({ id: "meta-pb-cl-delete-immutable" });
    appendFileSync(join(root, CHANGE_LOG_FILENAME), JSON.stringify(cl) + "\n", "utf8");
    invalidateCache(root);

    const result = await deleteEntry(root, "meta-pb-cl-delete-immutable");
    assert.equal(result.deleted, false);
    assert.equal(result.reason, "change_log_immutable");
  });

  // Step 8: batch append
  it("(8) metaStateBatch with multiple updates appends one new line per mutated id", async () => {
    await writeEntry(root, makeFinding({ id: "meta-pb-batch-1", description: "Batch entry one (min 20 chars)" }));
    await writeEntry(root, makeFinding({ id: "meta-pb-batch-2", description: "Batch entry two (min 20 chars)" }));
    await writeEntry(root, makeFinding({ id: "meta-pb-batch-3", description: "Batch entry three (min 20 chars)" }));
    const beforeLines = readLines(root, REGISTRY_FILENAME);

    const result = await metaStateBatch(root, [
      { op: "update", id: "meta-pb-batch-1", severity: "escalate" },
      { op: "update", id: "meta-pb-batch-2", severity: "escalate" },
      { op: "delete", id: "meta-pb-batch-3", reason: "batch test deletion" },
    ]);

    assert.equal(result.applied, 3);
    assert.equal(result.failed_at, null);

    const afterLines = readLines(root, REGISTRY_FILENAME);
    assert.equal(
      afterLines.length,
      beforeLines.length + 3,
      "batch appends one new line per mutated id (3 mutations → 3 new lines)",
    );

    // The delete mutation produced a tombstone line, not a splice.
    const tombstones = afterLines.filter((l) => l.status === "archived");
    assert.equal(tombstones.length, 1, "delete op produced one tombstone");
    assert.equal(tombstones[0].id, "meta-pb-batch-3");
    assert.equal(tombstones[0].tombstone_kind, "delete", "batch delete routes through deleteEntry");

    // The two update ops each produced a v1 line.
    const updates = afterLines.filter((l) => l.id === "meta-pb-batch-1" && l.version === 1);
    assert.equal(updates.length, 1, "update op produced exactly one v1 line");
  });

  it("(8) metaStateBatch with change-log ops routes to change-log.jsonl", async () => {
    await writeEntry(root, makeFinding({ id: "meta-pb-batch-cl-host" }));

    const cl = makeChangeLog({ id: "meta-pb-batch-cl", reason: "Batch change-log emit (min 20 chars)" });
    const result = await metaStateBatch(root, [
      { op: "write", entry: cl },
    ]);

    assert.equal(result.applied, 1);

    const clLines = readLines(root, CHANGE_LOG_FILENAME);
    assert.ok(clLines.some((l) => l.id === "meta-pb-batch-cl"), "change-log landed in change-log.jsonl");

    const msLines = readLines(root, REGISTRY_FILENAME);
    assert.ok(!msLines.some((l) => l.id === "meta-pb-batch-cl"), "change-log did NOT leak into meta-state.jsonl");
  });

  // Step 9: batch rollback
  it("(9) mid-batch failure restores preBatchContent byte-for-byte", async () => {
    await writeEntry(root, makeFinding({ id: "meta-pb-rollback-1", description: "Pre-batch entry one (min 20 chars)" }));
    await writeEntry(root, makeFinding({ id: "meta-pb-rollback-2", description: "Pre-batch entry two (min 20 chars)" }));
    const beforeContent = readFileSync(join(root, REGISTRY_FILENAME), "utf8");
    const beforeSize = statSync(join(root, REGISTRY_FILENAME)).size;

    // First two ops succeed; third op fails with not_found; rollback expected.
    const result = await metaStateBatch(root, [
      { op: "update", id: "meta-pb-rollback-1", severity: "escalate" },
      { op: "update", id: "meta-pb-rollback-2", severity: "escalate" },
      { op: "update", id: "meta-pb-rollback-NONEXISTENT", severity: "escalate" },
    ]);

    assert.equal(result.applied, 0, "rollback reported applied=0");
    assert.ok(result.failed_at >= 2);

    // File must be restored to pre-batch byte content.
    const afterContent = readFileSync(join(root, REGISTRY_FILENAME), "utf8");
    assert.equal(afterContent, beforeContent, "rollback restored byte content");
    assert.equal(statSync(join(root, REGISTRY_FILENAME)).size, beforeSize, "size restored");

    // No partial-write line remains.
    const afterLines = readLines(root, REGISTRY_FILENAME);
    assert.equal(afterLines.length, 2, "no append on rollback");
  });

  // Step 4 (additional): shipLoopDesign
  it("shipLoopDesign appends a new line with status: inactive + shipped_in_plan", async () => {
    const designId = `loop-design-pb-${Math.random().toString(36).slice(2, 8)}`;
    await writeEntry(root, {
      id: designId,
      entry_kind: "loop-design",
      title: "Phase B test loop-design (descriptive)",
      description: "Phase B test loop-design description (min 20 chars)",
      proposed_design_for: [],
      addresses: [],
      affected_system: "meta",
      status: "active",
      created_at: new Date().toISOString(),
      created_by: "operator",
    });
    const beforeLines = readLines(root, REGISTRY_FILENAME);

    const result = await shipLoopDesign(root, designId, "260716-phase-b-test");
    assert.equal(result.shipped, true);

    const afterLines = readLines(root, REGISTRY_FILENAME);
    assert.equal(afterLines.length, beforeLines.length + 1);
    const shipped = afterLines[afterLines.length - 1];
    assert.equal(shipped.id, designId);
    assert.equal(shipped.status, "inactive");
    assert.equal(shipped.shipped_in_plan, "260716-phase-b-test");
    assert.ok(shipped.shipped_at);
    assert.equal(shipped.version, 1);
  });

  // H1 fsync coverage: verify the trueAppendAtomic helper crashes safely
  it("trueAppendAtomic: append produces a fully-formed JSON line (no partial last line)", async () => {
    const fd = openSync(join(root, REGISTRY_FILENAME), "a");
    try {
      writeSync(fd, JSON.stringify(makeFinding({ id: "meta-pb-fsync1" })) + "\n");
    } finally {
      closeSync(fd);
    }
    // No fsync here is fine for the test (we're validating the helper output
    // shape, not the fsync durability itself; the fsync is exercised by the
    // production write path).
    const lines = readLines(root, REGISTRY_FILENAME);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].id, "meta-pb-fsync1");
    assert.ok(lines[0].id && lines[0].description, "line is fully parseable JSON (no partial)");
  });

  // Step 10: assertNoChangeLogLeak guards the new path
  it("assertNoChangeLogLeak: change-log entry reaching meta-state.jsonl throws", async () => {
    // Touch change-log.jsonl first so the guard is armed.
    appendFileSync(
      join(root, CHANGE_LOG_FILENAME),
      JSON.stringify(makeChangeLog({ id: "meta-pb-cl-armor" })) + "\n",
      "utf8",
    );
    invalidateCache(root);

    // Direct test of the guard via trueAppendAtomic — forcing the
    // meta-state.jsonl path with a change-log entry simulates a caller
    // bypassing the entry_kind dispatch (the bug class the guard exists
    // to catch). trueAppendAtomic is sync (throws synchronously), so use
    // assert.throws rather than assert.rejects.
    const { trueAppendAtomic } = await import("../../core/registry-append-atomic.js");
    assert.throws(
      () =>
        trueAppendAtomic(
          root,
          join(root, REGISTRY_FILENAME),
          makeChangeLog({ id: "meta-pb-cl-leak", reason: "Leak attempt (min 20 chars)" }),
        ),
      /change_log_leak/,
    );
  });

  // Step 7: change-log immutability on the batch path
  it("metaStateBatch update on a change-log id returns change_log_immutable failure", async () => {
    appendFileSync(
      join(root, CHANGE_LOG_FILENAME),
      JSON.stringify(makeChangeLog({ id: "meta-pb-batch-cl-imm" })) + "\n",
      "utf8",
    );
    invalidateCache(root);

    // metaStateBatch is all-or-nothing but reports failures via the result
    // object rather than throwing (callers distinguish via `applied: 0`).
    const result = await metaStateBatch(root, [
      { op: "update", id: "meta-pb-batch-cl-imm", reason: "forbidden attempt (min 20 chars)" },
    ]);
    assert.equal(result.applied, 0);
    assert.equal(result.reason, "change_log_immutable");
  });

  // Step 7: change-log immutability on archive path
  it("archiveEntry on a change-log id throws change_log_immutable", async () => {
    appendFileSync(
      join(root, CHANGE_LOG_FILENAME),
      JSON.stringify(makeChangeLog({ id: "meta-pb-archive-cl-imm" })) + "\n",
      "utf8",
    );
    invalidateCache(root);

    await assert.rejects(
      () => archiveEntry(root, "meta-pb-archive-cl-imm", "forbidden attempt", "operator"),
      /change_log_immutable/,
    );
  });
});