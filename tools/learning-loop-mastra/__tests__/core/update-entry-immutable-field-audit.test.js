/**
 * Audit-only gate-log emission for immutable-field transitions applied via
 * direct core calls to updateEntry.
 *
 * The IMMUTABLE_PATCH_FIELDS deny-list is enforced only at the arbitrary-
 * patch layer (meta-state-patch-tool + metaStateBatch update op). The
 * sanctioned lifecycle tools (resolve / touch / re-verify / supersede /
 * promote-rule) call updateEntry directly with immutable fields, so they
 * bypass that deny-list by design — and before this change did so with NO
 * gate-log record. updateEntry now emits a warn-only `immutable_field_transition`
 * advisory on its real-change path so those transitions (and any future
 * direct-caller mutation of an immutable field) are visible. It never
 * rejects; the versioned append remains the state of record.
 *
 * Asserts:
 *   - A resolve-style patch (status + resolved_at + resolved_by + resolution)
 *     is ACCEPTED (returns `true`) AND audited with all four fields.
 *   - A touch-style patch (last_verified_at) is ACCEPTED and audited.
 *   - A plain description patch (no immutable field) emits NO advisory.
 *   - Precision: an immutable field passed but UNCHANGED alongside a real
 *     mutable change emits NO advisory for that field (the diff filter keeps
 *     the `immutable_field_transition` reason_code truthful).
 *   - No-op: an immutable-field patch that equals the existing value short-
 *     circuits (returns `true`, no append) and emits NO advisory.
 */

import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeEntry, updateEntry, readRegistry } from "../../core/meta-state.js";

// Read the updateEntry immutable-field-transition advisories appendGateLog
// wrote under <root>/.claude/coordination/gate-log.jsonl. Returns [] when no
// gate log exists (the negative cases: no immutable field / unchanged /
// no-op). Filters to tool === "updateEntry" so structural-ri advisories (a
// different tool) do not pollute the assertions.
function immutableFieldAudits(root) {
  const logPath = join(root, ".claude", "coordination", "gate-log.jsonl");
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((e) => e.tool === "updateEntry" && e.reason_code === "immutable_field_transition");
}

function makeTempRoot() {
  const dir = mkdtempSync(join(tmpdir(), "immutable-audit-test-"));
  mkdirSync(join(dir, "records"), { recursive: true });
  writeFileSync(join(dir, "meta-state.jsonl"), "", "utf8");
  writeFileSync(join(dir, "change-log.jsonl"), "", "utf8");
  return dir;
}

function makeFinding(overrides = {}) {
  return {
    id: "meta-f1",
    entry_kind: "finding",
    category: "loop-anti-pattern",
    severity: "warning",
    affected_system: "mcp-tools",
    description: "Immutable-audit test finding — minimum 20 chars for schema.",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

test("updateEntry accepts a resolve-style immutable-field patch and audits the transition (warn-only, never rejects)", async () => {
  const root = makeTempRoot();
  await writeEntry(root, makeFinding({ id: "meta-f1" }));
  const result = await updateEntry(root, "meta-f1", {
    status: "resolved",
    resolved_at: "2026-08-01T00:00:00.000Z",
    resolved_by: "operator",
    resolution: "Resolved via dedicated lifecycle tool — audit test.",
  });
  assert.strictEqual(result, true, "warn-only audit must not reject the patch");

  const audits = immutableFieldAudits(root);
  assert.strictEqual(audits.length, 1, "exactly one immutable_field_transition advisory");
  assert.strictEqual(audits[0].entry_id, "meta-f1");
  const fields = new Set(audits[0].fields);
  for (const f of ["status", "resolved_at", "resolved_by", "resolution"]) {
    assert.ok(fields.has(f), `audit must name the transitioned immutable field ${f}`);
  }
  assert.strictEqual(audits[0].fields_count, audits[0].fields.length);
});

test("updateEntry accepts a touch-style last_verified_at patch and audits it", async () => {
  const root = makeTempRoot();
  await writeEntry(root, makeFinding({ id: "meta-f1" }));
  const result = await updateEntry(root, "meta-f1", {
    last_verified_at: "2026-08-01T00:00:00.000Z",
  });
  assert.strictEqual(result, true);
  const audits = immutableFieldAudits(root);
  assert.strictEqual(audits.length, 1);
  assert.ok(new Set(audits[0].fields).has("last_verified_at"));
});

test("updateEntry emits NO advisory for a plain description patch (no immutable field)", async () => {
  const root = makeTempRoot();
  await writeEntry(root, makeFinding({ id: "meta-f1" }));
  const result = await updateEntry(root, "meta-f1", {
    description: "Updated description — must remain at least 20 chars.",
  });
  assert.strictEqual(result, true);
  assert.strictEqual(immutableFieldAudits(root).length, 0,
    "a patch with no immutable field must not emit an immutable_field_transition advisory");
});

test("precision: an immutable field passed but UNCHANGED alongside a real mutable change is not audited", async () => {
  // After resolving, a second update passes status:"resolved" (unchanged)
  // plus a description change. status does not transition, so the diff
  // filter must drop it; description is mutable, so NO advisory fires at all.
  const root = makeTempRoot();
  await writeEntry(root, makeFinding({ id: "meta-f1" }));
  await updateEntry(root, "meta-f1", {
    status: "resolved",
    resolved_at: "2026-08-01T00:00:00.000Z",
    resolved_by: "operator",
    resolution: "First resolution — audit test.",
  });
  const before = immutableFieldAudits(root).length;
  const result = await updateEntry(root, "meta-f1", {
    status: "resolved", // unchanged — must NOT be reported as a transition
    description: "Follow-up description edit — still at least 20 chars.",
  });
  assert.strictEqual(result, true);
  const after = immutableFieldAudits(root).length;
  assert.strictEqual(after, before,
    "an unchanged immutable field passed alongside a mutable change must not emit a new advisory");
});

test("no-op: an immutable-field patch equal to the existing value short-circuits and emits no advisory", async () => {
  const root = makeTempRoot();
  await writeEntry(root, makeFinding({ id: "meta-f1" }));
  await updateEntry(root, "meta-f1", {
    status: "resolved",
    resolved_at: "2026-08-01T00:00:00.000Z",
    resolved_by: "operator",
    resolution: "Resolve then re-send identical patch — audit test.",
  });
  const before = immutableFieldAudits(root).length;
  // Re-send the IDENTICAL patch: canonical comparator short-circuits (no
  // append, no version bump) and the audit must not fire.
  const result = await updateEntry(root, "meta-f1", {
    status: "resolved",
    resolved_at: "2026-08-01T00:00:00.000Z",
    resolved_by: "operator",
    resolution: "Resolve then re-send identical patch — audit test.",
  });
  assert.strictEqual(result, true, "no-op patch short-circuits to true");
  assert.strictEqual(immutableFieldAudits(root).length, before,
    "a no-op patch must not emit an immutable_field_transition advisory");
  // readRegistry projects by max-version, so one id with two versions
  // returns a single entry. The load-bearing no-op signal is that the
  // version did NOT bump to 2 (the short-circuit appended no new line).
  const entries = readRegistry(root);
  assert.strictEqual(entries.length, 1, "projection dedupes the id to one entry");
  assert.strictEqual(entries[0].version, 1, "no-op must not append a new version line");
});