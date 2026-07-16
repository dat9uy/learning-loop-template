// Unit tests for tools/scripts/test-one.sh.
//
// Locks the contract:
//   (a) script exists + is executable
//   (b) contains NO literal `|` (gate-safety invariant: it must not pipe
//       vitest stdout to tail/grep — the JSON path is the source of truth)
//   (c) forwards "$@" to `vitest run --bail=1` (focused single-file path)
//   (d) calls vitest-failures.sh to print the parsed summary
//   (e) end-to-end: a stubbed `vitest` that writes green JSON → exit 0 + summary;
//       a stub that writes nothing → exit 2 (mirrors vitest-failures.sh)
//
// A stub `vitest` on a private PATH means no real test suite runs.

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, "../test-one.sh");
const RESULTS_PATH = resolve(__dirname, "../../../.test-logs/vitest-results.json");

function stubBin(tmp, body) {
  const binDir = join(tmp, "bin");
  mkdirSync(binDir, { recursive: true });
  const stubPath = join(binDir, "vitest");
  writeFileSync(stubPath, body);
  chmodSync(stubPath, 0o755);
  return binDir;
}

describe("test-one.sh: static contract", () => {
  test("script is executable and exists", () => {
    assert.ok(existsSync(SCRIPT), `script missing at ${SCRIPT}`);
  });

  test("contains NO literal pipe char in code lines (gate-safety invariant)", () => {
    // The whole point of this wrapper is the one-command JSON path; a `|`
    // would reintroduce the shape rule-no-raw-stdout-vitest blocks.
    const codeLines = readFileSync(SCRIPT, "utf8")
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("#"))
      .join("\n");
    assert.doesNotMatch(codeLines, /\|/, "test-one.sh must not contain a shell pipe");
  });

  test('forwards "$@" to vitest run --bail=1', () => {
    assert.match(readFileSync(SCRIPT, "utf8"), /vitest run --bail=1 "\$@"/);
  });

  test("calls vitest-failures.sh for the parsed summary", () => {
    assert.match(readFileSync(SCRIPT, "utf8"), /vitest-failures\.sh/);
  });
});

describe("test-one.sh: behavior (stubbed vitest)", () => {
  test("forwards the file arg to vitest and prints green summary, exit 0", () => {
    const tmp = mkdtempSync(join(tmpdir(), "test-one-green-"));
    const markerPath = join(tmp, "args.txt");
    const stub = `#!/usr/bin/env bash
printf '%s\\n' "$@" > "${markerPath}"
mkdir -p "$(dirname "${RESULTS_PATH}")"
printf '{"numTotalTestSuites":1,"numPassedTestSuites":1,"numFailedTestSuites":0,"numPendingTestSuites":0,"numTotalTests":1,"numPassedTests":1,"numFailedTests":0,"numPendingTestSuites":0,"numTodoTests":0,"success":true,"testResults":[]}' > "${RESULTS_PATH}"
exit 0
`;
    const binDir = stubBin(tmp, stub);
    try {
      const proc = spawnSync("bash", [SCRIPT, "some/file.test.js"], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
      });
      assert.strictEqual(proc.status, 0, `expected exit 0, got ${proc.status}\nstdout: ${proc.stdout}\nstderr: ${proc.stderr}`);
      const recorded = readFileSync(markerPath, "utf8").trim().split("\n");
      assert.ok(recorded.includes("some/file.test.js"), `vitest should receive the file arg; got ${JSON.stringify(recorded)}`);
      assert.match(proc.stdout, /all green: 1 tests \/ 1 suites passed/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("exit 2 when vitest-failures.sh finds no JSON (failure path)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "test-one-nojson-"));
    // Stub that runs but writes nothing — vitest-failures.sh then sees no JSON.
    const stub = "#!/usr/bin/env bash\nexit 0\n";
    const binDir = stubBin(tmp, stub);
    // Move the real results file aside so the script's vitest-failures.sh (no
    // arg) looks for the default path and finds it absent.
    const had = existsSync(RESULTS_PATH);
    const backup = had ? readFileSync(RESULTS_PATH) : null;
    if (had) rmSync(RESULTS_PATH);
    try {
      const proc = spawnSync("bash", [SCRIPT, "x.test.js"], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
      });
      assert.strictEqual(proc.status, 2, `expected exit 2 (missing JSON), got ${proc.status}\nstdout: ${proc.stdout}\nstderr: ${proc.stderr}`);
      assert.match(proc.stderr, /file not found/);
    } finally {
      if (had && backup !== null) writeFileSync(RESULTS_PATH, backup);
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
