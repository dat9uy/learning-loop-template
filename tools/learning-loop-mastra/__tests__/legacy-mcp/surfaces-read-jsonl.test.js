import assert from "node:assert";
import { test, beforeEach, afterEach } from "node:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { SURFACES, readJsonlFromAllSurfaces } from "../../core/legacy/surfaces.js";

let root;

beforeEach(() => {
  root = join(tmpdir(), `surfaces-read-jsonl-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeLine(surface, subpath, obj) {
  const dir = join(root, surface, "coordination", ...subpath.split("/").slice(0, -1));
  mkdirSync(dir, { recursive: true });
  const path = join(root, surface, "coordination", subpath);
  writeFileSync(path, JSON.stringify(obj) + "\n", { flag: "a", encoding: "utf8" });
}

await test("readJsonlFromAllSurfaces parses, flattens, and sorts entries across surfaces", () => {
  writeLine(".claude", "logs/events.jsonl", { ts: "2026-06-15T10:00:00.000Z", value: 1 });
  writeLine(".factory", "logs/events.jsonl", { ts: "2026-06-15T09:00:00.000Z", value: 2 });

  const entries = readJsonlFromAllSurfaces(root, "logs/events.jsonl");

  assert.strictEqual(entries.length, 2);
  assert.strictEqual(entries[0].ts, "2026-06-15T09:00:00.000Z");
  assert.strictEqual(entries[1].ts, "2026-06-15T10:00:00.000Z");
});

await test("readJsonlFromAllSurfaces dedupes entries by ts + command_prefix + rule_id", () => {
  const entry = { ts: "2026-06-15T10:00:00.000Z", command_prefix: "git push", rule_id: "rule-foo", value: 1 };
  writeLine(".claude", "logs/events.jsonl", entry);
  writeLine(".factory", "logs/events.jsonl", entry);

  const entries = readJsonlFromAllSurfaces(root, "logs/events.jsonl");

  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].value, 1);
});

await test("readJsonlFromAllSurfaces filters entries older than since", () => {
  writeLine(".claude", "logs/events.jsonl", { ts: "2026-06-15T08:00:00.000Z", value: 1 });
  writeLine(".claude", "logs/events.jsonl", { ts: "2026-06-15T10:00:00.000Z", value: 2 });

  const entries = readJsonlFromAllSurfaces(root, "logs/events.jsonl", { since: "2026-06-15T09:00:00.000Z" });

  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].value, 2);
});
