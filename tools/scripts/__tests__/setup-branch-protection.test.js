// Unit tests for tools/scripts/setup-branch-protection.mjs.
//
// Locks the single-source-of-truth contract: the required-check context is
// PARSED from the workflow YAML job id, not hand-typed. This is the invariant
// that prevents the original bug (branch protection required the workflow
// display name `meta-state refs check` while the Actions check run is named
// after the JOB id `refs-check`, so the required check stayed PENDING forever).
//
// Covers the offline surface only (--dry-run, --help, arg parsing, job-id
// extraction, error paths). The gh-mutating apply path is exercised live by
// the operator via the script itself, not by this suite. Mirrors the
// setup-git-merge-drivers.test.js temp-fixture idiom.

import { describe, test, afterEach } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "../setup-branch-protection.mjs");

const tmpDirs = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function runScript(args = []) {
  return spawnSync("node", [SCRIPT, ...args], { encoding: "utf8" });
}

function tmpWorkflow(content) {
  const dir = mkdtempSync(join(tmpdir(), "setup-bp-"));
  tmpDirs.push(dir);
  const path = join(dir, "wf.yml");
  writeFileSync(path, content, "utf8");
  return { dir, path };
}

describe("setup-branch-protection --dry-run (offline)", () => {
  test("parses the first job id and binds the required-check context to it", () => {
    const { path } = tmpWorkflow(
      [
        "name: meta-state refs check",
        "on: pull_request",
        "jobs:",
        "  refs-check:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - run: true",
      ].join("\n")
    );
    const r = runScript(["--workflow", path, "--dry-run"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /job id:\s+refs-check\b/);
    assert.match(r.stdout, /"context":"refs-check"/);
    assert.match(r.stdout, /"app_id":-1/);
    assert.match(r.stdout, /\[dry-run\] not applying/);
  });

  test("job id with hyphens and a different workflow name still binds to the job id, not the name", () => {
    // The original bug: workflow `name:` differs from job id. The script must
    // pick the JOB id, never the workflow display name.
    const { path } = tmpWorkflow(
      [
        "name: Some Display Name",
        "on: pull_request",
        "jobs:",
        "  my-cool-job:",
        "    runs-on: ubuntu-latest",
      ].join("\n")
    );
    const r = runScript(["--workflow", path, "--dry-run"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /job id:\s+my-cool-job\b/);
    assert.doesNotMatch(r.stdout, /"context":"Some Display Name"/);
  });

  test("warns when multiple jobs exist and still binds to the first", () => {
    const { path } = tmpWorkflow(
      [
        "jobs:",
        "  first-job:",
        "    runs-on: ubuntu-latest",
        "  second-job:",
        "    runs-on: ubuntu-latest",
      ].join("\n")
    );
    const r = runScript(["--workflow", path, "--dry-run"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /job id:\s+first-job\b/);
    // Multi-job warning is written to stderr.
    assert.match(r.stderr, /WARNING/);
    assert.match(r.stderr, /second-job/);
  });
});

describe("setup-branch-protection error paths", () => {
  test("missing workflow file exits 1", () => {
    const r = runScript(["--workflow", "/nonexistent/path.yml", "--dry-run"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /workflow not found/);
  });

  test("workflow with no jobs mapping exits 1", () => {
    const { path } = tmpWorkflow("name: x\non: push\n");
    const r = runScript(["--workflow", path, "--dry-run"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no 'jobs:' mapping/);
  });

  test("unknown arg exits 1", () => {
    const r = runScript(["--bogus"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /unknown arg/);
  });

  test("--help exits 0", () => {
    const r = runScript(["--help"]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /usage:/);
  });
});