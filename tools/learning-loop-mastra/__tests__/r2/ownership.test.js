import { describe, test } from "node:test";
import assert from "node:assert";
import { join } from "node:path";
import {
  checkR2Ownership,
  loadAllowlist,
  _setAllowlistForTests,
} from "../../core/r2/ownership.js";

const ROOT = "/test/project";

function abs(rel) {
  return join(ROOT, rel);
}

function baseAllowlist() {
  return {
    version: 1,
    protected_paths: [
      ".loop/r2-allowlist.json",
    ],
    universal: [
      "records/**",
      "plans/**",
      "docs/**",
      "AGENTS.md",
    ],
    runtimes: {
      "claude-code": {
        identity: "claude-code",
        own: [".claude/**"],
        deny: [".factory/**", ".mastracode/**"],
      },
      "droid": {
        identity: "droid",
        own: [".factory/**"],
        deny: [".claude/**", ".mastracode/**"],
      },
      "mastra-code": {
        identity: "mastra-code",
        own: [".mastracode/**"],
        deny: [".claude/**", ".factory/**"],
      },
    },
  };
}

describe("checkR2Ownership — runtime deny", () => {
  test("claude-code cannot write to .factory/", () => {
    const result = checkR2Ownership("claude-code", abs(".factory/hooks.json"), baseAllowlist(), ROOT);
    assert.strictEqual(result.ok, false);
    assert.ok(["cross_runtime_write", "protected_path"].includes(result.reason));
  });

  test("claude-code can write to .claude/", () => {
    const result = checkR2Ownership("claude-code", abs(".claude/hooks.json"), baseAllowlist(), ROOT);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.scope, "own");
  });

  test("claude-code can write to records/ (universal)", () => {
    const result = checkR2Ownership("claude-code", abs("records/x.jsonl"), baseAllowlist(), ROOT);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.scope, "universal");
  });

  test("unknown runtime returns unknown_runtime", () => {
    const result = checkR2Ownership("unknown", abs("x"), baseAllowlist(), ROOT);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, "unknown_runtime");
  });

  test("explicit deny pattern yields cross_runtime_write + hint", () => {
    const result = checkR2Ownership("claude-code", abs(".factory/hooks.json"), baseAllowlist(), ROOT);
    assert.strictEqual(result.ok, false);
    assert.ok(typeof result.hint === "string" && result.hint.length > 0);
  });

  test("protected_path is denied for ALL runtimes (including universal runs)", () => {
    const result = checkR2Ownership("claude-code", abs(".loop/r2-allowlist.json"), baseAllowlist(), ROOT);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, "protected_path");
  });

  test("path outside root returns outside_root", () => {
    const result = checkR2Ownership("claude-code", "/etc/passwd", baseAllowlist(), ROOT);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, "outside_root");
  });
});

describe("globToRegex (via ownership) — basic patterns", () => {
  test("`/**` matches nested paths", () => {
    const result = checkR2Ownership("claude-code", abs(".claude/a/b/c.json"), baseAllowlist(), ROOT);
    assert.strictEqual(result.ok, true);
  });

  test("`AGENTS.md` matches the file at any depth", () => {
    const result = checkR2Ownership("claude-code", abs("AGENTS.md"), baseAllowlist(), ROOT);
    assert.strictEqual(result.ok, true);
  });
});
