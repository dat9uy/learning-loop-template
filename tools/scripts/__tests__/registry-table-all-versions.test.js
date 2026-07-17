// Unit tests for tools/scripts/registry-table.sh --all-versions.
//
// Locks the symmetric flag pair with meta_state_list's include_all_versions:
//   (a) --all-versions bypasses the max_by(.version) collapse and emits
//       every line per id, sorted by (id, version) ascending
//   (b) default (no flag) preserves the existing collapse behavior
//   (c) --all-versions on a one-line-per-id file is an identity projection
//   (d) --all-versions after a positional path fails closed with usage (exit 2)

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, "../registry-table.sh");
const ONE_LINE_FIXTURE = resolve(__dirname, "../__fixtures__/registry-one-line-per-id.jsonl");
const VERSIONED_FIXTURE = resolve(__dirname, "../__fixtures__/registry-versioned.jsonl");

function runScript(args = []) {
  return spawnSync("bash", [SCRIPT, ...args], { encoding: "utf8" });
}

describe("registry-table.sh: --all-versions", () => {
  test("--all-versions emits every line per id, sorted by (id, version) ascending", () => {
    const proc = runScript(["--all-versions", VERSIONED_FIXTURE]);
    assert.strictEqual(proc.status, 0, `expected exit 0, got ${proc.status}\nstdout: ${proc.stdout}\nstderr: ${proc.stderr}`);
    const parsed = proc.stdout.split("\n").filter((l) => l.length > 0).map((l) => JSON.parse(l));
    assert.strictEqual(parsed.length, 5, `expected all 5 lines, got ${parsed.length}`);
    assert.deepStrictEqual(
      parsed.map((e) => [e.id, e.version]),
      [
        ["alpha", 1],
        ["alpha", 2],
        ["alpha", 3],
        ["beta", 1],
        ["beta", 2],
      ],
    );
  });

  test("default (no flag) preserves the max-version collapse", () => {
    const proc = runScript([VERSIONED_FIXTURE]);
    assert.strictEqual(proc.status, 0, `expected exit 0, got ${proc.status}\nstdout: ${proc.stdout}\nstderr: ${proc.stderr}`);
    const outLines = proc.stdout.split("\n").filter((l) => l.length > 0);
    assert.strictEqual(outLines.length, 2, `expected 2 collapsed ids, got ${outLines.length}`);
  });

  test("--all-versions on a one-line-per-id file is an identity projection", () => {
    const proc = runScript(["--all-versions", ONE_LINE_FIXTURE]);
    assert.strictEqual(proc.status, 0, `expected exit 0, got ${proc.status}\nstdout: ${proc.stdout}\nstderr: ${proc.stderr}`);
    const outLines = proc.stdout.split("\n").filter((l) => l.length > 0);
    assert.strictEqual(outLines.length, 3, `expected 3 lines (identity), got ${outLines.length}`);
  });

  test("--all-versions after a positional path fails closed with usage (exit 2)", () => {
    const proc = runScript([VERSIONED_FIXTURE, "--all-versions"]);
    assert.strictEqual(proc.status, 2, `expected exit 2, got ${proc.status}\nstdout: ${proc.stdout}\nstderr: ${proc.stderr}`);
    assert.match(proc.stderr, /--all-versions/);
    assert.match(proc.stderr, /usage:/);
  });
});
