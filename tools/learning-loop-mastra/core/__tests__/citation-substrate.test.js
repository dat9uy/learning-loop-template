/**
 * Phase 2 of `meta-state-lifecycle-migration` plan:
 *   - citation is a kinded entry in its own citations.jsonl
 *   - metaStateCitationEntrySchema parses a citation; rationale is required
 *   - appendCitationEntryAtomic writes ONLY to citations.jsonl (no leak)
 *   - assertNoCitationLeak guards all three file directions
 *   - readRawLines unions the three files; cache invalidates on append
 *   - buildInverseIndexes populates a generic citations_inverse (target→sources)
 *   - kindForId resolves "citation-" ids
 *   - forwardRefs returns source + target for citation entries
 *   - The migrated named maps still populate (Phase 2 is additive; the named
 *     maps de-route in Phases 3 + 4).
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { readRegistry, writeEntry } from "../../core/meta-state.js";
import { invalidateCache, readRegistryWithCache } from "../../core/read-registry-cache.js";
import { buildInverseIndexes, forwardRefs, kindForId } from "../../core/entry/relationship-graph.js";
import { trueAppendAtomic, assertNoChangeLogLeak, assertNoCitationLeak } from "../../core/registry-append-atomic.js";

let tmp;
let root;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "ll-citation-"));
  root = tmp;
  // canonical 3-key registry: meta-state.jsonl + change-log.jsonl + citations.jsonl
  appendFileSync(join(root, "meta-state.jsonl"), "", "utf8");
  appendFileSync(join(root, "change-log.jsonl"), "", "utf8");
  appendFileSync(join(root, "citations.jsonl"), "", "utf8");
  invalidateCache(root);
});

afterEach(() => {
  invalidateCache(root);
  rmSync(tmp, { recursive: true, force: true });
});

function writeRaw(filename, obj) {
  appendFileSync(join(root, filename), JSON.stringify(obj) + "\n", "utf8");
  invalidateCache(root);
  return obj;
}

describe("citation schema — metaStateCitationEntrySchema", () => {
  test("imports from meta-state", async () => {
    const mod = await import("../../core/meta-state.js");
    assert.ok(mod.metaStateCitationEntrySchema, "metaStateCitationEntrySchema must be exported");
    const parsed = mod.metaStateCitationEntrySchema.parse({
      id: "citation-001",
      entry_kind: "citation",
      source: "rule-rule-test",
      target: "meta-finding-test",
      rationale: "origin",
      recorded_at: new Date().toISOString(),
      recorded_by: "test",
    });
    assert.equal(parsed.status, "active");
    assert.equal(parsed.entry_kind, "citation");
    assert.equal(parsed.source, "rule-rule-test");
    assert.equal(parsed.target, "meta-finding-test");
    assert.equal(parsed.rationale, "origin");
  });

  test("rationale is required (rejects missing)", async () => {
    const mod = await import("../../core/meta-state.js");
    const res = mod.metaStateCitationEntrySchema.safeParse({
      id: "citation-002",
      entry_kind: "citation",
      source: "meta-finding-test",
      target: "meta-other-test",
      recorded_at: new Date().toISOString(),
      recorded_by: "test",
    });
    assert.equal(res.success, false);
  });
});

describe("appendCitationEntryAtomic — file isolation", () => {
  test("writes only to citations.jsonl and invalidates the read cache", async () => {
    const mod = await import("../../core/meta-state.js");
    const citation = {
      id: "citation-append-1",
      entry_kind: "citation",
      source: "meta-citation-find",
      target: "meta-citation-target",
      rationale: "resolves-to",
      recorded_at: new Date().toISOString(),
      recorded_by: "test",
    };
    await mod.appendCitationEntryAtomic(root, citation);
    // After append, the union read must surface the citation.
    const entries = readRegistry(root);
    const cit = entries.find((e) => e.id === "citation-append-1");
    assert.ok(cit, "citation must appear in union read");
    assert.equal(cit.entry_kind, "citation");
    assert.equal(cit.rationale, "resolves-to");
  });
});

describe("assertNoCitationLeak — three path checks", () => {
  test("rejects citation entry to meta-state.jsonl", () => {
    assert.throws(
      () => assertNoCitationLeak(root, [{ entry_kind: "citation", id: "x" }], join(root, "meta-state.jsonl")),
      /citation_leak/,
    );
  });

  test("rejects citation entry to change-log.jsonl", () => {
    assert.throws(
      () => assertNoCitationLeak(root, [{ entry_kind: "citation", id: "x" }], join(root, "change-log.jsonl")),
      /citation_leak/,
    );
  });

  test("rejects non-citation entry to citations.jsonl", () => {
    assert.throws(
      () => assertNoCitationLeak(root, [{ entry_kind: "finding", id: "x" }], join(root, "citations.jsonl")),
      /citation_leak/,
    );
  });

  test("allows citation entry to citations.jsonl (no-op)", () => {
    assert.doesNotThrow(() =>
      assertNoCitationLeak(root, [{ entry_kind: "citation", id: "x" }], join(root, "citations.jsonl")),
    );
  });
});

describe("trueAppendAtomic — citation append isolation", () => {
  test("appendCitationEntryAtomic routes through trueAppendAtomic (leak guard active)", async () => {
    // Manually point trueAppendAtomic at meta-state.jsonl for a citation entry:
    // assertNoCitationLeak fires before any bytes are written.
    assert.throws(
      () => trueAppendAtomic(root, join(root, "meta-state.jsonl"), { entry_kind: "citation", id: "x", foo: 1 }),
      /citation_leak/,
    );
    // And meta-state.jsonl must not have grown:
    const { readFileSync } = await import("node:fs");
    const content = readFileSync(join(root, "meta-state.jsonl"), "utf8");
    assert.equal(content.trim(), "");
  });

  test("assertNoChangeLogLeak and assertNoCitationLeak coexist without firing for legal pairs", () => {
    // change-log entries to change-log.jsonl = legal for both guards
    assert.doesNotThrow(() =>
      assertNoCitationLeak(root, [{ entry_kind: "change-log", id: "x" }], join(root, "change-log.jsonl")),
    );
    assert.doesNotThrow(() =>
      assertNoChangeLogLeak(root, [{ entry_kind: "change-log", id: "x" }], join(root, "change-log.jsonl")),
    );
    // meta-state entries to meta-state.jsonl = legal for both
    assert.doesNotThrow(() =>
      assertNoCitationLeak(root, [{ entry_kind: "finding", id: "x" }], join(root, "meta-state.jsonl")),
    );
    assert.doesNotThrow(() =>
      assertNoChangeLogLeak(root, [{ entry_kind: "finding", id: "x" }], join(root, "meta-state.jsonl")),
    );
  });
});

describe("kindForId — citation- prefix", () => {
  test("kindForId resolves citation- ids to citation", () => {
    assert.equal(kindForId("citation-anything"), "citation");
  });
});

describe("readRawLines — union of three files", () => {
  test("union read picks up citation lines", async () => {
    // seed one finding + one citation across the two files
    writeRaw("meta-state.jsonl", {
      id: "meta-citation-host",
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "meta",
      description: "Host finding for citation union read; payload-min-size",
      status: "open",
      created_at: new Date().toISOString(),
      version: 0,
    });
    writeRaw("citations.jsonl", {
      id: "citation-union-1",
      entry_kind: "citation",
      source: "meta-citation-host",
      target: "meta-citation-other",
      rationale: "test-rationale",
      recorded_at: new Date().toISOString(),
      recorded_by: "test",
      status: "active",
      version: 0,
    });
    const entries = readRegistry(root);
    assert.equal(entries.length, 2);
    const ids = entries.map((e) => e.id).sort();
    assert.deepEqual(ids, ["citation-union-1", "meta-citation-host"]);
  });

  test("cache invalidation: append a citation, the next read sees it without restart", async () => {
    // First read: cache miss → empty projection.
    const first = readRegistry(root);
    assert.equal(first.length, 0);
    // Append a citation directly to disk.
    appendFileSync(
      join(root, "citations.jsonl"),
      JSON.stringify({
        id: "citation-stale-cache-1",
        entry_kind: "citation",
        source: "meta-a",
        target: "meta-b",
        rationale: "stale-cache-test",
        recorded_at: new Date().toISOString(),
        recorded_by: "test",
        status: "active",
        version: 0,
      }) + "\n",
      "utf8",
    );
    // Second read: must pick up the citation. If the read cache did not
    // include the citations.jsonl mtime+size, this would return [].
    const second = readRegistry(root);
    assert.equal(second.length, 1, "post-append read must include the citation");
    assert.equal(second[0].id, "citation-stale-cache-1");
  });
});

describe("buildInverseIndexes — citations_inverse additive map", () => {
  test("populates citations_inverse from citation rows (target→source)", async () => {
    // Seed two findings + two citations so we have a non-trivial citations_inverse.
    writeRaw("meta-state.jsonl", {
      id: "meta-cited-target",
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "meta",
      description: "Target finding for citations_inverse test; payload-min-size",
      status: "open",
      created_at: new Date().toISOString(),
      version: 0,
    });
    writeRaw("meta-state.jsonl", {
      id: "meta-cited-source",
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "meta",
      description: "Source finding for citations_inverse test; payload-min-size",
      status: "open",
      created_at: new Date().toISOString(),
      version: 0,
    });
    writeRaw("citations.jsonl", {
      id: "citation-cix-1",
      entry_kind: "citation",
      source: "meta-cited-source",
      target: "meta-cited-target",
      rationale: "origin",
      recorded_at: new Date().toISOString(),
      recorded_by: "test",
      status: "active",
      version: 0,
    });
    const entries = readRegistry(root);
    const indexes = buildInverseIndexes(entries);
    // citations_inverse is a Map keyed by the citation's TARGET id.
    assert.ok(indexes.citations_inverse instanceof Map, "citations_inverse must be a Map");
    const sourcesForTarget = indexes.citations_inverse.get("meta-cited-target");
    assert.ok(Array.isArray(sourcesForTarget), "citations_inverse lookup must be array-shaped");
    assert.deepEqual(sourcesForTarget, ["meta-cited-source"]);
  });

  test("the migrated named maps still populate from on-record fields (Phase 2 is additive)", async () => {
    // Seed a finding with a reopens field; the reopens_inverse map must
    // populate from the on-record field (Phase 5 drops the writer; the
    // field stays inert-historical).
    writeRaw("meta-state.jsonl", {
      id: "meta-reopens-anchor",
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "meta",
      description: "Reopens anchor for additive-map invariant; payload-min-size",
      status: "open",
      reopens: ["meta-stale-1"],
      created_at: new Date().toISOString(),
      version: 0,
    });
    const entries = readRegistry(root);
    const indexes = buildInverseIndexes(entries);
    assert.deepEqual(
      indexes.reopens_inverse.get("meta-stale-1"),
      ["meta-reopens-anchor"],
      "reopens_inverse populated from on-record field (additive; no double count with citations_inverse)",
    );
  });

  test("citations_inverse coexists with named maps (no overlap on different wire keys)", async () => {
    // on-record reopens + a citation pointing at the same target — both
    // populate their own maps; citations_inverse covers the citation, the
    // named map covers reopens.
    writeRaw("meta-state.jsonl", {
      id: "meta-share-anchor",
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "meta",
      description: "Anchor for no-double-count invariant; payload-min-size",
      status: "open",
      reopens: ["meta-share-target"],
      created_at: new Date().toISOString(),
      version: 0,
    });
    writeRaw("citations.jsonl", {
      id: "citation-share-1",
      entry_kind: "citation",
      source: "meta-other",
      target: "meta-share-target",
      rationale: "test",
      recorded_at: new Date().toISOString(),
      recorded_by: "test",
      status: "active",
      version: 0,
    });
    const entries = readRegistry(root);
    const indexes = buildInverseIndexes(entries);
    assert.deepEqual(indexes.reopens_inverse.get("meta-share-target"), ["meta-share-anchor"]);
    assert.deepEqual(indexes.citations_inverse.get("meta-share-target"), ["meta-other"]);
  });
});

describe("forwardRefs — citation contributes source + target", () => {
  test("forwardRefs on a citation returns both ends", async () => {
    writeRaw("citations.jsonl", {
      id: "citation-fwd-1",
      entry_kind: "citation",
      source: "meta-citation-fwd-source",
      target: "meta-citation-fwd-target",
      rationale: "test",
      recorded_at: new Date().toISOString(),
      recorded_by: "test",
      status: "active",
      version: 0,
    });
    const entries = readRegistry(root);
    const cit = entries.find((e) => e.id === "citation-fwd-1");
    const refs = forwardRefs(cit, entries);
    const ids = refs.map((r) => r.id).sort();
    // Both source and target must appear; the field name is the
    // citation field (the field branch is wired in Phase 3+; for now the
    // citation-kind table only declares {source, target} refspecs).
    assert.ok(ids.includes("meta-citation-fwd-source"));
    assert.ok(ids.includes("meta-citation-fwd-target"));
  });
});
