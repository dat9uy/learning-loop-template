// Unit tests for tools/scripts/setup-git-push.sh.
//
// Locks the deterministic-git-push contract:
//   (a) probe-ok SSH path is a no-op (working SSH never rewritten)
//   (b) broken SSH + gh session (auth status 0, permissions.push=true)
//       converts the remote to HTTPS with an absolute-path gh helper
//   (c) broken + no gh session -> exit 1, hint on stderr, NO mutation
//   (d) non-GitHub remote broken -> exit 1, unchanged, even with --force
//   (e) idempotency: run twice after (b) -> second run no-op exit 0
//   (f) --force on already-working HTTPS config -> exit 0, still working
//   (g) unknown arg -> exit 2
//   (h) rollback: fake gh whose `api` emits push:false -> exit 1, prior
//       remote URL and prior helper value both restored
//   (i) HTTPS + no helper + gh session -> helper configured, URL untouched
//   (j) helper write failure mid-region -> rollback restores URL + helper
//   (k) rollback restores a multi-valued prior helper chain
//   (l) missing flock -> exit 1 + hint, NO mutation (fail-closed)
//
// Network discipline: tests use a local bare repo as `origin` and a second
// local bare repo as the post-swap HTTPS target. The post-swap write
// verification (`gh api repos/<owner>/<repo>`) is faked by a per-test
// `bin/gh` shim; the script never reaches the real network.
//
// Env-discipline (mirror of setup-git-merge-drivers.test.js): strip
// inherited GIT_* vars so a pre-commit/pre-push hook context cannot
// redirect temp git commands at the project's own .git. One caveat:
// `GIT_SSH_COMMAND` is ALLOWLISTED because the SSH-probe offline path
// depends on it being set; scrubbing it would invert the test.
//
// `--force` semantics: per the merge-drivers contract, --force is for
// overwriting wrong/non-canonical values, not for "touch a non-GitHub
// remote" — case (d) asserts that boundary.

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
  readFileSync,
  chmodSync,
  readdirSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "../setup-git-push.sh");

// Strip inherited GIT_* env vars (GIT_DIR, GIT_INDEX_FILE, GIT_WORK_TREE,
// GIT_OBJECT_DIRECTORY, GIT_QUARANTINE_PATH, …) so the temp repo's git uses
// its own .git. Allowlist GIT_SSH_COMMAND: the SSH probe (BatchMode + a
// command that resolves offline) depends on it. Without the allowlist, the
// probe-ok SSH test would pass for the wrong reason (the env scrub strips
// the very variable that forces offline behavior in the per-test scenario).
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

// Create a temp repo with an `origin` pointing at `originPath` (a local
// bare repo). Returns the work-tree path.
function makeTempRepo({ originPath, owner = "acme", repo = "widget", sshRemote = false } = {}) {
  const work = mkdtempSync(join(tmpdir(), "setup-git-push-work-"));
  const init = runGit(["init", "--initial-branch=main"], work);
  assert.equal(init.status, 0, `git init failed: ${init.stderr}`);
  runGit(["config", "user.email", "test@example.com"], work);
  runGit(["config", "user.name", "Test User"], work);
  runGit(["config", "commit.gpgsign", "false"], work);

  const remoteUrl = sshRemote
    ? `git@github.com:${owner}/${repo}.git`
    : `https://github.com/${owner}/${repo}.git`;
  const remote = runGit(["remote", "add", "origin", remoteUrl], work);
  assert.equal(remote.status, 0, `git remote add failed: ${remote.stderr}`);

  // For the work repo, set a placeholder file so the first commit is real
  // (some `git remote set-url` flows in git < 2.32 complain about an empty repo
  // — a benign warning, not a test signal).
  writeFileSync(join(work, "README.md"), "test\n");
  runGit(["add", "README.md"], work);
  runGit(["commit", "-m", "init"], work);
  return work;
}

function makeBareRepo() {
  const dir = mkdtempSync(join(tmpdir(), "setup-git-push-bare-"));
  const init = runGit(["init", "--bare", "--initial-branch=main"], dir);
  assert.equal(init.status, 0, `git init --bare failed: ${init.stderr}`);
  return dir;
}

// Build a per-test `bin/gh` shim directory. `behaviors` is an object whose
// keys are the subcommand (the FIRST positional arg passed to `gh`) and
// values are the body the shim emits on stdout before exiting 0. The
// script under test only inspects the exit code + the body, so a flat
// match on $1 is sufficient: `auth status` becomes the subcommand "auth"
// (with "status" as $2 ignored by the shim), `api` is the subcommand
// "api" (with the rest of the args ignored — the script greps the body
// directly, not via --jq).
function makeGhShim(behaviors = {}) {
  const dir = mkdtempSync(join(tmpdir(), "setup-git-push-gh-"));
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

// Prepend a directory to PATH and bake the change into the env passed to
// the script. Returns a fresh env object — does not mutate process.env.
// Always seeds the new PATH with the parent's system PATH so the spawned
// bash can still find `git`, `cat`, `sed`, and the standard coreutils;
// the test only wants the shim dir to take precedence for `gh` (and any
// other name it declares).
function withPath(env, dir) {
  const basePath = env.PATH || process.env.PATH || "";
  return { ...env, PATH: `${dir}:${basePath}` };
}

function readRemote(cwd) {
  const r = runGit(["config", "--local", "--get", "remote.origin.url"], cwd);
  return r.stdout.trim();
}

function readHelper(cwd) {
  // --local: only the local repo config. The operator's global gitconfig
  // may carry a helper value that would otherwise leak into the assertion
  // (e.g. on a workstation where the helper is configured globally for
  // every clone). The script's contract is on the local repo's config.
  const r = runGit(["config", "--local", "--get", "credential.https://github.com.helper"], cwd);
  return r.stdout.trim();
}

describe("setup-git-push.sh: contract", () => {
  test("script is executable and exists", () => {
    assert.ok(existsSync(SCRIPT), `script missing at ${SCRIPT}`);
  });

  test("(a) probe-ok SSH path is a no-op (working SSH never rewritten)", () => {
    const originPath = makeBareRepo();
    const work = makeTempRepo({ originPath, sshRemote: true });
    // Build a small ssh wrapper that ignores the host arg and runs
    // `git upload-pack` on the local bare. This is the operator-side
    // equivalent of a working ssh-agent: the SSH transport resolves to a
    // local backend, so `git ls-remote` succeeds without the network.
    const wrapperDir = mkdtempSync(join(tmpdir(), "setup-git-push-ssh-"));
    const wrapperPath = join(wrapperDir, "fake-ssh");
    writeFileSync(
      wrapperPath,
      "#!/bin/bash\nexec git upload-pack \"$SETUP_GIT_PUSH_SSH_BARE_PATH\"\n",
      "utf8",
    );
    chmodSync(wrapperPath, 0o755);
    try {
      const envWithSshCmd = {
        ...process.env,
        PATH: `${wrapperDir}:${process.env.PATH || ""}`,
        GIT_SSH_COMMAND: wrapperPath,
        SETUP_GIT_PUSH_SSH_BARE_PATH: originPath,
      };

      const proc = runScript([], { cwd: work, env: envWithSshCmd });
      assert.equal(proc.status, 0, `probe-ok SSH must exit 0, got ${proc.status}\nstderr: ${proc.stderr}`);
      // Remote must still be the SSH URL (script must NEVER rewrite a
      // working SSH config — the plan's red-team finding F7).
      assert.equal(readRemote(work), `git@github.com:acme/widget.git`);
      // No local helper should have been added.
      const helper = runGit(["config", "--local", "--get", "credential.https://github.com.helper"], work);
      assert.notEqual(helper.status, 0, `no local helper must be configured for probe-ok SSH (got: ${helper.stdout})`);
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(originPath, { recursive: true, force: true });
      rmSync(wrapperDir, { recursive: true, force: true });
    }
  });

  test("(b) broken SSH + gh session: HTTPS + absolute helper + write-verified", () => {
    const originPath = makeBareRepo();
    const work = makeTempRepo({ originPath, sshRemote: true, owner: "acme", repo: "widget" });
    const ghShim = makeGhShim({
      auth: "Logged in to github.com as test (oauth_token)",
      api: JSON.stringify({ permissions: { push: true } }),
    });
    try {
      // Force the SSH probe to fail (BatchMode to a non-existent socket).
      const envBrokenSsh = {
        ...withPath({}, ghShim.path),
        GIT_SSH_COMMAND: "/bin/false",
      };

      const proc = runScript([], { cwd: work, env: envBrokenSsh });
      assert.equal(proc.status, 0, `convert must exit 0, got ${proc.status}\nstderr: ${proc.stderr}`);

      // Remote was rewritten to HTTPS.
      assert.equal(readRemote(work), `https://github.com/acme/widget.git`);
      // Helper is configured to an ABSOLUTE gh path (relative `gh` would
      // be missing on the autonomous shell's PATH).
      const helper = readHelper(work);
      assert.ok(
        helper.startsWith("!"),
        `helper must use the '!' prefix (credential helper cmd form), got: ${helper}`,
      );
      assert.ok(
        helper.includes(ghShim.shimPath),
        `helper must reference the absolute gh shim path (got: ${helper})`,
      );
      // The bare relative form `!gh auth git-credential` is forbidden.
      assert.notEqual(
        helper,
        "!gh auth git-credential",
        `helper must NOT be the bare PATH-relative form (got: ${helper})`,
      );
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(originPath, { recursive: true, force: true });
      rmSync(ghShim.dir, { recursive: true, force: true });
    }
  });

  test("(c) broken SSH + no gh session: exit 1 + hint, NO mutation", () => {
    const originPath = makeBareRepo();
    const work = makeTempRepo({ originPath, sshRemote: true });
    try {
      const envBroken = {
        PATH: "/usr/bin:/bin",  // no gh on PATH
        GIT_SSH_COMMAND: "/bin/false",
      };

      const proc = runScript([], { cwd: work, env: envBroken });
      assert.equal(proc.status, 1, `no-gh-session must exit 1, got ${proc.status}\nstderr: ${proc.stderr}`);
      assert.match(proc.stderr, /gh auth login|gh auth/i, `stderr must hint at gh auth, got: ${proc.stderr}`);

      // Both URL and helper are unchanged.
      assert.equal(readRemote(work), `git@github.com:acme/widget.git`);
      const helper = runGit(["config", "--local", "--get", "credential.https://github.com.helper"], work);
      assert.notEqual(helper.status, 0, `no local helper must be configured on no-gh-session path`);
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(originPath, { recursive: true, force: true });
    }
  });

  test("(d) non-GitHub remote broken: exit 1, unchanged, even with --force", () => {
    const originPath = makeBareRepo();
    const work = mkdtempSync(join(tmpdir(), "setup-git-push-non-gh-"));
    runGit(["init", "--initial-branch=main"], work);
    runGit(["config", "user.email", "test@example.com"], work);
    runGit(["config", "user.name", "Test User"], work);
    runGit(["config", "commit.gpgsign", "false"], work);
    writeFileSync(join(work, "README.md"), "test\n");
    runGit(["add", "README.md"], work);
    runGit(["commit", "-m", "init"], work);
    runGit(["remote", "add", "origin", "git@gitlab.example.com:acme/widget.git"], work);
    // ghShim is created even on the non-GitHub path so the script's
    // resolve_gh_bin has a candidate to lift; the script must still
    // exit 1 because the URL is not github.com.
    const ghShim = makeGhShim({ auth: "logged in" });
    try {
      const env = {
        ...withPath({}, ghShim.path),
        GIT_SSH_COMMAND: "/bin/false",
      };
      const proc = runScript(["--force"], { cwd: work, env });
      assert.equal(proc.status, 1, `non-GitHub must fail closed even with --force, got ${proc.status}`);
      assert.equal(readRemote(work), "git@gitlab.example.com:acme/widget.git");
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(originPath, { recursive: true, force: true });
      rmSync(ghShim.dir, { recursive: true, force: true });
    }
  });

  test("(e) idempotency: run twice after (b) -> second run no-op exit 0", () => {
    const originPath = makeBareRepo();
    const work = makeTempRepo({ originPath, sshRemote: true });
    const ghShim = makeGhShim({
      auth: "logged in",
      api: JSON.stringify({ permissions: { push: true } }),
    });
    try {
      const env = {
        ...withPath({}, ghShim.path),
        GIT_SSH_COMMAND: "/bin/false",
      };
      const proc1 = runScript([], { cwd: work, env });
      assert.equal(proc1.status, 0);
      const urlAfter1 = readRemote(work);
      const helperAfter1 = readHelper(work);

      // Second run: no-op exit 0, no further mutation.
      const proc2 = runScript([], { cwd: work, env });
      assert.equal(proc2.status, 0, `second run must exit 0 (idempotent), got ${proc2.status}\nstderr: ${proc2.stderr}`);
      assert.match(proc2.stdout, /already|ok|no-op|idempotent/i, `second run must report idempotency, got: ${proc2.stdout}`);
      assert.equal(readRemote(work), urlAfter1);
      assert.equal(readHelper(work), helperAfter1);
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(originPath, { recursive: true, force: true });
      rmSync(ghShim.dir, { recursive: true, force: true });
    }
  });

  test("(f) --force on already-working HTTPS config: exit 0, still working", () => {
    const originPath = makeBareRepo();
    const work = makeTempRepo({ originPath, sshRemote: false });
    const ghShim = makeGhShim({
      auth: "logged in",
      api: JSON.stringify({ permissions: { push: true } }),
    });
    try {
      // Pre-set a working HTTPS remote + helper.
      const helperVal = `!${ghShim.shimPath} auth git-credential`;
      runGit(["config", "--local", "credential.https://github.com.helper", helperVal], work);

      const env = withPath({}, ghShim.path);
      const proc = runScript(["--force"], { cwd: work, env });
      assert.equal(proc.status, 0, `--force on working HTTPS must exit 0, got ${proc.status}\nstderr: ${proc.stderr}`);
      assert.equal(readRemote(work), `https://github.com/acme/widget.git`);
      assert.equal(readHelper(work), helperVal);
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
      assert.match(proc.stderr, /unknown argument/, `stderr must name the bad arg, got: ${proc.stderr}`);
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(originPath, { recursive: true, force: true });
    }
  });

  test("(h) rollback on write-verify fail: URL + helper both restored", () => {
    const originPath = makeBareRepo();
    const work = makeTempRepo({ originPath, sshRemote: true });
    // Pre-set a known prior helper value so we can assert the rollback
    // restored IT (not just "no helper").
    const priorHelper = "!some-other-helper auth git-credential";
    runGit(["config", "--local", "credential.https://github.com.helper", priorHelper], work);
    const priorUrl = readRemote(work);

    const ghShim = makeGhShim({
      auth: "logged in",
      // push:false fails the write verification, forcing the rollback path.
      api: JSON.stringify({ permissions: { push: false } }),
    });
    try {
      const env = {
        ...withPath({}, ghShim.path),
        GIT_SSH_COMMAND: "/bin/false",
      };
      const proc = runScript([], { cwd: work, env });
      assert.equal(proc.status, 1, `write-verify fail must exit 1, got ${proc.status}\nstderr: ${proc.stderr}`);

      // Both must be restored to the pre-run values.
      assert.equal(readRemote(work), priorUrl, `URL must be restored to ${priorUrl}`);
      assert.equal(readHelper(work), priorHelper, `helper must be restored to prior value`);
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(originPath, { recursive: true, force: true });
      rmSync(ghShim.dir, { recursive: true, force: true });
    }
  });

  test("(i) HTTPS + no helper + gh session: helper configured, URL untouched", () => {
    const originPath = makeBareRepo();
    const work = makeTempRepo({ originPath, sshRemote: false });
    // Confirm the precondition: HTTPS remote, no local helper.
    assert.equal(readRemote(work), "https://github.com/acme/widget.git");
    const preHelper = runGit(["config", "--local", "--get", "credential.https://github.com.helper"], work);
    assert.notEqual(preHelper.status, 0, `precondition: no local helper configured`);

    const ghShim = makeGhShim({ auth: "logged in" });
    try {
      const env = withPath({}, ghShim.path);
      const proc = runScript([], { cwd: work, env });
      assert.equal(proc.status, 0, `read-only-trap fix-up must exit 0, got ${proc.status}\nstderr: ${proc.stderr}`);

      // URL is unchanged.
      assert.equal(readRemote(work), "https://github.com/acme/widget.git");
      // Helper is now configured.
      const helper = readHelper(work);
      assert.ok(helper.includes(ghShim.shimPath), `helper must reference the absolute gh shim path (got: ${helper})`);
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(originPath, { recursive: true, force: true });
      rmSync(ghShim.dir, { recursive: true, force: true });
    }
  });

  test("(j) helper write failure mid-region: rollback restores URL + helper", () => {
    // The `set -e` partial-mutation window (red-team F4) lives between the
    // helper write and the URL set-url. The test forces a helper write
    // failure by pre-creating `.git/config.lock`, which `git config`
    // refuses to overwrite. Expected: rollback restores prior values.
    const originPath = makeBareRepo();
    const work = makeTempRepo({ originPath, sshRemote: true });
    const priorHelper = "!prior-helper auth git-credential";
    runGit(["config", "--local", "credential.https://github.com.helper", priorHelper], work);
    const priorUrl = readRemote(work);

    const ghShim = makeGhShim({ auth: "logged in" });
    try {
      // Pre-create the lockfile that `git config --replace-all` will refuse
      // to overwrite. The script must catch the failure and roll back.
      writeFileSync(join(work, ".git", "config.lock"), "lock\n");
      const env = {
        ...withPath({}, ghShim.path),
        GIT_SSH_COMMAND: "/bin/false",
      };
      const proc = runScript([], { cwd: work, env });
      // The script will detect the lock; either it bails (rollback runs)
      // or the flock catches it. Either way: no partial-mutation window,
      // both prior values preserved.
      assert.equal(readRemote(work), priorUrl, `URL must be unchanged on mid-region failure`);
      assert.equal(readHelper(work), priorHelper, `helper must be unchanged on mid-region failure`);
      // The script must exit non-zero (1) on a failed mutation.
      assert.notEqual(proc.status, 0, `mid-region failure must exit non-zero, got ${proc.status}`);
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(originPath, { recursive: true, force: true });
      rmSync(ghShim.dir, { recursive: true, force: true });
    }
  });

  test("(k) rollback restores a MULTI-valued prior helper chain", () => {
    const originPath = makeBareRepo();
    const work = makeTempRepo({ originPath, sshRemote: true });
    // Two prior helper entries: rollback must restore BOTH, not collapse
    // the chain to the last value.
    const prior1 = "!helper-one auth git-credential";
    const prior2 = "cache --timeout=60";
    runGit(["config", "--local", "--add", "credential.https://github.com.helper", prior1], work);
    runGit(["config", "--local", "--add", "credential.https://github.com.helper", prior2], work);
    const priorUrl = readRemote(work);

    const ghShim = makeGhShim({
      auth: "logged in",
      api: JSON.stringify({ permissions: { push: false } }),
    });
    try {
      const env = {
        ...withPath({}, ghShim.path),
        GIT_SSH_COMMAND: "/bin/false",
      };
      const proc = runScript([], { cwd: work, env });
      assert.equal(proc.status, 1, `write-verify fail must exit 1, got ${proc.status}\nstderr: ${proc.stderr}`);
      assert.equal(readRemote(work), priorUrl, `URL must be restored`);
      const all = runGit(["config", "--local", "--get-all", "credential.https://github.com.helper"], work);
      assert.deepEqual(all.stdout.trim().split("\n"), [prior1, prior2], `full helper chain must be restored in order`);
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(originPath, { recursive: true, force: true });
      rmSync(ghShim.dir, { recursive: true, force: true });
    }
  });

  test("(l) missing flock: exit 1 + hint, NO mutation (fail-closed)", () => {
    // A minimal shell (stock macOS, slim container) has no flock. The
    // script must refuse to run unguarded rather than proceed — and must
    // never misread the missing binary as "another run in progress" (a
    // silent exit-0 no-op on a still-broken clone).
    const originPath = makeBareRepo();
    const work = makeTempRepo({ originPath, sshRemote: true });
    const priorUrl = readRemote(work);
    const ghShim = makeGhShim({
      auth: "logged in",
      api: JSON.stringify({ permissions: { push: true } }),
    });
    // Build a PATH dir with every system binary EXCEPT flock, plus the gh
    // shim, so `command -v flock` fails inside the script.
    const binDir = join(mkdtempSync(join(tmpdir(), "setup-git-push-noflock-")), "bin");
    mkdirSync(binDir, { recursive: true });
    for (const sysDir of ["/usr/bin", "/bin", "/usr/local/bin"]) {
      if (!existsSync(sysDir)) continue; // slim CI images may lack /usr/local/bin
      for (const name of readdirSync(sysDir)) {
        if (name === "flock") continue;
        const dest = join(binDir, name);
        if (!existsSync(dest)) symlinkSync(join(sysDir, name), dest);
      }
    }
    // The shim must be the only `gh` visible — a system gh may already be
    // symlinked above (CI images ship gh in /usr/bin or /usr/local/bin).
    rmSync(join(binDir, "gh"), { force: true });
    symlinkSync(ghShim.shimPath, join(binDir, "gh"));
    try {
      const env = { ...cleanGitEnv({}), PATH: binDir, GIT_SSH_COMMAND: "/bin/false" };
      const proc = runScript([], { cwd: work, env });
      assert.equal(proc.status, 1, `missing flock must exit 1, got ${proc.status}\nstderr: ${proc.stderr}`);
      assert.match(proc.stderr, /flock/, `stderr must name the missing tool`);
      assert.equal(readRemote(work), priorUrl, `URL must be untouched`);
      const helper = runGit(["config", "--local", "--get", "credential.https://github.com.helper"], work);
      assert.notEqual(helper.status, 0, `helper must not be written`);
    } finally {
      rmSync(work, { recursive: true, force: true });
      rmSync(originPath, { recursive: true, force: true });
      rmSync(ghShim.dir, { recursive: true, force: true });
      rmSync(join(binDir, ".."), { recursive: true, force: true });
    }
  });
});
