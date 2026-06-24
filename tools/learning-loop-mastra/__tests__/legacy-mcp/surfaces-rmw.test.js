import assert from "node:assert";
import { test, beforeEach, afterEach } from "node:test";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { SURFACES, readModifyWriteOnAllSurfaces } from "../../core/surfaces.js";

let root;

beforeEach(() => {
  root = join(tmpdir(), `surfaces-rmw-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function surfacePath(surface, subpath) {
  return join(root, surface, "coordination", subpath);
}

await test("readModifyWriteOnAllSurfaces reads existing value, applies modifier, and writes atomically", () => {
  for (const surface of SURFACES) {
    const path = surfacePath(surface, "markers/rmw.json");
    mkdirSync(join(root, surface, "coordination", "markers"), { recursive: true });
    writeFileSync(path, JSON.stringify({ original: true }), "utf8");
  }

  const results = readModifyWriteOnAllSurfaces(root, "markers/rmw.json", (current) => ({
    ...current,
    updated: true,
  }));

  assert.strictEqual(results.length, 2);
  assert.ok(results.every((r) => r.action === "wrote"));

  for (const surface of SURFACES) {
    const path = surfacePath(surface, "markers/rmw.json");
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    assert.strictEqual(parsed.original, true);
    assert.strictEqual(parsed.updated, true);
    const entries = readdirSync(join(root, surface, "coordination", "markers"));
    assert.ok(!entries.some((e) => e.endsWith(".tmp")), "no temp file left behind");
  }
});

await test("readModifyWriteOnAllSurfaces removes file when modifier returns null and removeOnNull is true", () => {
  for (const surface of SURFACES) {
    const path = surfacePath(surface, "markers/rmw.json");
    mkdirSync(join(root, surface, "coordination", "markers"), { recursive: true });
    writeFileSync(path, JSON.stringify({ stale: true }), "utf8");
  }

  const results = readModifyWriteOnAllSurfaces(root, "markers/rmw.json", () => null, { removeOnNull: true });

  assert.strictEqual(results.length, 2);
  assert.ok(results.every((r) => r.action === "removed"));
  for (const surface of SURFACES) {
    assert.ok(!existsSync(surfacePath(surface, "markers/rmw.json")));
  }
});

await test("readModifyWriteOnAllSurfaces is fail-open when modifier throws", () => {
  let calls = 0;
  const results = readModifyWriteOnAllSurfaces(
    root,
    "markers/rmw.json",
    () => {
      calls++;
      throw new Error("bad modifier");
    },
  );

  assert.strictEqual(calls, 2);
  assert.strictEqual(results.length, 2);
  assert.ok(results.every((r) => r.action === "skipped"));
});
