// Unit tests for the SessionStart git-merge-driver preflight hook.
//
// Locks the classification contract:
//   - pure classifyMergeDriverMode: canonical / unset / wrong-order / non-canonical
//   - integration: spawn the hook against a temp repo, assert the one-line output
//   - fail-open: any internal error -> warning line, exit 0
//   - pointer targets the orchestrator (setup-git.sh), not the per-merge-driver script
//   - one-line output, no token/password substrings
//
// Mirrors the env-scrub idiom of session-start-git-push-preflight.test.js: strip
// inherited GIT_* vars so the spawned hook cannot inherit a parent git context.

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = join(__dirname, "../hooks/universal/session-start-git-merge-driver-preflight.cjs");
const CANONICAL_DRIVER = "git merge-file --union %A %O %B";

function cleanGitEnv(base = process.env) {
  // Strips ALL inherited GIT_* vars (no GIT_SSH_COMMAND allowlist, unlike the
  // push-preflight test): this hook does no SSH work — it only reads
  // merge.union.driver — so there is no offline-SSH path to preserve.
  const env = { ...base };
  for (const k of Object.keys(env)) {
    if (k.startsWith("GIT_")) delete env[k];
  }
  return env;
}

function makeRepo() {
  const work = mkdtempSync(join(tmpdir(), "merge-driver-preflight-"));
  const r = spawnSync("git", ["init", "--initial-branch=main"], {
    encoding: "utf8", cwd: work, env: cleanGitEnv(),
  });
  if (r.status !== 0) throw new Error(`git init failed: ${r.stderr}`);
  return work;
}

function setDriver(cwd, value) {
  spawnSync("git", ["config", "merge.union.driver", value], {
    encoding: "utf8", cwd, env: cleanGitEnv(),
  });
}

function runHook({ cwd, env, input } = {}) {
  return spawnSync("node", [HOOK], {
    encoding: "utf8",
    cwd,
    env: cleanGitEnv(env),
    input,
  });
}

describe("session-start-git-merge-driver-preflight: classifyMergeDriverMode (pure)", () => {
  const { classifyMergeDriverMode, MODES } = require(HOOK);

  test("(a) canonical value -> canonical, no pointer", () => {
    const r = classifyMergeDriverMode({ driverValue: CANONICAL_DRIVER });
    assert.equal(r.mode, MODES.CANONICAL);
    assert.equal(r.pointer, false);
  });

  test("(b) unset (null) -> unset + pointer", () => {
    const r = classifyMergeDriverMode({ driverValue: null });
    assert.equal(r.mode, MODES.UNSET);
    assert.equal(r.pointer, true);
  });

  test("(c) empty string -> unset + pointer (defensive)", () => {
    const r = classifyMergeDriverMode({ driverValue: "" });
    assert.equal(r.mode, MODES.UNSET);
    assert.equal(r.pointer, true);
  });

  test("(d) wrong-order value -> wrong-order + pointer", () => {
    const r = classifyMergeDriverMode({ driverValue: "git merge-file --union %O %A %B" });
    assert.equal(r.mode, MODES.WRONG_ORDER);
    assert.equal(r.pointer, true);
  });

  test("(e) non-canonical other value -> non-canonical + pointer", () => {
    const r = classifyMergeDriverMode({ driverValue: "custom-merger %A %O %B" });
    assert.equal(r.mode, MODES.NON_CANONICAL);
    assert.equal(r.pointer, true);
  });
});

describe("session-start-git-merge-driver-preflight: integration (spawned hook)", () => {
  test("(i) canonical driver -> canonical on stdout, NO pointer", () => {
    const work = makeRepo();
    try {
      setDriver(work, CANONICAL_DRIVER);
      const proc = runHook({ cwd: work, input: "{}" });
      assert.equal(proc.status, 0, `hook must exit 0, got ${proc.status}\nstderr: ${proc.stderr}`);
      assert.match(proc.stdout, /git-merge-driver preflight: canonical/);
      assert.doesNotMatch(proc.stdout, /setup-git\.sh/, "canonical must not include the pointer");
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  test("(ii) unset driver -> unset + pointer to orchestrator", () => {
    const work = makeRepo();
    try {
      const proc = runHook({ cwd: work, input: "{}" });
      assert.equal(proc.status, 0);
      assert.match(proc.stdout, /git-merge-driver preflight: unset/);
      assert.match(proc.stdout, /setup-git\.sh/, "unset must point at the orchestrator");
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  test("(iii) wrong-order driver -> wrong-order + pointer", () => {
    const work = makeRepo();
    try {
      setDriver(work, "git merge-file --union %O %A %B");
      const proc = runHook({ cwd: work, input: "{}" });
      assert.equal(proc.status, 0);
      assert.match(proc.stdout, /git-merge-driver preflight: wrong-order/);
      assert.match(proc.stdout, /setup-git\.sh/);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  test("(iv) non-canonical driver -> non-canonical + pointer", () => {
    const work = makeRepo();
    try {
      setDriver(work, "custom-merger %A %O %B");
      const proc = runHook({ cwd: work, input: "{}" });
      assert.equal(proc.status, 0);
      assert.match(proc.stdout, /git-merge-driver preflight: non-canonical/);
      assert.match(proc.stdout, /setup-git\.sh/);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  test("(v) not a git repo -> warning line, exit 0 (fail-open)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "merge-driver-preflight-nogit-"));
    try {
      const proc = runHook({ cwd: tmp, input: "{}" });
      assert.equal(proc.status, 0, "non-repo must be fail-open (exit 0)");
      // readDriver swallows the error and returns null -> the hook emits an
      // `unset` line (the safe default for an unreadable state), not a crash.
      assert.match(proc.stdout, /git-merge-driver preflight: unset/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("(vi) output is one line, no token/password substrings", () => {
    const work = makeRepo();
    try {
      setDriver(work, CANONICAL_DRIVER);
      const proc = runHook({ cwd: work, input: "{}" });
      const lines = proc.stdout.split("\n").filter((l) => l.length > 0);
      assert.equal(lines.length, 1, `output must be exactly one line, got: ${proc.stdout}`);
      assert.doesNotMatch(proc.stdout, /token/i);
      assert.doesNotMatch(proc.stdout, /password/i);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});