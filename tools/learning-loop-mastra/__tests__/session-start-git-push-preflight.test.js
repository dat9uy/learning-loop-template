// Unit tests for the SessionStart git-push preflight hook.
//
// Locks the classification contract:
//   - pure classifyPushMode: scheme-first, then health
//   - integration: spawn the hook against a temp repo + fake-gh PATH
//   - fail-open: any internal error -> warning line, exit 0
//   - offline is never mislabeled `broken`
//   - one-line output, no token/password substrings
//
// Network discipline: the spawned-hook integration tests use a per-test
// fake `gh` binary on PATH; the hook's `git ls-remote` is exercised
// against a local bare repo (no network) via a fake ssh wrapper that
// resolves the host to the local bare.

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
const HOOK = join(__dirname, "../hooks/universal/session-start-git-push-preflight.cjs");

// Same env-scrub idiom as the setup-git-push tests: strip inherited
// GIT_* vars (allowlisting GIT_SSH_COMMAND) so the spawned hook cannot
// inherit a parent git context.
function cleanGitEnv(base = process.env) {
  const env = { ...base };
  for (const k of Object.keys(env)) {
    if (k.startsWith("GIT_") && k !== "GIT_SSH_COMMAND") delete env[k];
  }
  return env;
}

function makeBareRepo() {
  const dir = mkdtempSync(join(tmpdir(), "preflight-bare-"));
  // git init --bare needs a path arg; without one it inits in CWD.
  const r = spawnSync("git", ["init", "--bare", "--initial-branch=main", dir], {
    encoding: "utf8", env: cleanGitEnv(),
  });
  if (r.status !== 0) throw new Error(`git init --bare failed: ${r.stderr}`);
  return dir;
}

function makeWorkRepo({ sshRemote = false, owner = "acme", repo = "widget" } = {}) {
  const work = mkdtempSync(join(tmpdir(), "preflight-work-"));
  const r1 = spawnSync("git", ["init", "--initial-branch=main"], {
    encoding: "utf8", cwd: work, env: cleanGitEnv(),
  });
  if (r1.status !== 0) throw new Error(`git init failed: ${r1.stderr}`);
  spawnSync("git", ["config", "user.email", "t@t"], {
    encoding: "utf8", cwd: work, env: cleanGitEnv(),
  });
  spawnSync("git", ["config", "user.name", "t"], {
    encoding: "utf8", cwd: work, env: cleanGitEnv(),
  });
  const url = sshRemote
    ? `git@github.com:${owner}/${repo}.git`
    : `https://github.com/${owner}/${repo}.git`;
  const r2 = spawnSync("git", ["remote", "add", "origin", url], {
    encoding: "utf8", cwd: work, env: cleanGitEnv(),
  });
  if (r2.status !== 0) throw new Error(`git remote add failed: ${r2.stderr}`);
  return work;
}

function makeFakeGhDir(behaviors = {}) {
  // behaviors: { authStatus: 0|1, api: 0|1 } — the spawn-based integration
  // tests just care about exit codes. The fake prints nothing useful.
  const dir = mkdtempSync(join(tmpdir(), "preflight-gh-"));
  const binDir = join(dir, "bin");
  mkdirSync(binDir, { recursive: true });
  const shim = `#!/usr/bin/env bash
case "\${1:-}" in
  auth) exit ${behaviors.authStatus ?? 0};;
  api) exit ${behaviors.api ?? 0};;
  *) exit 1;;
esac
`;
  const shimPath = join(binDir, "gh");
  writeFileSync(shimPath, shim, "utf8");
  chmodSync(shimPath, 0o755);
  return { dir, binDir, shimPath };
}

function makeSshWrapper(barePath) {
  const dir = mkdtempSync(join(tmpdir(), "preflight-ssh-"));
  const wrapper = join(dir, "fake-ssh");
  writeFileSync(
    wrapper,
    "#!/bin/bash\nexec git upload-pack \"$SETUP_GIT_PUSH_SSH_BARE_PATH\"\n",
    "utf8",
  );
  chmodSync(wrapper, 0o755);
  return { dir, wrapper };
}

function runHook({ cwd, env, input }) {
  return spawnSync("node", [HOOK], {
    encoding: "utf8",
    cwd,
    env: cleanGitEnv(env),
    input,
  });
}

describe("session-start-git-push-preflight: classifyPushMode (pure)", () => {
  const { classifyPushMode, MODES } = require(HOOK);

  test("(a) HTTPS + helper + auth ok -> https-gh", () => {
    const r = classifyPushMode({
      url: "https://github.com/acme/widget.git",
      helper: "!gh auth git-credential",
      ghAuthOk: true,
      probeOk: false,
      hostReachable: false,
    });
    assert.equal(r.mode, MODES.HTTPS_GH);
    assert.equal(r.pointer, false);
  });

  test("(b) HTTPS + helper + auth fails -> https-unverified + pointer", () => {
    const r = classifyPushMode({
      url: "https://github.com/acme/widget.git",
      helper: "!gh auth git-credential",
      ghAuthOk: false,
      probeOk: false,
      hostReachable: false,
    });
    assert.equal(r.mode, MODES.HTTPS_UNVERIFIED);
    assert.equal(r.pointer, true);
  });

  test("(c) HTTPS, no helper -> https-anon + pointer", () => {
    const r = classifyPushMode({
      url: "https://github.com/acme/widget.git",
      helper: null,
      ghAuthOk: false,
      probeOk: false,
      hostReachable: false,
    });
    assert.equal(r.mode, MODES.HTTPS_ANON);
    assert.equal(r.pointer, true);
  });

  test("(d) SSH + reachable + probe ok -> ssh-ok", () => {
    const r = classifyPushMode({
      url: "git@github.com:acme/widget.git",
      helper: null,
      ghAuthOk: false,
      probeOk: true,
      hostReachable: true,
    });
    assert.equal(r.mode, MODES.SSH_OK);
    assert.equal(r.pointer, false);
  });

  test("(e) SSH + probe fails + reachable -> broken + pointer", () => {
    const r = classifyPushMode({
      url: "git@github.com:acme/widget.git",
      helper: null,
      ghAuthOk: false,
      probeOk: false,
      hostReachable: true,
    });
    assert.equal(r.mode, MODES.BROKEN);
    assert.equal(r.pointer, true);
  });

  test("(f) SSH + probe fails + not reachable -> unknown/offline, NO pointer", () => {
    const r = classifyPushMode({
      url: "git@github.com:acme/widget.git",
      helper: null,
      ghAuthOk: false,
      probeOk: false,
      hostReachable: false,
    });
    assert.equal(r.mode, MODES.UNKNOWN_OFFLINE);
    assert.equal(r.pointer, false, "offline must NOT emit a mutation pointer");
  });

  test("(g) no origin -> no-origin", () => {
    const r = classifyPushMode({
      url: null, helper: null, ghAuthOk: false, probeOk: false, hostReachable: false,
    });
    assert.equal(r.mode, MODES.NO_ORIGIN);
    assert.equal(r.pointer, false);
  });

  test("non-github origin -> non-github, no pointer", () => {
    const r = classifyPushMode({
      url: "git@gitlab.example.com:acme/widget.git",
      helper: null, ghAuthOk: false, probeOk: false, hostReachable: false,
    });
    assert.equal(r.mode, MODES.NON_GITHUB);
    assert.equal(r.pointer, false);
  });
});

describe("session-start-git-push-preflight: integration (spawned hook)", () => {
  test("(i) HTTPS + helper + auth ok -> https-gh on stdout, no pointer", () => {
    const work = makeWorkRepo({ sshRemote: false });
    const gh = makeFakeGhDir({ authStatus: 0 });
    try {
      // Pre-set a local helper so the hook's helper read returns it.
      spawnSync(
        "git",
        ["config", "--local", "credential.https://github.com.helper", "!gh auth git-credential"],
        { encoding: "utf8", cwd: work, env: cleanGitEnv() },
      );
      const proc = runHook({
        cwd: work,
        env: { ...process.env, PATH: `${gh.binDir}:${process.env.PATH || ""}` },
        // SessionStart payload (unused by the hook; the protocol-adapter
        // parseInput consumes stdin so the next reader doesn't block).
        input: "{}",
      });
      assert.equal(proc.status, 0, `hook must exit 0 (fail-open), got ${proc.status}\nstderr: ${proc.stderr}`);
      assert.match(proc.stdout, /git-push preflight: https-gh/, "stdout must label https-gh");
      assert.doesNotMatch(proc.stdout, /setup-git-push/, "https-gh must not include the pointer");
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(gh.dir, { recursive: true, force: true });
    }
  });

  test("(ii) HTTPS + helper + auth fails -> https-unverified + pointer", () => {
    const work = makeWorkRepo({ sshRemote: false });
    const gh = makeFakeGhDir({ authStatus: 1 });
    try {
      spawnSync(
        "git",
        ["config", "--local", "credential.https://github.com.helper", "!gh auth git-credential"],
        { encoding: "utf8", cwd: work, env: cleanGitEnv() },
      );
      const proc = runHook({
        cwd: work,
        env: { ...process.env, PATH: `${gh.binDir}:${process.env.PATH || ""}` },
      });
      assert.equal(proc.status, 0);
      assert.match(proc.stdout, /git-push preflight: https-unverified/);
      assert.match(proc.stdout, /setup-git-push\.sh/, "https-unverified must include the pointer");
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(gh.dir, { recursive: true, force: true });
    }
  });

  test("(iii) HTTPS, no helper -> https-anon + pointer", () => {
    const work = makeWorkRepo({ sshRemote: false });
    const gh = makeFakeGhDir({ authStatus: 1 });
    try {
      const proc = runHook({
        cwd: work,
        env: { ...process.env, PATH: `${gh.binDir}:${process.env.PATH || ""}` },
      });
      assert.equal(proc.status, 0);
      assert.match(proc.stdout, /git-push preflight: https-anon/);
      assert.match(proc.stdout, /setup-git-push\.sh/);
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(gh.dir, { recursive: true, force: true });
    }
  });

  test("(iv) SSH + reachable + probe ok -> ssh-ok", () => {
    const origin = makeBareRepo();
    const work = makeWorkRepo({ sshRemote: true });
    const sshWrap = makeSshWrapper(origin);
    const gh = makeFakeGhDir();
    try {
      const proc = runHook({
        cwd: work,
        env: {
          ...process.env,
          PATH: `${sshWrap.dir}:${gh.binDir}:${process.env.PATH || ""}`,
          GIT_SSH_COMMAND: sshWrap.wrapper,
          SETUP_GIT_PUSH_SSH_BARE_PATH: origin,
        },
      });
      assert.equal(proc.status, 0, `hook must exit 0, got ${proc.status}\nstderr: ${proc.stderr}`);
      assert.match(proc.stdout, /git-push preflight: ssh-ok/);
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(origin, { recursive: true, force: true });
      rmSync(sshWrap.dir, { recursive: true, force: true });
      rmSync(gh.dir, { recursive: true, force: true });
    }
  });

  test("(v) SSH + probe fails + reachable -> broken + pointer", () => {
    const work = makeWorkRepo({ sshRemote: true });
    const gh = makeFakeGhDir({ api: 0 }); // reachable (gh api /  exits 0)
    try {
      const proc = runHook({
        cwd: work,
        env: {
          ...process.env,
          PATH: `${gh.binDir}:${process.env.PATH || ""}`,
          GIT_SSH_COMMAND: "/bin/false", // probe always fails
        },
      });
      assert.equal(proc.status, 0);
      assert.match(proc.stdout, /git-push preflight: broken/);
      assert.match(proc.stdout, /setup-git-push\.sh/);
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(gh.dir, { recursive: true, force: true });
    }
  });

  test("(vi) SSH + probe fails + not reachable -> unknown/offline, NO pointer", () => {
    const work = makeWorkRepo({ sshRemote: true });
    // exit 1 mirrors real-world `gh api` network-error (DNS/connect fail
    // exits 1 fast, not 124): the hook must count any non-zero exit as
    // unreachable, or an offline machine gets prescribed a mutating script.
    const gh = makeFakeGhDir({ api: 1 });
    try {
      const proc = runHook({
        cwd: work,
        env: {
          ...process.env,
          PATH: `${gh.binDir}:${process.env.PATH || ""}`,
          GIT_SSH_COMMAND: "/bin/false",
        },
      });
      assert.equal(proc.status, 0);
      assert.match(proc.stdout, /git-push preflight: unknown\/offline/);
      assert.doesNotMatch(proc.stdout, /setup-git-push/, "offline must NOT emit the pointer");
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(gh.dir, { recursive: true, force: true });
    }
  });

  test("(vii) no origin -> warning line, exit 0 (fail-open)", () => {
    const work = mkdtempSync(join(tmpdir(), "preflight-no-origin-"));
    spawnSync("git", ["init", "--initial-branch=main"], {
      encoding: "utf8", cwd: work, env: cleanGitEnv(),
    });
    try {
      const proc = runHook({ cwd: work, env: process.env });
      assert.equal(proc.status, 0, "no-origin must be fail-open (exit 0)");
      assert.match(proc.stdout, /git-push preflight: no-origin/);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  test("(viii) output is one line, no token/password substrings", () => {
    const work = makeWorkRepo({ sshRemote: false });
    const gh = makeFakeGhDir({ authStatus: 0 });
    try {
      spawnSync(
        "git",
        ["config", "--local", "credential.https://github.com.helper", "!gh auth git-credential"],
        { encoding: "utf8", cwd: work, env: cleanGitEnv() },
      );
      const proc = runHook({
        cwd: work,
        env: { ...process.env, PATH: `${gh.binDir}:${process.env.PATH || ""}` },
      });
      const lines = proc.stdout.split("\n").filter((l) => l.length > 0);
      assert.equal(lines.length, 1, `output must be exactly one line, got: ${proc.stdout}`);
      assert.doesNotMatch(proc.stdout, /token/i);
      assert.doesNotMatch(proc.stdout, /password/i);
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(gh.dir, { recursive: true, force: true });
    }
  });
});
