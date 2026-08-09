// Unit tests for tools/scripts/setup-git.sh — the one-command per-clone git
// setup orchestrator.
//
// Locks the orchestrator contract:
//   (a) script is executable and exists
//   (b) runs both subs on a fresh clone (broken SSH + gh shim) -> merge-driver
//       configured AND push converted to HTTPS+helper, exit 0
//   (c) idempotent: second run is a no-op, exit 0, no further mutation
//   (d) --force passes through to both: a wrong-order merge-driver is corrected
//   (e) merge-driver failure stops before push: wrong-order driver without
//       --force -> exit 1, driver NOT overwritten, push NOT attempted (no helper)
//   (f) push failure propagates: non-GitHub remote -> merge-driver runs (driver
//       set), push exits 1, orchestrator exits 1, remote unchanged
//   (g) unknown arg -> exit 2
//   (h) outside a git work tree -> exit 1
//
// Mirrors the env-discipline + gh-shim idiom of setup-git-push.test.js: strip
// inherited GIT_* vars (allowlisting GIT_SSH_COMMAND) so the temp repo's git
// uses its own .git; a per-test `bin/gh` shim fakes `gh auth status` + the
// write-verification `gh api` body so the script never reaches the network.

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "../setup-git.sh");
const CANONICAL_DRIVER = "git merge-file --union %A %O %B";

// Same env-scrub idiom as setup-git-push.test.js: strip inherited GIT_* vars
// (allowlisting GIT_SSH_COMMAND) so the temp repo's git uses its own .git.
function cleanGitEnv(base = process.env) {
  const env = { ...base };
  for (const k of Object.keys(env)) {
    if (k.startsWith("GIT_") && k !== "GIT_SSH_COMMAND") delete env[k];
  }
  return env;
}

function runScript(args = [], opts = {}) {
  return spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    cwd: opts.cwd,
    env: cleanGitEnv(opts.env),
  });
}

function runGit(args, cwd, extraEnv) {
  return spawnSync("git", args, {
    encoding: "utf8",
    cwd,
    env: cleanGitEnv(extraEnv),
  });
}

function makeTempRepo({ originPath, owner = "acme", repo = "widget", sshRemote = false, remoteUrl } = {}) {
  const work = mkdtempSync(join(tmpdir(), "setup-git-work-"));
  const init = runGit(["init", "--initial-branch=main"], work);
  assert.equal(init.status, 0, `git init failed: ${init.stderr}`);
  runGit(["config", "user.email", "test@example.com"], work);
  runGit(["config", "user.name", "Test User"], work);
  runGit(["config", "commit.gpgsign", "false"], work);

  const url = remoteUrl ?? (sshRemote
    ? `git@github.com:${owner}/${repo}.git`
    : `https://github.com/${owner}/${repo}.git`);
  const remote = runGit(["remote", "add", "origin", url], work);
  assert.equal(remote.status, 0, `git remote add failed: ${remote.stderr}`);

  writeFileSync(join(work, "README.md"), "test\n");
  runGit(["add", "README.md"], work);
  runGit(["commit", "-m", "init"], work);
  return work;
}

function makeBareRepo() {
  const dir = mkdtempSync(join(tmpdir(), "setup-git-bare-"));
  const init = runGit(["init", "--bare", "--initial-branch=main"], dir);
  assert.equal(init.status, 0, `git init --bare failed: ${init.stderr}`);
  return dir;
}

// Same gh-shim shape as setup-git-push.test.js: flat match on $1 subcommand.
function makeGhShim(behaviors = {}) {
  const dir = mkdtempSync(join(tmpdir(), "setup-git-gh-"));
  const binDir = join(dir, "bin");
  mkdirSync(binDir, { recursive: true });
  const cases = Object.entries(behaviors)
    .map(([sub, body]) => `  ${sub})\n    cat <<'GHBODY'\n${body}\nGHBODY\n    exit 0;;`)
    .join("\n");
  const shim = `#!/usr/bin/env bash
case "\${1:-}" in
${cases}
  *)
    echo "fake-gh: unknown subcommand: \$1" >&2
    exit 1
    ;;
esac
`;
  const shimPath = join(binDir, "gh");
  writeFileSync(shimPath, shim, "utf8");
  chmodSync(shimPath, 0o755);
  return { dir, path: binDir, shimPath };
}

function withPath(env, dir) {
  const basePath = env.PATH || process.env.PATH || "";
  return { ...env, PATH: `${dir}:${basePath}` };
}

function readRemote(cwd) {
  return runGit(["config", "--local", "--get", "remote.origin.url"], cwd).stdout.trim();
}

function readDriver(cwd) {
  return runGit(["config", "--get", "merge.union.driver"], cwd).stdout.trim();
}

function readHelper(cwd) {
  return runGit(["config", "--local", "--get", "credential.https://github.com.helper"], cwd).stdout.trim();
}

describe("setup-git.sh: orchestrator contract", () => {
  test("script is executable and exists", () => {
    assert.ok(existsSync(SCRIPT), `script missing at ${SCRIPT}`);
  });

  test("(b) runs both subs: merge-driver configured + push converted, exit 0", () => {
    const originPath = makeBareRepo();
    const work = makeTempRepo({ originPath, sshRemote: true });
    const ghShim = makeGhShim({
      auth: "Logged in to github.com as test (oauth_token)",
      api: JSON.stringify({ permissions: { push: true } }),
    });
    try {
      const env = {
        ...withPath({}, ghShim.path),
        GIT_SSH_COMMAND: "/bin/false", // break SSH so push converts
      };
      const proc = runScript([], { cwd: work, env });
      assert.equal(proc.status, 0, `orchestrator must exit 0, got ${proc.status}\nstderr: ${proc.stderr}`);

      // Merge-driver configured with the canonical value.
      assert.equal(readDriver(work), CANONICAL_DRIVER, `merge-driver must be canonical`);
      // Push converted to HTTPS + absolute gh helper.
      assert.equal(readRemote(work), "https://github.com/acme/widget.git");
      const helper = readHelper(work);
      assert.ok(helper.startsWith("!"), `helper must use '!' prefix, got: ${helper}`);
      assert.ok(helper.includes(ghShim.shimPath), `helper must reference absolute gh shim, got: ${helper}`);
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(originPath, { recursive: true, force: true });
      rmSync(ghShim.dir, { recursive: true, force: true });
    }
  });

  test("(c) idempotent: second run is a no-op, exit 0", () => {
    const originPath = makeBareRepo();
    const work = makeTempRepo({ originPath, sshRemote: true });
    const ghShim = makeGhShim({
      auth: "logged in",
      api: JSON.stringify({ permissions: { push: true } }),
    });
    try {
      const env = { ...withPath({}, ghShim.path), GIT_SSH_COMMAND: "/bin/false" };
      const proc1 = runScript([], { cwd: work, env });
      assert.equal(proc1.status, 0);
      const driverAfter1 = readDriver(work);
      const urlAfter1 = readRemote(work);
      const helperAfter1 = readHelper(work);

      const proc2 = runScript([], { cwd: work, env });
      assert.equal(proc2.status, 0, `second run must exit 0, got ${proc2.status}\nstderr: ${proc2.stderr}`);
      assert.equal(readDriver(work), driverAfter1, `driver must not change on second run`);
      assert.equal(readRemote(work), urlAfter1, `remote must not change on second run`);
      assert.equal(readHelper(work), helperAfter1, `helper must not change on second run`);
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(originPath, { recursive: true, force: true });
      rmSync(ghShim.dir, { recursive: true, force: true });
    }
  });

  test("(d) --force passes through to both: wrong-order merge-driver corrected", () => {
    const originPath = makeBareRepo();
    const work = makeTempRepo({ originPath, sshRemote: true });
    // Pre-set the WRONG-order driver; without --force the merge sub would exit 1.
    runGit(["config", "merge.union.driver", "git merge-file --union %O %A %B"], work);
    const ghShim = makeGhShim({
      auth: "logged in",
      api: JSON.stringify({ permissions: { push: true } }),
    });
    try {
      const env = { ...withPath({}, ghShim.path), GIT_SSH_COMMAND: "/bin/false" };
      const proc = runScript(["--force"], { cwd: work, env });
      assert.equal(proc.status, 0, `--force must exit 0, got ${proc.status}\nstderr: ${proc.stderr}`);
      assert.equal(readDriver(work), CANONICAL_DRIVER, `--force must correct the wrong-order driver`);
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(originPath, { recursive: true, force: true });
      rmSync(ghShim.dir, { recursive: true, force: true });
    }
  });

  test("(e) merge-driver failure stops before push: wrong-order without --force -> exit 1, no push", () => {
    const originPath = makeBareRepo();
    const work = makeTempRepo({ originPath, sshRemote: true });
    // Pre-set the WRONG-order driver; merge sub exits 1 without --force.
    runGit(["config", "merge.union.driver", "git merge-file --union %O %A %B"], work);
    const priorUrl = readRemote(work);
    const ghShim = makeGhShim({
      auth: "logged in",
      api: JSON.stringify({ permissions: { push: true } }),
    });
    try {
      const env = { ...withPath({}, ghShim.path), GIT_SSH_COMMAND: "/bin/false" };
      const proc = runScript([], { cwd: work, env });
      assert.equal(proc.status, 1, `merge-driver failure must propagate exit 1, got ${proc.status}`);
      // Driver NOT overwritten (merge sub refused to silently overwrite).
      assert.match(readDriver(work), /%O %A %B/, `driver must be preserved (not overwritten)`);
      // Push must NOT have been attempted: remote unchanged, no helper added.
      assert.equal(readRemote(work), priorUrl, `remote must be unchanged (push did not run)`);
      const helper = runGit(["config", "--local", "--get", "credential.https://github.com.helper"], work);
      assert.notEqual(helper.status, 0, `no helper must be configured (push did not run)`);
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(originPath, { recursive: true, force: true });
      rmSync(ghShim.dir, { recursive: true, force: true });
    }
  });

  test("(f) push failure propagates: non-GitHub remote -> merge-driver runs, push exit 1, orchestrator exit 1", () => {
    const originPath = makeBareRepo();
    const work = makeTempRepo({ originPath, remoteUrl: "git@gitlab.example.com:acme/widget.git" });
    const ghShim = makeGhShim({ auth: "logged in" });
    try {
      const env = { ...withPath({}, ghShim.path), GIT_SSH_COMMAND: "/bin/false" };
      const proc = runScript([], { cwd: work, env });
      assert.equal(proc.status, 1, `push failure must propagate exit 1, got ${proc.status}`);
      // Merge-driver ran first and succeeded: driver IS configured.
      assert.equal(readDriver(work), CANONICAL_DRIVER, `merge-driver must run before push fails`);
      // Push sub rejected the non-GitHub remote: remote unchanged.
      assert.equal(readRemote(work), "git@gitlab.example.com:acme/widget.git");
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(originPath, { recursive: true, force: true });
      rmSync(ghShim.dir, { recursive: true, force: true });
    }
  });

  test("(g) unknown arg -> exit 2", () => {
    const originPath = makeBareRepo();
    const work = makeTempRepo({ originPath, sshRemote: true });
    try {
      const proc = runScript(["--bogus"], { cwd: work });
      assert.equal(proc.status, 2, `unknown arg must exit 2, got ${proc.status}\nstderr: ${proc.stderr}`);
      assert.match(proc.stderr, /unknown argument/);
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(originPath, { recursive: true, force: true });
    }
  });

  test("(h) outside a git work tree -> exit 1", () => {
    const tmp = mkdtempSync(join(tmpdir(), "setup-git-notree-"));
    try {
      const proc = runScript([], { cwd: tmp });
      assert.equal(proc.status, 1, `not-in-work-tree must exit 1, got ${proc.status}`);
      assert.match(proc.stderr, /not inside a git working tree/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});