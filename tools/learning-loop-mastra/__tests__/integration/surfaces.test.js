import assert from "node:assert";
import { test, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  SURFACES,
  getAllCoordinationPaths,
  writeToAllSurfaces,
  readFromAllSurfaces,
} from "../../core/surfaces.js";

let root;

beforeEach(() => {
  root = join(tmpdir(), `surfaces-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ─── SURFACES ───

await test("SURFACES is frozen and equals the canonical runtime set", () => {
  assert.deepStrictEqual(SURFACES, [".claude", ".factory", ".mastracode"]);
  assert.throws(() => {
    SURFACES.push(".cursor");
  });
  assert.throws(() => {
    SURFACES[0] = ".cursor";
  });
});

// ─── getAllCoordinationPaths ───

await test("getAllCoordinationPaths maps each surface to <surface>/coordination/<subpath>", () => {
  const paths = getAllCoordinationPaths("hooks/bash-gate.js");
  assert.deepStrictEqual(paths, [
    ".claude/coordination/hooks/bash-gate.js",
    ".factory/coordination/hooks/bash-gate.js",
    ".mastracode/coordination/hooks/bash-gate.js",
  ]);
});

await test("getAllCoordinationPaths handles nested subpaths", () => {
  const paths = getAllCoordinationPaths("a/b/c.txt");
  assert.deepStrictEqual(paths, [
    ".claude/coordination/a/b/c.txt",
    ".factory/coordination/a/b/c.txt",
    ".mastracode/coordination/a/b/c.txt",
  ]);
});

// ─── writeToAllSurfaces ───

await test("writeToAllSurfaces creates directories and writes content to all surfaces", () => {
  writeToAllSurfaces(root, "markers/test.json", '{"foo": "bar"}');

  for (const surface of SURFACES) {
    const path = join(root, surface, "coordination", "markers", "test.json");
    assert.ok(existsSync(path), `expected ${path} to exist`);
    assert.strictEqual(readFileSync(path, "utf8"), '{"foo": "bar"}');
  }
});

await test("writeToAllSurfaces is atomic (write-temp + rename)", () => {
  writeToAllSurfaces(root, "markers/atomic.json", '{"atomic": true}');

  for (const surface of SURFACES) {
    const coordDir = join(root, surface, "coordination");
    const entries = readdirSync(coordDir, { recursive: true });
    const tmpFiles = entries.filter((e) => e.endsWith(".tmp"));
    assert.strictEqual(tmpFiles.length, 0, `no .tmp files should remain in ${surface}`);
  }
});

await test("writeToAllSurfaces best-effort: skip-on-permission-denied (Unix)", () => {
  if (process.platform === "win32") return; // skip on Windows
  const factoryDir = join(root, ".factory", "coordination");
  mkdirSync(factoryDir, { recursive: true });
  chmodSync(factoryDir, 0o000);
  try {
    writeToAllSurfaces(root, "markers/best-effort.json", '{"ok": true}');
    const claudePath = join(root, ".claude", "coordination", "markers", "best-effort.json");
    assert.ok(existsSync(claudePath), ".claude should still get the file");
  } finally {
    chmodSync(factoryDir, 0o755);
  }
});

// ─── readFromAllSurfaces ───

await test("readFromAllSurfaces returns parsed content for each surface", () => {
  for (const surface of SURFACES) {
    const path = join(root, surface, "coordination", "markers", "read.json");
    mkdirSync(join(root, surface, "coordination", "markers"), { recursive: true });
    writeFileSync(path, JSON.stringify({ surface, value: 42 }), "utf8");
  }

  const results = readFromAllSurfaces(root, "markers/read.json");
  assert.strictEqual(results.length, SURFACES.length);
  for (let i = 0; i < SURFACES.length; i++) {
    assert.strictEqual(results[i].surface, SURFACES[i]);
    assert.deepStrictEqual(results[i].parsed, { surface: SURFACES[i], value: 42 });
  }
});

await test("readFromAllSurfaces({ first: true }) returns the first hit, skipping missing", () => {
  // Only write to .claude
  const claudePath = join(root, ".claude", "coordination", "markers", "first.json");
  mkdirSync(join(root, ".claude", "coordination", "markers"), { recursive: true });
  writeFileSync(claudePath, JSON.stringify({ winner: ".claude" }), "utf8");

  const result = readFromAllSurfaces(root, "markers/first.json", { first: true });
  assert.deepStrictEqual(result, { surface: ".claude", content: '{"winner":".claude"}', parsed: { winner: ".claude" } });
});

await test("readFromAllSurfaces returns [] for a subpath that does not exist on any surface", () => {
  const results = readFromAllSurfaces(root, "nonexistent/file.json");
  assert.deepStrictEqual(results, []);
});

await test("readFromAllSurfaces({ first: true }) returns null when nothing exists", () => {
  const result = readFromAllSurfaces(root, "nonexistent/file.json", { first: true });
  assert.strictEqual(result, null);
});

await test("readFromAllSurfaces skips surfaces with malformed JSON", () => {
  const claudePath = join(root, ".claude", "coordination", "markers", "bad.json");
  const factoryPath = join(root, ".factory", "coordination", "markers", "bad.json");
  mkdirSync(join(root, ".claude", "coordination", "markers"), { recursive: true });
  mkdirSync(join(root, ".factory", "coordination", "markers"), { recursive: true });
  writeFileSync(claudePath, "not json {", "utf8");
  writeFileSync(factoryPath, JSON.stringify({ winner: ".factory" }), "utf8");

  const results = readFromAllSurfaces(root, "markers/bad.json");
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].surface, ".factory");
  assert.deepStrictEqual(results[0].parsed, { winner: ".factory" });

  const first = readFromAllSurfaces(root, "markers/bad.json", { first: true });
  assert.deepStrictEqual(first, { surface: ".factory", content: '{"winner":".factory"}', parsed: { winner: ".factory" } });
});

await test("readFromAllSurfaces never throws on per-surface errors", () => {
  // Missing files, malformed JSON, etc. should all resolve to empty or null
  assert.doesNotThrow(() => {
    const results = readFromAllSurfaces(root, "missing/foo.json");
    assert.deepStrictEqual(results, []);
  });
  assert.doesNotThrow(() => {
    const result = readFromAllSurfaces(root, "missing/foo.json", { first: true });
    assert.strictEqual(result, null);
  });
});

await test("readFromAllSurfaces({ first: true }) prefers .claude over .factory when both fresh", () => {
  const claudePath = join(root, ".claude", "coordination", "markers", "priority.json");
  const factoryPath = join(root, ".factory", "coordination", "markers", "priority.json");
  mkdirSync(join(root, ".claude", "coordination", "markers"), { recursive: true });
  mkdirSync(join(root, ".factory", "coordination", "markers"), { recursive: true });
  writeFileSync(claudePath, JSON.stringify({ priority: 1 }), "utf8");
  writeFileSync(factoryPath, JSON.stringify({ priority: 2 }), "utf8");

  const result = readFromAllSurfaces(root, "markers/priority.json", { first: true });
  assert.strictEqual(result.surface, ".claude");
  assert.deepStrictEqual(result.parsed, { priority: 1 });
});
