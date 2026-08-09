#!/usr/bin/env node
/**
 * SessionStart hook: report the clone's union-merge-driver state.
 *
 * Complements session-start-git-push-preflight.cjs. The two together are the
 * "did this clean clone run both per-clone git setups?" banner — each emits
 * one line. This hook closes the merge-driver's SILENT-failure mode: without
 * `merge.union.driver` configured, `merge=union` is a silent no-op and
 * parallel change-log PRs conflict; with the wrong arg order it silently
 * drops one side (the data-loss bug). A missing/wrong driver is otherwise
 * invisible until a merge goes wrong mid-PR.
 *
 * Read-only — never mutates the clone. Fail-open — any internal error emits a
 * single warning line and exits 0 (the session must not be blocked by a
 * preflight check). Common case is one `git config --get` (well under 1s,
 * no network).
 *
 * Mode classification:
 *   - canonical       merge.union.driver == 'git merge-file --union %A %O %B'
 *                     (the only fully-correct mode). No pointer.
 *   - unset           no driver configured (merge=union is a silent no-op).
 *                     Pointer to setup-git.sh.
 *   - wrong-order     value contains '%O %A %B' (the data-loss order).
 *                     Pointer.
 *   - non-canonical   some other value. Pointer.
 *
 * The pointer targets the orchestrator (setup-git.sh), which runs BOTH
 * per-clone git setups — so any red line resolves to one command.
 *
 * Testability: classifyMergeDriverMode is a pure function over its input
 * (no I/O, no `Date`, no signals), so the test suite can exercise the
 * branchy logic in-process.
 */
"use strict";

const { execFileSync } = require("node:child_process");

// Must match setup-git-merge-drivers.sh CANONICAL_DRIVER exactly.
const CANONICAL_DRIVER = "git merge-file --union %A %O %B";
// The WRONG order documented elsewhere — detected so the line can name the
// data-loss risk specifically instead of a generic "non-canonical".
const WRONG_ORDER_PATTERN = "%O %A %B";

const SCRIPT_POINTER = "run tools/scripts/setup-git.sh";

const MODES = Object.freeze({
  CANONICAL: "canonical",
  UNSET: "unset",
  WRONG_ORDER: "wrong-order",
  NON_CANONICAL: "non-canonical",
});

/**
 * Pure function: classify the clone's merge.union.driver state.
 *
 * @param {object}      inputs
 * @param {string|null} inputs.driverValue  `git config --get merge.union.driver`
 *                                          (trimmed) or null when unset/unreadable
 * @returns {{mode: string, pointer: boolean}} pointer=true means the line
 *          should emit a setup-script pointer
 */
function classifyMergeDriverMode({ driverValue }) {
  if (!driverValue) return { mode: MODES.UNSET, pointer: true };
  if (driverValue === CANONICAL_DRIVER) return { mode: MODES.CANONICAL, pointer: false };
  if (driverValue.includes(WRONG_ORDER_PATTERN)) {
    return { mode: MODES.WRONG_ORDER, pointer: true };
  }
  return { mode: MODES.NON_CANONICAL, pointer: true };
}

// Read merge.union.driver from the merged config (any scope). git reads the
// merged config at merge time, so this is the right read for "will the
// driver fire on this clone". Returns null when absent/unreadable.
function readDriver() {
  try {
    const out = execFileSync("git", ["config", "--get", "merge.union.driver"], {
      encoding: "utf8",
      timeout: 1000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const trimmed = out.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    // `git config --get` exits 1 when the key is unset; treat that as unset.
    return null;
  }
}

function emitLine(mode, pointer) {
  const line = pointer
    ? `git-merge-driver preflight: ${mode} — ${SCRIPT_POINTER}`
    : `git-merge-driver preflight: ${mode}`;
  console.log(line);
  process.exit(0);
}

function warnAndExit(msg) {
  console.error(`[session-start-git-merge-driver-preflight] ${msg}`);
  process.exit(0);
}

function main() {
  const { mode, pointer } = classifyMergeDriverMode({ driverValue: readDriver() });
  emitLine(mode, pointer);
}

// protocol-adapter is an ESM module; load it via dynamic import so this CJS
// hook can still consume stdin through the canonical adapter (the
// runtime-agnostic-audit requires new features to route I/O through it).
let _protocolAdapter = null;
async function loadProtocolAdapter() {
  if (_protocolAdapter) return _protocolAdapter;
  _protocolAdapter = await import("./lib/protocol-adapter.js");
  return _protocolAdapter;
}

async function mainWithAdapter() {
  // Consume stdin via the canonical protocol-adapter so the hook speaks the
  // same I/O dialect as the other SessionStart hooks. The payload is unused
  // (SessionStart surface metadata), but routing it through parseInput
  // satisfies the runtime-agnostic-audit and prevents a stuck-stdin child.
  const adapter = await loadProtocolAdapter();
  adapter.parseInput(process.stdin.read() ?? "");
  main();
}

module.exports = { classifyMergeDriverMode, MODES, CANONICAL_DRIVER, SCRIPT_POINTER };

if (require.main === module) {
  // Async main is required to load the ESM protocol-adapter. Catch any
  // top-level error and fail-open (warn + exit 0).
  mainWithAdapter().catch((err) => {
    warnAndExit(`internal error: ${err.message}`);
  });
}