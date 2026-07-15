// Unit tests for tools/scripts/ci-registry-deltas.sh.
//
// Locks the Plan 260715-1608 Phase 1 backstop contract:
//   (a) clean PR (no orphan refs at all) -> exit 0
//   (b) clean change-log with valid `consolidates` -> exit 0 (target resolves
//       in the base union)
//   (c) change-log with unresolved `consolidates` -> exit 1, summary lists
//       the violation
//   (d) change-log with unresolved `supersedes` -> exit 1, summary lists
//       the violation
//   (e) non-change-log entry with unresolved `addresses` (advisory only) ->
//       exit 0 (cross-PR orphans self-heal on merge; informational only)
//   (f) CHANGE_LOG_REF_GATE=0 opt-out -> exit 0 even on a violating ref
//
// Uses an isolated temp dir; never touches the real working tree. Mirrors
// the `registry-table.test.js` temp-repo idiom.

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "../ci-registry-deltas.sh");

function runScript(args = [], opts = {}) {
  const env = { ...process.env, ...opts.env, GITHUB_STEP_SUMMARY: "/dev/null" };
  if (opts.env && opts.env.GITHUB_STEP_SUMMARY === undefined) {
    env.GITHUB_STEP_SUMMARY = "/dev/null";
  }
  return spawnSync("bash", [SCRIPT, ...args], { encoding: "utf8", env, cwd: opts.cwd });
}

// Synthesize a JSONL containing the entries that simulate the BASE state.
// The script consults the current CWD's meta-state.jsonl + change-log.jsonl
// to resolve `target_in_base`, so we set both files in the temp cwd (an
// absent change-log.jsonl would make the `jq ... change-log.jsonl` base
// lookup error out under `2>/dev/null || true`, masking the real path).
function writeBaseCwd(cwd, lines) {
  writeFileSync(join(cwd, "meta-state.jsonl"), lines.join("\n") + "\n", "utf8");
  writeFileSync(join(cwd, "change-log.jsonl"), "", "utf8");
}

function entry(id, fields) {
  return JSON.stringify({ id, ...fields });
}

describe("ci-registry-deltas.sh: change-log ref-resolution backstop (Phase 1)", () => {
  test("script is executable and exists", () => {
    assert.ok(existsSync(SCRIPT), `script missing at ${SCRIPT}`);
  });

  test("clean diff -> exit 0", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ci-deltas-clean-"));
    writeBaseCwd(tmp, [entry("baseline-1", { entry_kind: "finding", status: "open", created_at: "2026-07-01T00:00:00Z" })]);
    const diffPath = join(tmp, "diff.txt");
    writeFileSync(diffPath, "+" + entry("baseline-new-1", { entry_kind: "finding", status: "open", created_at: "2026-07-15T00:00:00Z" }) + "\n", "utf8");
    try {
      const proc = runScript([diffPath], { cwd: tmp });
      assert.strictEqual(proc.status, 0, `expected exit 0, got ${proc.status}\nstderr: ${proc.stderr}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("change-log with valid `consolidates` (target in base) -> exit 0", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ci-deltas-cl-clean-"));
    writeBaseCwd(tmp, [entry("target-f-1", { entry_kind: "finding", status: "open", created_at: "2026-07-01T00:00:00Z" })]);
    const diffPath = join(tmp, "diff.txt");
    const clLine = entry("cl-new", {
      entry_kind: "change-log",
      change_dimension: "semantic",
      change_target: "tools/learning-loop-mastra/core/meta-state.js",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "Test change-log with a valid consolidates target (min 20 chars)",
      consolidates: ["target-f-1"],
      status: "active",
      created_at: "2026-07-15T00:00:00Z",
    });
    writeFileSync(diffPath, "+" + clLine + "\n", "utf8");
    try {
      const proc = runScript([diffPath], { cwd: tmp });
      assert.strictEqual(proc.status, 0, `expected exit 0 (valid target), got ${proc.status}\nstderr: ${proc.stderr}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("change-log with unresolved `consolidates` -> exit 1", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ci-deltas-cl-orphan-"));
    // Base has no `meta-gone-typo` — typo'd target.
    writeBaseCwd(tmp, [entry("baseline-1", { entry_kind: "finding", status: "open", created_at: "2026-07-01T00:00:00Z" })]);
    const diffPath = join(tmp, "diff.txt");
    const clLine = entry("cl-new-orphan", {
      entry_kind: "change-log",
      change_dimension: "semantic",
      change_target: "tools/learning-loop-mastra/core/meta-state.js",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "Test change-log with a TYPO in consolidates (min 20 chars)",
      consolidates: ["meta-gone-typo"],
      status: "active",
      created_at: "2026-07-15T00:00:00Z",
    });
    writeFileSync(diffPath, "+" + clLine + "\n", "utf8");
    try {
      const proc = runScript([diffPath], { cwd: tmp });
      assert.strictEqual(proc.status, 1, `expected exit 1 (typo'd change-log ref), got ${proc.status}\nstderr: ${proc.stderr}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("change-log with unresolved `supersedes` -> exit 1", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ci-deltas-cl-sup-orphan-"));
    writeBaseCwd(tmp, [entry("baseline-1", { entry_kind: "finding", status: "open", created_at: "2026-07-01T00:00:00Z" })]);
    const diffPath = join(tmp, "diff.txt");
    const clLine = entry("cl-new-sup", {
      entry_kind: "change-log",
      change_dimension: "semantic",
      change_target: "tools/learning-loop-mastra/core/meta-state.js",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "Test change-log with a TYPO in supersedes (min 20 chars)",
      supersedes: "meta-gone-sup-typo",
      status: "active",
      created_at: "2026-07-15T00:00:00Z",
    });
    writeFileSync(diffPath, "+" + clLine + "\n", "utf8");
    try {
      const proc = runScript([diffPath], { cwd: tmp });
      assert.strictEqual(proc.status, 1, `expected exit 1 (typo'd change-log supersedes), got ${proc.status}\nstderr: ${proc.stderr}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("non-change-log with unresolved `addresses` -> exit 0 (advisory only)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ci-deltas-loop-orphan-"));
    // No base entry for the loop-design to address — but this is a
    // loop-design `addresses` ref, not a change-log ref, so it stays
    // advisory (cross-PR orphans self-heal on merge).
    writeBaseCwd(tmp, [entry("baseline-1", { entry_kind: "finding", status: "open", created_at: "2026-07-01T00:00:00Z" })]);
    const diffPath = join(tmp, "diff.txt");
    const ldLine = entry("ld-new", {
      entry_kind: "loop-design",
      status: "active",
      addresses: ["meta-gone-orphan"],
      created_at: "2026-07-15T00:00:00Z",
    });
    writeFileSync(diffPath, "+" + ldLine + "\n", "utf8");
    try {
      const proc = runScript([diffPath], { cwd: tmp });
      assert.strictEqual(proc.status, 0, `expected exit 0 (advisory only on non-change-log orphan), got ${proc.status}\nstderr: ${proc.stderr}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("CHANGE_LOG_REF_GATE=0 opt-out -> exit 0 even on a violating ref", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ci-deltas-optout-"));
    writeBaseCwd(tmp, [entry("baseline-1", { entry_kind: "finding", status: "open", created_at: "2026-07-01T00:00:00Z" })]);
    const diffPath = join(tmp, "diff.txt");
    const clLine = entry("cl-new-optout", {
      entry_kind: "change-log",
      change_dimension: "semantic",
      change_target: "tools/learning-loop-mastra/core/meta-state.js",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "Test change-log with an orphan ref + opt-out (min 20 chars)",
      consolidates: ["meta-gone-typo"],
      status: "active",
      created_at: "2026-07-15T00:00:00Z",
    });
    writeFileSync(diffPath, "+" + clLine + "\n", "utf8");
    try {
      const proc = runScript([diffPath], { cwd: tmp, env: { CHANGE_LOG_REF_GATE: "0" } });
      assert.strictEqual(proc.status, 0, `expected exit 0 (opt-out), got ${proc.status}\nstderr: ${proc.stderr}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
