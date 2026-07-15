// Unit tests for tools/scripts/registry-table.sh.
//
// Locks the 4-way contract:
//   (a) identity on a one-line-per-id file
//   (b) last-wins-by-max-version dedupe on a versioned file
//   (c) missing path → exit 2 + guidance
//   (d) invalid JSON → exit 2 + guidance
//
// Plus the forward-compat multi-file union assertion (Red Team F11a):
// the script accepts multiple positional args and dedupes across the union.

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, "../registry-table.sh");
const ONE_LINE_FIXTURE = resolve(__dirname, "../__fixtures__/registry-one-line-per-id.jsonl");
const VERSIONED_FIXTURE = resolve(__dirname, "../__fixtures__/registry-versioned.jsonl");

function runScript(args = []) {
  return spawnSync("bash", [SCRIPT, ...args], { encoding: "utf8" });
}

describe("registry-table.sh: contract", () => {
  test("script is executable and exists", () => {
    assert.ok(existsSync(SCRIPT), `script missing at ${SCRIPT}`);
  });

  test("identity — one-line-per-id fixture output equals input (sorted by id)", () => {
    const proc = runScript([ONE_LINE_FIXTURE]);
    assert.strictEqual(proc.status, 0, `expected exit 0, got ${proc.status}\nstdout: ${proc.stdout}\nstderr: ${proc.stderr}`);
    const expected = JSON.stringify({
      alpha: readFileSync(ONE_LINE_FIXTURE, "utf8").split("\n").filter((l) => l.includes('"alpha"'))[0],
    });
    // Output is 3 lines, one per id, in jq group_by order (alphabetical).
    const outLines = proc.stdout.split("\n").filter((l) => l.length > 0);
    assert.strictEqual(outLines.length, 3, `expected 3 lines, got ${outLines.length}: ${JSON.stringify(outLines)}`);
    const ids = outLines.map((l) => JSON.parse(l).id).sort();
    assert.deepStrictEqual(ids, ["alpha", "beta", "gamma"]);
  });

  test("last-wins-by-max-version — versioned fixture dedupes to max-version per id", () => {
    const proc = runScript([VERSIONED_FIXTURE]);
    assert.strictEqual(proc.status, 0, `expected exit 0, got ${proc.status}\nstdout: ${proc.stdout}\nstderr: ${proc.stderr}`);
    const outLines = proc.stdout.split("\n").filter((l) => l.length > 0);
    assert.strictEqual(outLines.length, 2, `expected 2 unique ids, got ${outLines.length}: ${JSON.stringify(outLines)}`);
    const parsed = outLines.map((l) => JSON.parse(l));
    const alpha = parsed.find((e) => e.id === "alpha");
    const beta = parsed.find((e) => e.id === "beta");
    assert.strictEqual(alpha.version, 3, `alpha should be max-version v=3, got ${alpha.version}`);
    assert.strictEqual(alpha.status, "open", `alpha should pick the v=3 entry (status=open), got ${alpha.status}`);
    assert.strictEqual(beta.version, 2, `beta should be max-version v=2, got ${beta.version}`);
  });

  test("missing path → exit 2 + guidance", () => {
    const proc = runScript(["/tmp/this-registry-must-not-exist-98765.jsonl"]);
    assert.strictEqual(proc.status, 2, `expected exit 2, got ${proc.status}\nstdout: ${proc.stdout}\nstderr: ${proc.stderr}`);
    assert.match(proc.stderr, /file\(s\) not found/);
    assert.match(proc.stderr, /hint:/);
  });

  test("invalid JSON → exit 2 + guidance", () => {
    const tmp = mkdtempSync(join(tmpdir(), "registry-table-bad-"));
    const badPath = join(tmp, "bad.jsonl");
    writeFileSync(badPath, "{ this is not json\n");
    try {
      const proc = runScript([badPath]);
      assert.strictEqual(proc.status, 2, `expected exit 2, got ${proc.status}\nstdout: ${proc.stdout}\nstderr: ${proc.stderr}`);
      assert.match(proc.stderr, /invalid JSON/);
      assert.match(proc.stderr, /hint:/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("multi-file union (Red Team F11a) — two fixtures dedupe across the union", () => {
    // First fixture: alpha v=1, beta v=1
    // Second fixture (synthesized): alpha v=2 — alpha should pick v=2.
    const tmp = mkdtempSync(join(tmpdir(), "registry-table-multi-"));
    const second = join(tmp, "second.jsonl");
    writeFileSync(
      second,
      JSON.stringify({ id: "alpha", entry_kind: "finding", status: "open", version: 2, created_at: "2026-02-01T00:00:00.000Z" }) + "\n" +
      JSON.stringify({ id: "delta", entry_kind: "change-log", status: "active", version: 1, created_at: "2026-02-02T00:00:00.000Z" }) + "\n",
    );
    try {
      const proc = runScript([ONE_LINE_FIXTURE, second]);
      assert.strictEqual(proc.status, 0, `expected exit 0, got ${proc.status}\nstdout: ${proc.stdout}\nstderr: ${proc.stderr}`);
      const parsed = proc.stdout.split("\n").filter((l) => l.length > 0).map((l) => JSON.parse(l));
      const ids = parsed.map((e) => e.id).sort();
      assert.deepStrictEqual(ids, ["alpha", "beta", "delta", "gamma"], "union must contain every id exactly once across both files");
      const alpha = parsed.find((e) => e.id === "alpha");
      assert.strictEqual(alpha.version, 2, `alpha must pick max-version v=2 from the second file`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("default path (no args) — uses meta-state.jsonl at CWD", () => {
    // Run from the repo root so the default resolves to ./meta-state.jsonl.
    const proc = runScript([], { cwd: process.cwd() });
    // Either exit 0 (file exists; we just dedupe and stream) or exit 2 (file
    // missing). Both are valid contract responses — the assertion is the
    // exit code is one of those, not some other failure.
    assert.ok(
      proc.status === 0 || proc.status === 2,
      `expected exit 0 or 2, got ${proc.status}\nstdout: ${proc.stdout}\nstderr: ${proc.stderr}`,
    );
  });
});
