// Unit tests for tools/scripts/vitest-failures.sh.
//
// Locks the 4-way contract: green → exit 0 + summary line; failures → exit 1
// + fullName + truncated failureMessages; missing path → exit 2 + guidance;
// invalid JSON → exit 2 + guidance. Re-run after any script edit.

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, "../vitest-failures.sh");
const FAILED_FIXTURE = resolve(__dirname, "../__fixtures__/vitest-results-failed.json");

function runScript(args = []) {
  return spawnSync("bash", [SCRIPT, ...args], { encoding: "utf8" });
}

describe("vitest-failures.sh: contract", () => {
  test("script is executable and exists", () => {
    assert.ok(existsSync(SCRIPT), `script missing at ${SCRIPT}`);
  });

  test("green fixture → exit 0 + summary line (hermetic)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "vitest-fail-green-"));
    const greenPath = join(tmp, "green.json");
    writeFileSync(
      greenPath,
      JSON.stringify({
        numTotalTestSuites: 3,
        numPassedTestSuites: 3,
        numFailedTestSuites: 0,
        numPendingTestSuites: 0,
        numTotalTests: 42,
        numPassedTests: 42,
        numFailedTests: 0,
        numPendingTests: 0,
        numTodoTests: 0,
        success: true,
        testResults: [
          { name: "a", assertionResults: [{ ancestorTitles: [], fullName: "a > x", status: "passed", title: "x", failureMessages: [] }] },
        ],
      }),
    );
    try {
      const proc = runScript([greenPath]);
      assert.strictEqual(proc.status, 0, `expected exit 0, got ${proc.status}\nstdout: ${proc.stdout}\nstderr: ${proc.stderr}`);
      assert.match(proc.stdout, /^all green: 42 tests \/ 3 suites passed\n?$/, `unexpected summary: ${JSON.stringify(proc.stdout)}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("failed fixture → exit 1 + fullName + failureMessages", () => {
    const proc = runScript([FAILED_FIXTURE]);
    assert.strictEqual(proc.status, 1, `expected exit 1, got ${proc.status}\nstdout: ${proc.stdout}\nstderr: ${proc.stderr}`);
    assert.match(proc.stdout, /1 failing assertion\(s\):/);
    assert.match(proc.stdout, /failing suite > should reject bad input/, "fullName must be emitted");
    assert.match(proc.stdout, /AssertionError: expected 'foo' to equal 'bar'/, "failureMessages must be emitted");
  });

  test("missing path → exit 2 + guidance", () => {
    const proc = runScript(["/tmp/this-path-must-not-exist-12345.json"]);
    assert.strictEqual(proc.status, 2, `expected exit 2, got ${proc.status}\nstdout: ${proc.stdout}\nstderr: ${proc.stderr}`);
    assert.match(proc.stderr, /file not found/);
    assert.match(proc.stderr, /hint:/);
  });

  test("invalid JSON → exit 2 + guidance", () => {
    const tmp = mkdtempSync(join(tmpdir(), "vitest-fail-bad-"));
    const badPath = join(tmp, "bad.json");
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

  test("long failureMessages truncated to ~500 chars + trailing marker", () => {
    const longMsg = "x".repeat(1200);
    const tmp = mkdtempSync(join(tmpdir(), "vitest-fail-long-"));
    const longPath = join(tmp, "long.json");
    writeFileSync(
      longPath,
      JSON.stringify({
        numTotalTestSuites: 1,
        numPassedTestSuites: 0,
        numFailedTestSuites: 1,
        numPendingTestSuites: 0,
        numTotalTests: 1,
        numPassedTests: 0,
        numFailedTests: 1,
        numPendingTests: 0,
        numTodoTests: 0,
        success: false,
        testResults: [
          {
            name: "x",
            assertionResults: [
              {
                ancestorTitles: ["s"],
                fullName: "s > long",
                status: "failed",
                title: "long",
                failureMessages: [longMsg],
              },
            ],
          },
        ],
      }),
    );
    try {
      const proc = runScript([longPath]);
      assert.strictEqual(proc.status, 1);
      // Truncated body should be exactly 500 chars + the ellipsis marker.
      const m = proc.stdout.match(/      (x+…)/);
      assert.ok(m, `expected truncated marker in stdout: ${JSON.stringify(proc.stdout)}`);
      assert.strictEqual(m[1].length, 501, `expected 500 x's + … = 501 chars, got ${m[1].length}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("vitest-failures.sh: fixture shape sanity", () => {
  test("failed fixture has the keys the jq filter reads", () => {
    const data = JSON.parse(readFileSync(FAILED_FIXTURE, "utf8"));
    assert.strictEqual(typeof data.numFailedTests, "number");
    assert.strictEqual(typeof data.numTotalTests, "number");
    assert.strictEqual(typeof data.numTotalTestSuites, "number");
    assert.ok(Array.isArray(data.testResults));
    const failed = data.testResults.flatMap((s) => s.assertionResults).filter((a) => a.status === "failed");
    assert.ok(failed.length >= 1, "fixture must have at least one failed assertion");
    for (const f of failed) {
      assert.ok(typeof f.fullName === "string" && f.fullName.length > 0, "fullName required");
      assert.ok(Array.isArray(f.failureMessages) && f.failureMessages.length > 0, "failureMessages required");
    }
  });
});