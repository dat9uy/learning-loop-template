import assert from "node:assert";
import { test, beforeEach, afterEach } from "node:test";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { SURFACES, appendToAllSurfaces } from "../../core/legacy/surfaces.js";

let root;

beforeEach(() => {
  root = join(tmpdir(), `surfaces-append-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

await test("appendToAllSurfaces creates files on every surface when parent dirs are missing", () => {
  appendToAllSurfaces(root, "logs/append.log", JSON.stringify({ a: 1 }));

  for (const surface of SURFACES) {
    const path = join(root, surface, "coordination", "logs", "append.log");
    assert.ok(existsSync(path), `expected ${path} to exist`);
    const content = readFileSync(path, "utf8").trim();
    assert.strictEqual(content, JSON.stringify({ a: 1 }));
  }
});

await test("appendToAllSurfaces appends to existing files without overwriting", () => {
  for (const surface of SURFACES) {
    const dir = join(root, surface, "coordination", "logs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "append.log"), JSON.stringify({ first: true }) + "\n", "utf8");
  }

  appendToAllSurfaces(root, "logs/append.log", JSON.stringify({ second: true }));

  for (const surface of SURFACES) {
    const path = join(root, surface, "coordination", "logs", "append.log");
    const lines = readFileSync(path, "utf8").trim().split("\n");
    assert.strictEqual(lines.length, 2);
    assert.strictEqual(lines[0], JSON.stringify({ first: true }));
    assert.strictEqual(lines[1], JSON.stringify({ second: true }));
  }
});

await test("appendToAllSurfaces writes each line followed by a newline", () => {
  appendToAllSurfaces(root, "logs/append.log", JSON.stringify({ line: 1 }));

  for (const surface of SURFACES) {
    const path = join(root, surface, "coordination", "logs", "append.log");
    const content = readFileSync(path, "utf8");
    assert.ok(content.endsWith("\n"), "line should end with newline");
    assert.strictEqual(content.split("\n").filter(Boolean).length, 1);
  }
});
