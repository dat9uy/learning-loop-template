/**
 * Phase 4 tests: write-time structural referential-integrity (RI) validation.
 *
 * Plan: plans/260730-0240-relationship-model-centralize-defer-drop/plan.md, Phase 4.
 *
 * Write-time structural RI is WARN-ONLY: a structural cross-ref whose target
 * id is never-existent is appended anyway and recorded as a gate-log
 * advisory — it is NOT rejected. The hard enforcer is the CI gate
 * `meta-state-refs-check.yml`; write-time RI's value is immediate operator
 * feedback + cross-PR orphan surfacing. Warn-only preserves the features
 * that deliberately create ref orphans at write time (the `dangling_refs`
 * derived view reopens a never-existent id; the cold-tier `orphans` array
 * points consolidated_into at a missing change-log).
 *
 * Asserts:
 *   - writeEntry ACCEPTS a never-existent structural target and logs a
 *     structural-ri gate-log advisory naming the dangling {field, id}
 *     (id-existence only).
 *   - updateEntry ACCEPTS a changed/introduced ref to a never-existent id
 *     (returns `true`, not a string code) and logs an advisory; inherited
 *     unchanged refs are NOT re-validated.
 *   - applies_to_resolution is RI-EXEMPT (`z.string()`, not an entry-id ref;
 *     a determinism-checklist pattern is valid) → no advisory.
 *   - `*` wildcards and empty fields are exempt → no advisory.
 *   - Tombstones count as present (liveness out of scope) → no advisory.
 *   - Existing-target refs → no advisory.
 *   - Historical reads remain unaffected (RI never runs on the read path).
 */

import { test } from "vitest";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  writeEntry,
  updateEntry,
  readRegistry,
} from "../../core/meta-state.js";

// Read the structural-ri advisories appendGateLog wrote under <root>/.claude/
// coordination/gate-log.jsonl. Returns [] when no gate log exists (the
// positive cases: existing target / exempt / tombstone → no advisory).
function structuralRiWarnings(root) {
  const logPath = join(root, ".claude", "coordination", "gate-log.jsonl");
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((e) => e.tool === "structural-ri");
}

// True when the gate log records a structural-ri advisory for (field, id).
function warnedOn(root, field, id) {
  return structuralRiWarnings(root).some((w) =>
    Array.isArray(w.dangling) && w.dangling.some((d) => d.field === field && d.id === id)
  );
}

function makeTempRoot() {
  const dir = mkdtempSync(join(tmpdir(), "phase-4-ri-test-"));
  mkdirSync(join(dir, "records"), { recursive: true });
  // Seed an empty registry so writeEntry has a baseline.
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
    description: "Phase 4 RI test finding — minimum 20 chars for schema.",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeRule(origin = "meta-f1") {
  return {
    id: "rule-r1",
    entry_kind: "rule",
    origin,
    enforcement: "gate",
    pattern_type: "regex",
    pattern: "^git push",
    description: "Phase 4 RI test rule — minimum 20 chars for schema.",
    promoted_at: new Date().toISOString(),
    promoted_by: "operator",
    status: "active",
    created_at: new Date().toISOString(),
  };
}

// -----------------------------------------------------------------------------
// writeEntry RI
// -----------------------------------------------------------------------------

test("writeEntry accepts reopens to a never-existent id and logs a warn-only advisory", async () => {
  const root = makeTempRoot();
  // Seed a finding so the registry has something — but no `meta-stale-parent`.
  await writeEntry(root, makeFinding({ id: "meta-existing-f" }));
  const entry = makeFinding({
    id: "meta-child",
    reopens: ["meta-never-existed"],
  });
  // WARN-ONLY: the write succeeds (the dangling_refs feature relies on
  // creating exactly such an orphan); the CI gate is the hard enforcer.
  await writeEntry(root, entry);
  const entries = readRegistry(root);
  assert.strictEqual(entries.length, 2, "append proceeds under warn-only RI");
  assert.ok(warnedOn(root, "reopens", "meta-never-existed"),
    "gate log must record the dangling reopens ref with its field + id");
});

test("writeEntry accepts reopens pointing at an existing id (no advisory)", async () => {
  const root = makeTempRoot();
  await writeEntry(root, makeFinding({ id: "meta-stale-parent" }));
  await writeEntry(root, makeFinding({
    id: "meta-child",
    reopens: ["meta-stale-parent"],
  }));
  const entries = readRegistry(root);
  assert.strictEqual(entries.length, 2);
  assert.strictEqual(structuralRiWarnings(root).length, 0,
    "an existing-target ref must not emit an advisory");
});

test("writeEntry accepts consolidated_into to a never-existent change-log and logs a warn-only advisory (preserves the cold-tier orphan feature)", async () => {
  const root = makeTempRoot();
  await writeEntry(root, makeFinding());
  const entry = makeFinding({
    id: "meta-f2",
    consolidated_into: "meta-missing-changelog",
  });
  // WARN-ONLY: the cold-tier `orphans` feature surfaces exactly such a
  // dangling consolidated_into pointer; RI must let it be written.
  await writeEntry(root, entry);
  const entries = readRegistry(root);
  assert.strictEqual(entries.length, 2, "append proceeds under warn-only RI");
  assert.ok(warnedOn(root, "consolidated_into", "meta-missing-changelog"),
    "gate log must record the dangling consolidated_into ref");
});

test("writeEntry RI-EXEMPTS applies_to_resolution (no advisory)", async () => {
  // `applies_to_resolution` is `z.string()`, not `entryIdRefArray`. A
  // determinism-checklist pattern like `test-session-123` is valid; RI does
  // not flag it.
  const root = makeTempRoot();
  await writeEntry(root, makeFinding({ id: "meta-f1" }));
  await writeEntry(root, makeRule("meta-f1"));
  // Update rule with applies_to_resolution pointing at a non-existent pattern.
  const result = await updateEntry(root, "rule-r1", {
    applies_to_resolution: "test-session-123",
  });
  assert.strictEqual(result, true, "applies_to_resolution is RI-exempt");
  assert.strictEqual(structuralRiWarnings(root).length, 0,
    "an RI-exempt field must not emit an advisory");
});

test("writeEntry accepts `*` wildcard for applies_to_resolution (no advisory)", async () => {
  // The wildcard `"*"` is filtered out by `forwardRefs` before RI runs.
  const root = makeTempRoot();
  await writeEntry(root, makeFinding({ id: "meta-f1" }));
  await writeEntry(root, makeRule("meta-f1"));
  const result = await updateEntry(root, "rule-r1", {
    applies_to_resolution: "*",
  });
  assert.strictEqual(result, true);
  assert.strictEqual(structuralRiWarnings(root).length, 0);
});

test("writeEntry treats tombstones as present (no advisory — liveness out of scope)", async () => {
  // A ref to a deleted/archived id (still in projection) is not flagged
  // — id-existence only. The derived `dangling_refs` view surfaces
  // liveness post-hoc. We archive via `archiveEntry` which produces a
  // tombstone (the id remains in the projected registry but with
  // status=archived).
  const root = makeTempRoot();
  const { archiveEntry } = await import("../../core/meta-state.js");
  await writeEntry(root, makeFinding({ id: "meta-stale-parent" }));
  await archiveEntry(root, "meta-stale-parent", "test tombstone", "operator");
  await writeEntry(root, makeFinding({
    id: "meta-child",
    reopens: ["meta-stale-parent"],
  }));
  const entries = readRegistry(root);
  // The projection dedupes by max-version (parent + tombstone = 1 effective
  // entry); plus the child = 2 entries. The id `meta-stale-parent` is
  // still in the projection → RI accepts the ref (no advisory).
  assert.strictEqual(entries.length, 2);
  assert.ok(entries.some((e) => e.id === "meta-child" && e.reopens?.includes("meta-stale-parent")),
    "child reopens the archived parent — RI accepted (id-existence only)");
  assert.strictEqual(structuralRiWarnings(root).length, 0,
    "a tombstone id counts as present — no advisory");
});

// -----------------------------------------------------------------------------
// updateEntry changed-only RI
// -----------------------------------------------------------------------------

test("updateEntry validates ONLY changed/introduced refs (not inherited — no advisory)", async () => {
  // The load-bearing design decision: a description edit on a finding
  // with a historical `reopens` is not flagged (the inherited unchanged
  // ref is not re-validated).
  const root = makeTempRoot();
  await writeEntry(root, makeFinding({ id: "meta-stale-parent" }));
  // Seed a finding with a reopens to an existing parent. Then patch the
  // description (no ref change) → no advisory.
  await writeEntry(root, makeFinding({
    id: "meta-child",
    reopens: ["meta-stale-parent"],
  }));
  const result = await updateEntry(root, "meta-child", {
    description: "Updated description — must remain at least 20 chars.",
  });
  assert.strictEqual(result, true, "inherited unchanged refs not re-validated");
  assert.strictEqual(structuralRiWarnings(root).length, 0,
    "a description patch must not emit an advisory");
});

test("updateEntry accepts repointing a ref to a missing id and logs a warn-only advisory (changed-only)", async () => {
  // Patch introduces a NEW ref (reopens was empty, now points at a missing
  // id). Under warn-only RI the patch applies and a gate-log advisory is
  // emitted; updateEntry keeps its string-code return contract (true) —
  // no "dangling_structural_ref" code is returned.
  const root = makeTempRoot();
  await writeEntry(root, makeFinding({ id: "meta-orphan" }));
  const result = await updateEntry(root, "meta-orphan", {
    reopens: ["meta-never-existed"],
  });
  assert.strictEqual(result, true, "warn-only RI does not reject the patch");
  assert.ok(warnedOn(root, "reopens", "meta-never-existed"),
    "gate log must record the repointed dangling ref");
});

test("updateEntry accepts repointing a ref to an existing id (no advisory)", async () => {
  const root = makeTempRoot();
  await writeEntry(root, makeFinding({ id: "meta-stale-parent" }));
  await writeEntry(root, makeFinding({ id: "meta-orphan" }));
  const result = await updateEntry(root, "meta-orphan", {
    reopens: ["meta-stale-parent"],
  });
  assert.strictEqual(result, true);
  assert.strictEqual(structuralRiWarnings(root).length, 0,
    "an existing-target repoint must not emit an advisory");
});

// -----------------------------------------------------------------------------
// Historical reads are unaffected (RI is append-only — never on read)
// -----------------------------------------------------------------------------

test("historical reads unaffected: a finding with dangling reopens still reads with outbound.reopens populated", async () => {
  // RI is append-only — historical entries with legacy dangling refs
  // still read fine. The `outbound.reopens` view is unchanged.
  const root = makeTempRoot();
  await writeEntry(root, makeFinding({ id: "meta-stale-parent" }));
  await writeEntry(root, makeFinding({
    id: "meta-child",
    reopens: ["meta-stale-parent"],
  }));
  // Now archive the parent (no RI — tombstones preserve the id in projection).
  // Then read: the child's outbound.reopens still surfaces the parent.
  const entries = readRegistry(root);
  const child = entries.find((e) => e.id === "meta-child");
  assert.ok(child);
  assert.deepStrictEqual(child.reopens, ["meta-stale-parent"]);
});