import { describe, test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkR2Ownership, BOOTSTRAP_DENY_PATTERNS } from "../../core/r2/ownership.js";
import { loadAllowlist, invalidateAllowlist, __clearCache } from "../../core/r2/allowlist-cache.js";

const CLAUDE_ALLOWLIST = {
  version: 1,
  schema: "r2-allowlist/v1",
  "claude-code": {
    own: [".claude/**"],
    deny: [".claude/.loop/r2-allowlist.json", ".factory/**", ".mastracode/**", ".loop/r2-allowlist.json", "runtime-state.jsonl", ".gate-override"],
  },
  droid: {
    own: [".factory/**"],
    deny: [".factory/.loop/r2-allowlist.json", ".claude/**", ".mastracode/**", ".loop/r2-allowlist.json", "runtime-state.jsonl", ".gate-override"],
  },
  "mastra-code": {
    own: [".mastracode/**"],
    deny: [".mastracode/.loop/r2-allowlist.json", ".claude/**", ".factory/**", ".loop/r2-allowlist.json", "runtime-state.jsonl", ".gate-override"],
  },
  universal: ["records/**", "plans/**", "docs/**", "AGENTS.md", "tools/learning-loop-mastra/**", ".loop/.cache/**", "meta-state.jsonl"],
};

describe("checkR2Ownership", () => {
  beforeEach(() => __clearCache());

  test("allowlist_self_write_denied (R1): claude-code → .loop/r2-allowlist.json → bootstrap_deny", () => {
    const d = checkR2Ownership({
      runtime: "claude-code",
      path: ".loop/r2-allowlist.json",
      allowlist: CLAUDE_ALLOWLIST,
      root: "/tmp/fake-root",
    });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, "bootstrap_deny");
    assert.ok(d.hint.includes("update_r2_allowlist"), "hint must name update_r2_allowlist");
  });

  test("allowlist_self_write_denied via nested path", () => {
    const d = checkR2Ownership({
      runtime: "claude-code",
      path: "sub/.loop/r2-allowlist.json",
      allowlist: CLAUDE_ALLOWLIST,
      root: "/tmp/fake-root",
    });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, "bootstrap_deny");
  });

  test("runtime_state_jsonl_denied (R6): any runtime → runtime-state.jsonl → bootstrap_deny", () => {
    for (const runtime of ["claude-code", "droid", "mastra-code"]) {
      const d = checkR2Ownership({
        runtime,
        path: "runtime-state.jsonl",
        allowlist: CLAUDE_ALLOWLIST,
        root: "/tmp/fake-root",
      });
      assert.equal(d.allowed, false, `${runtime} must be denied runtime-state.jsonl`);
      assert.equal(d.reason, "bootstrap_deny");
    }
  });

  test("gate_override_denied (R6): .gate-override → bootstrap_deny", () => {
    const d = checkR2Ownership({
      runtime: "claude-code",
      path: ".gate-override",
      allowlist: CLAUDE_ALLOWLIST,
      root: "/tmp/fake-root",
    });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, "bootstrap_deny");
  });

  test("cross_runtime_write_denied: claude-code → .factory/x → deny", () => {
    const d = checkR2Ownership({
      runtime: "claude-code",
      path: ".factory/x",
      allowlist: CLAUDE_ALLOWLIST,
      root: "/tmp/fake-root",
    });
    assert.equal(d.allowed, false);
  });

  test("own_surface_allowed: claude-code → .claude/x → allow", () => {
    const d = checkR2Ownership({
      runtime: "claude-code",
      path: ".claude/x",
      allowlist: CLAUDE_ALLOWLIST,
      root: "/tmp/fake-root",
    });
    assert.equal(d.allowed, true);
  });

  test("universal_surface_allowed: claude-code → records/x → allow", () => {
    const d = checkR2Ownership({
      runtime: "claude-code",
      path: "records/decisions/x.md",
      allowlist: CLAUDE_ALLOWLIST,
      root: "/tmp/fake-root",
    });
    assert.equal(d.allowed, true);
  });

  test("universal_meta_state_allowed: claude-code → meta-state.jsonl → allow (universal)", () => {
    const d = checkR2Ownership({
      runtime: "claude-code",
      path: "meta-state.jsonl",
      allowlist: CLAUDE_ALLOWLIST,
      root: "/tmp/fake-root",
    });
    assert.equal(d.allowed, true);
  });

  test("deny_explicit_match: claude-code → .factory/deep/x → deny (via .factory/**)", () => {
    const d = checkR2Ownership({
      runtime: "claude-code",
      path: ".factory/deep/x",
      allowlist: CLAUDE_ALLOWLIST,
      root: "/tmp/fake-root",
    });
    assert.equal(d.allowed, false);
  });

  test("default_deny: path in no list → deny", () => {
    const d = checkR2Ownership({
      runtime: "claude-code",
      path: "random/unknown/path.md",
      allowlist: CLAUDE_ALLOWLIST,
      root: "/tmp/fake-root",
    });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, "default_deny");
  });

  test("path_normalization: .//./.factory/x normalizes and matches deny", () => {
    const d = checkR2Ownership({
      runtime: "claude-code",
      path: ".//./.factory/x",
      allowlist: CLAUDE_ALLOWLIST,
      root: "/tmp/fake-root",
    });
    assert.equal(d.allowed, false, "normalized path must match .factory/** deny");
  });

  test("glob_dotdot_inside: .claude/../.factory/x resolves to .factory/x → deny", () => {
    const d = checkR2Ownership({
      runtime: "claude-code",
      path: ".claude/../.factory/x",
      allowlist: CLAUDE_ALLOWLIST,
      root: "/tmp/fake-root",
    });
    assert.equal(d.allowed, false, "resolved path must match .factory/** deny");
  });

  test("droid own surface allowed: droid → .factory/x → allow", () => {
    const d = checkR2Ownership({
      runtime: "droid",
      path: ".factory/x",
      allowlist: CLAUDE_ALLOWLIST,
      root: "/tmp/fake-root",
    });
    assert.equal(d.allowed, true);
  });

  test("mastra-code own surface allowed: mastra-code → .mastracode/x → allow", () => {
    const d = checkR2Ownership({
      runtime: "mastra-code",
      path: ".mastracode/x",
      allowlist: CLAUDE_ALLOWLIST,
      root: "/tmp/fake-root",
    });
    assert.equal(d.allowed, true);
  });

  test("universal tools dir allowed for all runtimes", () => {
    for (const runtime of ["claude-code", "droid", "mastra-code"]) {
      const d = checkR2Ownership({
        runtime,
        path: "tools/learning-loop-mastra/core/r2/ownership.js",
        allowlist: CLAUDE_ALLOWLIST,
        root: "/tmp/fake-root",
      });
      assert.equal(d.allowed, true, `${runtime} must be allowed in tools/learning-loop-mastra/**`);
    }
  });

  test("BOOTSTRAP_DENY_PATTERNS is a non-empty frozen array", () => {
    assert.ok(Array.isArray(BOOTSTRAP_DENY_PATTERNS));
    assert.ok(BOOTSTRAP_DENY_PATTERNS.length > 0);
    // contains both bare and ** forms for each critical file
    assert.ok(BOOTSTRAP_DENY_PATTERNS.includes(".loop/r2-allowlist.json"));
    assert.ok(BOOTSTRAP_DENY_PATTERNS.includes("**/.loop/r2-allowlist.json"));
    assert.ok(BOOTSTRAP_DENY_PATTERNS.includes("runtime-state.jsonl"));
    assert.ok(BOOTSTRAP_DENY_PATTERNS.includes("**/runtime-state.jsonl"));
    assert.ok(BOOTSTRAP_DENY_PATTERNS.includes(".gate-override"));
    assert.ok(BOOTSTRAP_DENY_PATTERNS.includes("**/.gate-override"));
  });

  test("allowlist loaded from disk: end-to-end with .loop/r2-allowlist.json", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "r2-own-disk-"));
    try {
      mkdirSync(join(tempRoot, ".loop"), { recursive: true });
      writeFileSync(join(tempRoot, ".loop", "r2-allowlist.json"), JSON.stringify(CLAUDE_ALLOWLIST));
      const al = loadAllowlist(tempRoot);
      assert.equal(al.schema, "r2-allowlist/v1");
      const d = checkR2Ownership({
        runtime: "claude-code",
        path: ".loop/r2-allowlist.json",
        allowlist: al,
        root: tempRoot,
      });
      assert.equal(d.allowed, false);
      assert.equal(d.reason, "bootstrap_deny");
    } finally {
      __clearCache();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});