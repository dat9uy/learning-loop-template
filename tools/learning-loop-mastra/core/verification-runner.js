import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import patterns from "./patterns.json" with { type: "json" };
import { resolveSafePath } from "./path-containment.js";

const VERIFY_ALLOWLIST = new Set(patterns["meta-state-verify-cmd-allowlist"] || []);

/**
 * Run a single verification step and return { status, signal }.
 *
 * Step shape (loose / object-form inner / cmd allowlist):
 *   { cmd: string, args?: string[], cwd?: string, timeout_ms?: number, expect?: { stdout_includes?, exit_code? } }
 *
 * Returns:
 *   { status: "passed" | "failed" | "error", signal: string }
 *     - "passed": exit_code matches expect.exit_code (or 0 if expect absent)
 *     - "failed": exit_code mismatches expect (or non-zero if expect absent)
 *     - "error": cmd not in allowlist, file not found, or spawn error
 *
 * Defense in depth (per locked design decision):
 *   1. cmd must be in VERIFY_ALLOWLIST
 *   2. spawnSync with shell: false
 *   3. timeout: step.timeout_ms ?? 10_000
 */
// fallow-ignore-next-line complexity
export function runVerification(root, step) {
  if (!step || typeof step.cmd !== "string") {
    return { status: "error", signal: "invalid_step" };
  }
  if (!VERIFY_ALLOWLIST.has(step.cmd)) {
    return { status: "failed", signal: "cmd_not_allowlisted" };
  }
  // LIM-4: realpath containment for user-supplied step.cwd. Out-of-tree cwd
  // throws PathContainmentError (escape); step.cwd must resolve inside root.
  // See core/path-containment.js. Invoked at moment of use per NF3.
  const cwd = step.cwd ? resolveSafePath(root, step.cwd) : root;
  const timeout = step.timeout_ms ?? 10_000;
  try {
    const result = spawnSync(step.cmd, step.args ?? [], {
      cwd,
      timeout,
      shell: false,
      encoding: "utf8",
    });
    if (result.error) {
      return { status: "error", signal: result.error.code || "spawn_error" };
    }
    const expectedExit = step.expect?.exit_code ?? 0;
    if (result.status === expectedExit) {
      // Optional stdout check
      if (step.expect?.stdout_includes) {
        const stdout = result.stdout || "";
        if (!stdout.includes(step.expect.stdout_includes)) {
          return { status: "failed", signal: "stdout_mismatch" };
        }
      }
      return { status: "passed", signal: String(result.status) };
    }
    return { status: "failed", signal: `exit_${result.status}` };
  } catch (err) {
    return { status: "error", signal: err.code || "spawn_exception" };
  }
}
