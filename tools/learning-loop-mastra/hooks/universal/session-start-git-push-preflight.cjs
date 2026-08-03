#!/usr/bin/env node
/**
 * SessionStart hook: report the clone's git-push mode before friction
 * surfaces mid-workflow.
 *
 * Read-only — never mutates the clone. Fail-open — any internal error emits
 * a single warning line and exits 0 (the session must not be blocked by a
 * preflight check). Common case (HTTPS + helper or warm SSH) returns in
 * well under a second; the worst case (SSH probe + reachability check) is
 * capped at ~5s.
 *
 * Mode classification is scheme-first, then health:
 *   - https-gh         HTTPS + helper configured + `gh auth status` ok.
 *                      The only mode that is fully write-assured.
 *   - https-unverified HTTPS + helper configured but `gh auth status` fails
 *                      or gh is missing. Pointer to setup-git-push.sh.
 *   - https-anon       HTTPS without helper (public repos read OK
 *                      anonymously; push 403s). Pointer.
 *   - ssh-ok           SSH remote + probe succeeds.
 *   - broken           SSH remote + probe fails AND the host is reachable
 *                      (so the failure is auth, not offline). Pointer.
 *   - unknown/offline  Probe fails AND reachability is ambiguous. NO
 *                      pointer — never prescribe a mutating script on an
 *                      ambiguous signal.
 *   - non-github       Non-GitHub origin: no pointer (out of scope).
 *   - no-origin        No remote configured: no pointer.
 *
 * The honest labeling matters: a config-only "looks like HTTPS" is never
 * reported as a verified push path. The verify-capability check is the
 * `gh auth status` exit code for the HTTPS path; the SSH path uses
 * `git ls-remote` capped at 3s, which proves read access (on a public
 * repo this can be anonymous) and is reported as `ssh-ok` — never as
 * "push-verified". Operators who need a stronger SSH guarantee can run
 * setup-git-push.sh explicitly to convert to the write-verified HTTPS+gh
 * path.
 *
 * Testability: classifyPushMode is a pure function over its inputs (no
 * I/O, no `Date`, no signals), so the test suite can exercise the branchy
 * logic in-process — the spawn-based integration test cannot attribute
 * coverage into a child process.
 */
"use strict";

const { spawnSync } = require("node:child_process");
const { execFileSync } = require("node:child_process");

const PROBE_TIMEOUT_MS = 3000;
const REACHABILITY_TIMEOUT_MS = 2000;
const AUTH_STATUS_TIMEOUT_MS = 2000;

const SCRIPT_POINTER = "run tools/scripts/setup-git-push.sh";

// protocol-adapter is an ESM module; load it via dynamic import so this
// CJS hook can still consume stdin through the canonical adapter (the
// runtime-agnostic-audit requires new features to route I/O through it).
let _protocolAdapter = null;
async function loadProtocolAdapter() {
  if (_protocolAdapter) return _protocolAdapter;
  _protocolAdapter = await import("./lib/protocol-adapter.js");
  return _protocolAdapter;
}

const MODES = Object.freeze({
  HTTPS_GH: "https-gh",
  HTTPS_UNVERIFIED: "https-unverified",
  HTTPS_ANON: "https-anon",
  SSH_OK: "ssh-ok",
  BROKEN: "broken",
  UNKNOWN_OFFLINE: "unknown/offline",
  NON_GITHUB: "non-github",
  NO_ORIGIN: "no-origin",
});

function isSshRemote(url) {
  return typeof url === "string" && /^git@github\.com:/.test(url);
}

function isHttpsRemote(url) {
  return typeof url === "string" && /^https:\/\/github\.com\//.test(url);
}

// Per-scheme sub-classifiers. Each returns a {mode, pointer} pair. Split
// out of classifyPushMode so the per-scheme branch counts stay low
// (cyclomatic 3 each), keeping the gate's CRAP threshold comfortable.
function classifyHttps({ helper, ghAuthOk }) {
  if (!helper) return { mode: MODES.HTTPS_ANON, pointer: true };
  if (ghAuthOk) return { mode: MODES.HTTPS_GH, pointer: false };
  return { mode: MODES.HTTPS_UNVERIFIED, pointer: true };
}

function classifySsh({ probeOk, hostReachable }) {
  if (probeOk) return { mode: MODES.SSH_OK, pointer: false };
  if (hostReachable) return { mode: MODES.BROKEN, pointer: true };
  return { mode: MODES.UNKNOWN_OFFLINE, pointer: false };
}

/**
 * Pure function: classify the clone's push mode.
 *
 * @param {object} inputs
 * @param {string|null} inputs.url                 remote.origin.url (or null if absent)
 * @param {string|null} inputs.helper              local credential.https://github.com.helper value (or null if absent)
 * @param {boolean}      inputs.ghAuthOk           `gh auth status -h github.com` exit 0
 * @param {boolean}      inputs.probeOk            `git ls-remote <url> HEAD` exit 0 (READ probe)
 * @param {boolean}      inputs.hostReachable      gh api `/` answered (any non-timeout)
 *
 * @returns {{mode: string, pointer: boolean}} pointer=true means the line should emit a setup-script pointer
 */
function classifyPushMode({ url, helper, ghAuthOk, probeOk, hostReachable }) {
  if (!url) return { mode: MODES.NO_ORIGIN, pointer: false };
  if (isHttpsRemote(url)) return classifyHttps({ helper, ghAuthOk });
  if (isSshRemote(url)) return classifySsh({ probeOk, hostReachable });
  return { mode: MODES.NON_GITHUB, pointer: false };
}

// Read the origin URL. Returns null when absent or unreadable.
function readOriginUrl() {
  try {
    return execFileSync("git", ["config", "--local", "--get", "remote.origin.url"], {
      encoding: "utf8",
      timeout: 1000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

// Read the local credential helper for github.com. Returns null when
// absent/unreadable.
function readHelper() {
  try {
    return execFileSync(
      "git",
      ["config", "--local", "--get-all", "credential.https://github.com.helper"],
      { encoding: "utf8", timeout: 1000, stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    return null;
  }
}

// `git ls-remote <url> HEAD` capped at PROBE_TIMEOUT_MS. Returns true iff
// the probe succeeded (READ access). On a public repo this can succeed
// anonymously; we never treat a read-probe-ok as proof of push capability.
function probeRemoteRead(url) {
  const res = spawnSync("git", ["ls-remote", url, "HEAD"], {
    encoding: "utf8",
    timeout: PROBE_TIMEOUT_MS,
    stdio: ["ignore", "ignore", "ignore"],
  });
  return res.status === 0;
}

// Reachability check: `gh api /` against the real host. Returns true iff
// the API responded (any non-signal, non-timeout exit). Used to disambiguate
// "auth broken" from "machine offline". Capped at REACHABILITY_TIMEOUT_MS.
function hostReachable() {
  const r = spawnSync("gh", ["api", "/"], {
    encoding: "utf8",
    timeout: REACHABILITY_TIMEOUT_MS,
    stdio: ["ignore", "ignore", "ignore"],
  });
  return r.status !== null && r.status !== 124;
}

// `gh auth status -h github.com` exit code. The body is unused; the
// authoritative signal is the exit code.
function ghAuthOk() {
  const r = spawnSync("gh", ["auth", "status", "-h", "github.com"], {
    encoding: "utf8",
    timeout: AUTH_STATUS_TIMEOUT_MS,
    stdio: ["ignore", "ignore", "ignore"],
  });
  return r.status === 0;
}

function emitLine(mode, pointer) {
  const line = pointer
    ? `git-push preflight: ${mode} — ${SCRIPT_POINTER}`
    : `git-push preflight: ${mode}`;
  console.log(line);
  process.exit(0);
}

function warnAndExit(msg) {
  console.error(`[session-start-git-push-preflight] ${msg}`);
  process.exit(0);
}

function gatherInputs(url) {
  // Probe SSH and HTTPS targets conditionally so the HTTPS fast path
  // skips the network entirely and the SSH path is bounded to ≤3s + ≤2s.
  const helper = readHelper();
  if (isSshRemote(url)) {
    return {
      url, helper,
      probeOk: probeRemoteRead(url),
      hostReachable: hostReachable(),
      ghAuthOk: false,
    };
  }
  if (isHttpsRemote(url)) {
    return {
      url, helper,
      probeOk: false,
      hostReachable: false,
      ghAuthOk: ghAuthOk(),
    };
  }
  return { url, helper, probeOk: false, hostReachable: false, ghAuthOk: false };
}

function main() {
  const url = readOriginUrl();
  if (!url) {
    emitLine(MODES.NO_ORIGIN, false);
    return;
  }
  const { mode, pointer } = classifyPushMode(gatherInputs(url));
  emitLine(mode, pointer);
}

async function mainWithAdapter() {
  // Consume stdin via the canonical protocol-adapter so the hook speaks
  // the same I/O dialect as the PreToolUse gates. The payload is unused
  // (SessionStart surface metadata), but routing it through parseInput
  // satisfies the runtime-agnostic-audit and prevents a stuck-stdin
  // child process.
  const adapter = await loadProtocolAdapter();
  adapter.parseInput(process.stdin.read() ?? "");
  main();
}

module.exports = { classifyPushMode, MODES, SCRIPT_POINTER };

if (require.main === module) {
  // Async main is required to load the ESM protocol-adapter. Catch any
  // top-level error and fail-open (warn + exit 0).
  mainWithAdapter().catch((err) => {
    warnAndExit(`internal error: ${err.message}`);
  });
}
