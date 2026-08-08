// 3-layer write protection for the session-local ephemeral substrate
// `.loop/runtime-state-local.jsonl`.
//
// The local substrate is protected by the same 3 layers as the committed
// file, with the same preflight marker class (`.loop-preflight-runtime-state-edit`):
//   1. Bash gate — direct shell redirect/tee is gated on the edit marker.
//   2. Write tool — a preflight-delegating rule in evaluate-write-gate.js
//      (NOT a dead-end bound-artifacts.js block).
//   3. R2 ownership — bootstrap_deny for every runtime.
// Plus the .gitignore entry (session-local, never committed) and the
// change-log binding.
//
// The authorized loop-tool writers (runtime_state_record / runtime_state_stop
// with `durability:"ephemeral"`) are NOT gated by these layers — they are
// the sanctioned append path (proven in the durability-split suite).

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { evaluateWriteGate } from "../core/evaluate-write-gate.js";
import { canonicalizeChangeTarget } from "../core/change-log-bound-paths.js";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("gitignore: session-local substrate is never committed", () => {
  test("git check-ignore -v .loop/runtime-state-local.jsonl matches the .gitignore entry", () => {
    let out;
    try {
      out = execFileSync("git", ["check-ignore", "-v", ".loop/runtime-state-local.jsonl"], {
        cwd: PROJECT_ROOT,
        encoding: "utf8",
      });
    } catch (err) {
      assert.fail(`git check-ignore failed (is the path tracked?): ${err.message}`);
    }
    assert.ok(
      out.includes(".gitignore") && out.includes(".loop/runtime-state-local.jsonl"),
      `expected the .gitignore line to match; got: ${out}`,
    );
  });

  test("the committed .gitignore entry is path-specific (r2-allowlist stays tracked)", () => {
    const gitignore = readFileSync(join(PROJECT_ROOT, ".gitignore"), "utf8");
    assert.ok(
      gitignore.includes(".loop/runtime-state-local.jsonl"),
      ".gitignore must name the local substrate",
    );
    assert.ok(
      !gitignore.split("\n").some((l) => l.trim() === ".loop/"),
      ".gitignore must NOT broadly ignore .loop/ — .loop/r2-allowlist.json is tracked",
    );
    assert.ok(
      existsSync(join(PROJECT_ROOT, ".loop", "r2-allowlist.json")),
      "r2-allowlist.json is tracked",
    );
  });
});

describe("write-tool layer delegates, not dead-ends", () => {
  test(".loop/runtime-state-local.jsonl without marker → block, surface=runtime-state-edit", () => {
    // Use a temp root with no preflight markers so the rule deterministically
    // blocks (the live repo may carry a fresh runtime-state-edit marker).
    const root = mkdtempSync(join(tmpdir(), "local-substrate-protection-"));
    const result = evaluateWriteGate({ filePath: join(root, ".loop", "runtime-state-local.jsonl"), root });
    assert.strictEqual(result.decision, "block");
    assert.strictEqual(result.surface, "runtime-state-edit");
  });
});

describe("change-log binding for the local substrate", () => {
  test("canonicalizeChangeTarget binds .loop/runtime-state-local.jsonl", () => {
    const out = canonicalizeChangeTarget({ change_target: ".loop/runtime-state-local.jsonl" });
    assert.ok(out.has(".loop/runtime-state-local.jsonl"), "change-target must canonicalize + bind the local substrate");
  });
});
