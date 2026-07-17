// Unit tests for the duplicate-version-per-id CI advisory (Tier 2 Phase C).
//
// Phase C extends `tools/scripts/ci-registry-deltas.sh` with a per-id
// duplicate-detection block (Red Team S-F9: the previous jq was a single
// boolean; the corrected expression emits one WARNING per affected id).
//
// Locks:
//   (a) duplicate version-per-id in fixture -> summary emits WARNING for
//       each affected id with the count
//   (b) no duplicates in fixture -> no WARNING emitted
//   (c) advisory is non-blocking (exit 0; the change-log-ref FAIL gate is
//       the only FAIL path; duplicate-version is informational only)
//   (d) distinct-ids (different ids, same version) -> no WARNING (the
//       duplicate is per-id, not per-version)

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "../ci-registry-deltas.sh");

function runScript(args = [], opts = {}) {
  // The script writes the advisory summary to $GITHUB_STEP_SUMMARY (per CI
  // convention); route to a temp file so the test can assert on the emitted
  // WARNINGs. Mirrors the production workflow where GITHUB_STEP_SUMMARY is
  // a real file path.
  const summaryPath = join(opts.cwd ?? "/tmp", `ci-summary-${process.pid}-${Date.now()}.txt`);
  writeFileSync(summaryPath, "", "utf8");
  const env = { ...process.env, ...opts.env, GITHUB_STEP_SUMMARY: summaryPath };
  const proc = spawnSync("bash", [SCRIPT, ...args], { encoding: "utf8", env, cwd: opts.cwd });
  const summary = readFileSync(summaryPath, "utf8");
  rmSync(summaryPath, { force: true });
  return { ...proc, summary };
}

// Synthesize a "diff file" the script parses: a list of `+ <line>` markers
// representing added lines in the PR.
function makeDiff(lines) {
  return lines.map((l) => `+ ${JSON.stringify(l)}`).join("\n") + "\n";
}

// Build a base union in CWD so the change-log-ref FAIL gate does not fire
// on missing-base targets (we only want to test the duplicate-version
// advisory path here). Empty base = truly empty files (no trailing newline
// that jq would flag as a malformed line).
function writeBaseCwd(cwd, lines) {
  writeFileSync(join(cwd, "meta-state.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n"), "utf8");
  writeFileSync(join(cwd, "change-log.jsonl"), "", "utf8");
}

function entry(id, fields) {
  return { id, entry_kind: "finding", status: "open", created_at: "2026-07-15T10:00:00.000Z", ...fields };
}

describe("ci-registry-deltas.sh: duplicate-version-per-id advisory (Phase C)", () => {
  test("script exists and is executable", () => {
    assert.ok(existsSync(SCRIPT), `script missing at ${SCRIPT}`);
  });

  test("duplicate version-per-id in diff -> summary emits WARNING per affected id, advisory is exit 0", () => {
    const cwd = mkdtempSync(join(tmpdir(), "ci-dup-version-"));
    try {
      writeBaseCwd(cwd, []);
      // Two entries for the same id (no version field) trigger duplicate-id detection.
      const diff = makeDiff([
        { id: "dup-id-1", entry_kind: "finding", status: "open" },
        { id: "dup-id-1", entry_kind: "finding", status: "open" },
        { id: "unique-id", entry_kind: "finding", status: "open" },
      ]);
      const diffPath = join(cwd, "diff.txt");
      writeFileSync(diffPath, diff, "utf8");
      const proc = runScript([diffPath], { cwd });
      // Exit 0: the duplicate-version advisory is WARN-only (per Validation
      // Session 1 Q2: pre-merge WARNING only; no block).
      assert.strictEqual(proc.status, 0,
        `duplicate-version advisory must be advisory-only (exit 0), got ${proc.status}\nstderr: ${proc.stderr}\nsummary: ${proc.summary}`);
      assert.match(proc.summary, /duplicate[\s\S]*dup-id-1/i,
        `summary must emit a duplicate-version WARNING for dup-id-1, got: ${proc.summary}\nstderr: ${proc.stderr}\nstdout: ${proc.stdout}`);
      assert.doesNotMatch(proc.summary, /duplicate.*unique-id/i,
        `summary must NOT emit a duplicate-version WARNING for unique-id, got: ${proc.summary}`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("no duplicates in diff -> no duplicate-version WARNING, exit 0", () => {
    const cwd = mkdtempSync(join(tmpdir(), "ci-dup-version-"));
    try {
      writeBaseCwd(cwd, []);
      const diff = makeDiff([
        { id: "alpha", entry_kind: "finding", status: "open" },
        { id: "beta", entry_kind: "finding", status: "open" },
        { id: "gamma", entry_kind: "finding", status: "open" },
      ]);
      const diffPath = join(cwd, "diff.txt");
      writeFileSync(diffPath, diff, "utf8");
      const proc = runScript([diffPath], { cwd });
      assert.strictEqual(proc.status, 0);
      assert.doesNotMatch(proc.summary, /duplicate/i,
        `summary must NOT emit a duplicate-version WARNING when every id is unique, got: ${proc.summary}`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("distinct ids with the same version -> no WARNING (per-id, not per-version)", () => {
    const cwd = mkdtempSync(join(tmpdir(), "ci-dup-version-"));
    try {
      writeBaseCwd(cwd, []);
      const diff = makeDiff([
        { id: "alpha", entry_kind: "finding", version: 1, status: "open" },
        { id: "beta", entry_kind: "finding", version: 1, status: "open" },
      ]);
      const diffPath = join(cwd, "diff.txt");
      writeFileSync(diffPath, diff, "utf8");
      const proc = runScript([diffPath], { cwd });
      assert.strictEqual(proc.status, 0);
      assert.doesNotMatch(proc.summary, /duplicate/i,
        `distinct ids with same version must NOT trigger duplicate-version WARNING, got: ${proc.summary}`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
