/**
 * TDD tests for the change-log bound-paths detection set +
 * change_target canonicalizer (Plan 4: rec12-closed-loop, phase 1).
 *
 * Rec 12 (b) detection surface: which path-prefixes SHOULD have a change-log
 * on edit. The set is a *superset* of the write-gate `BOUND_ARTIFACTS` — it
 * adds docs/**, tools/learning-loop-mastra/{core,tools,hooks}/**, AGENTS.md,
 * CONTRACT.md, skills mirrors — the trigger surface, not the gate surface.
 *
 * Fixtures are drawn from REAL registry entries (meta-state.jsonl) so the
 * canonicalizer is pinned against the actual patterns the join must absorb:
 *   - #anchor suffix on change_target (real: ~135 entries)
 *   - the legacy package-name → current package-name rename (104 legacy entries)
 *   - bare applies_to.schemas tokens like "core/meta-state.js"
 *   - compound change_targets joined with " + "
 *   - directory markers ("docs/")
 *   - non-path tokens (bare slugs without "/")
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const MCP_ROOT = new URL("../../../../", import.meta.url).pathname;
const CONST_PATH = join(MCP_ROOT, "tools/learning-loop-mastra/core/change-log-bound-paths.js");

describe("CHANGE_LOG_BOUND_PATHS — detection set", () => {
  test("module exists", () => {
    assert.ok(existsSync(CONST_PATH), "core/change-log-bound-paths.js must exist");
  });

  test("exports a frozen CHANGE_LOG_BOUND_PATHS array", async () => {
    const mod = await import("../../core/change-log-bound-paths.js");
    assert.ok(Array.isArray(mod.CHANGE_LOG_BOUND_PATHS), "CHANGE_LOG_BOUND_PATHS must be an array");
    assert.ok(Object.isFrozen(mod.CHANGE_LOG_BOUND_PATHS), "CHANGE_LOG_BOUND_PATHS must be frozen");
  });

  test("covers the Rec 12 detection set exactly", async () => {
    const mod = await import("../../core/change-log-bound-paths.js");
    const required = [
      "docs/**",
      "tools/learning-loop-mastra/core/**",
      "tools/learning-loop-mastra/tools/**",
      "tools/learning-loop-mastra/hooks/**",
      "schemas/**",
      "AGENTS.md",
      "CONTRACT.md",
      ".claude/skills/**",
      ".factory/skills/**",
      ".mastracode/skills/**",
    ];
    for (const r of required) {
      assert.ok(
        mod.CHANGE_LOG_BOUND_PATHS.includes(r),
        `CHANGE_LOG_BOUND_PATHS must include "${r}"; got ${JSON.stringify(mod.CHANGE_LOG_BOUND_PATHS)}`,
      );
    }
  });

  test("no @mastra/* imports (FCIS — sibling of bound-artifacts.js, data-and-logic)", () => {
    const src = readFileSync(CONST_PATH, "utf8");
    assert.ok(
      !/@mastra\//.test(src),
      "core/change-log-bound-paths.js must not import from @mastra/*",
    );
  });
});

describe("canonicalizeChangeTarget — registry-shape fixtures", () => {
  test("single path: docs/loop-engine.md → {docs/loop-engine.md}", async () => {
    const { canonicalizeChangeTarget } = await import("../../core/change-log-bound-paths.js");
    const set = canonicalizeChangeTarget({ change_target: "docs/loop-engine.md" });
    assert.deepStrictEqual(set, new Set(["docs/loop-engine.md"]));
  });

  test("anchor suffix (C1): tools/.../gate-logic.js#applyPromotedRules → bare path", async () => {
    const { canonicalizeChangeTarget } = await import("../../core/change-log-bound-paths.js");
    const set = canonicalizeChangeTarget({
      change_target: "tools/learning-loop-mastra/core/gate-logic.js#applyPromotedRules",
    });
    assert.deepStrictEqual(
      set,
      new Set(["tools/learning-loop-mastra/core/gate-logic.js"]),
    );
  });

  test("pre-rename (C2): legacy package-name path → current package-name path", async () => {
    const { canonicalizeChangeTarget } = await import("../../core/change-log-bound-paths.js");
    const set = canonicalizeChangeTarget({
      change_target: "tools/learning-loop-mcp/core/meta-state.js",
    });
    assert.deepStrictEqual(
      set,
      new Set(["tools/learning-loop-mastra/core/meta-state.js"]),
    );
  });

  test("compound change_target (split on ` + `) preserves anchor stripping + rename + drops non-path", async () => {
    const { canonicalizeChangeTarget } = await import("../../core/change-log-bound-paths.js");
    const set = canonicalizeChangeTarget({
      change_target: "tools/learning-loop-mcp/agent-manifest.json + AGENTS.md + meta-state.jsonl + core/loop-introspect.js",
    });
    assert.deepStrictEqual(
      set,
      new Set([
        "tools/learning-loop-mastra/agent-manifest.json",
        "AGENTS.md",
        "meta-state.jsonl",
        "tools/learning-loop-mastra/core/loop-introspect.js",
      ]),
    );
  });

  test("directory marker preserved (trailing /)", async () => {
    const { canonicalizeChangeTarget } = await import("../../core/change-log-bound-paths.js");
    const set = canonicalizeChangeTarget({ change_target: "docs/" });
    assert.deepStrictEqual(set, new Set(["docs/"]));
  });

  test("non-path token (no `/` and not in top-level allowlist) → dropped", async () => {
    const { canonicalizeChangeTarget } = await import("../../core/change-log-bound-paths.js");
    const set = canonicalizeChangeTarget({ change_target: "meta-state-finding-categories" });
    assert.deepStrictEqual(set, new Set());
  });

  test("bare schema (C3): core/meta-state.js → repo-relativeized to tools/learning-loop-mastra/core/meta-state.js", async () => {
    const { canonicalizeChangeTarget } = await import("../../core/change-log-bound-paths.js");
    const set = canonicalizeChangeTarget({
      change_target: "<non-path>",
      applies_to: { schemas: ["core/meta-state.js"] },
    });
    assert.deepStrictEqual(
      set,
      new Set(["tools/learning-loop-mastra/core/meta-state.js"]),
    );
  });

  test("repo-relative schemas pass-through unchanged (already paths or top-level files)", async () => {
    const { canonicalizeChangeTarget } = await import("../../core/change-log-bound-paths.js");
    const set = canonicalizeChangeTarget({
      applies_to: { schemas: ["docs/loop-engine.md", "AGENTS.md"] },
    });
    assert.deepStrictEqual(set, new Set(["docs/loop-engine.md", "AGENTS.md"]));
  });

  test("bare *.js without `/` is dropped (M5)", async () => {
    const { canonicalizeChangeTarget } = await import("../../core/change-log-bound-paths.js");
    const set = canonicalizeChangeTarget({ change_target: "meta-state.js" });
    assert.deepStrictEqual(set, new Set());
  });

  test("missing both change_target and applies_to.schemas → empty Set", async () => {
    const { canonicalizeChangeTarget } = await import("../../core/change-log-bound-paths.js");
    const set = canonicalizeChangeTarget({});
    assert.deepStrictEqual(set, new Set());
  });

  test("merge: change_target paths AND applies_to.schemas paths are unioned", async () => {
    const { canonicalizeChangeTarget } = await import("../../core/change-log-bound-paths.js");
    const set = canonicalizeChangeTarget({
      change_target: "docs/loop-engine.md",
      applies_to: { schemas: ["core/gate-logic.js"] },
    });
    assert.deepStrictEqual(
      set,
      new Set([
        "docs/loop-engine.md",
        "tools/learning-loop-mastra/core/gate-logic.js",
      ]),
    );
  });

  test("real registry fixture: anchor + rename + compound (meta-260605T1210Z)", async () => {
    const { canonicalizeChangeTarget } = await import("../../core/change-log-bound-paths.js");
    // From the registry: "tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules"
    // + bare "meta-state.jsonl#rule-no-new-artifact-types" (the second has `/` via `meta-state.jsonl`)
    const set = canonicalizeChangeTarget({
      change_target:
        "tools/learning-loop-mcp/core/gate-logic.js#loadPromotedRules + meta-state.jsonl#rule-no-new-artifact-types",
    });
    assert.deepStrictEqual(
      set,
      new Set([
        "tools/learning-loop-mastra/core/gate-logic.js",
        "meta-state.jsonl",
      ]),
    );
  });

  test("real registry fixture: bare schema token in applies_to.schemas (C3)", async () => {
    const { canonicalizeChangeTarget } = await import("../../core/change-log-bound-paths.js");
    // From the registry: schemas: ["core/meta-state.js","__tests__/cold-tier-regression.test.js"]
    const set = canonicalizeChangeTarget({
      change_target: "meta-state-batch-tool",
      applies_to: {
        schemas: ["core/meta-state.js", "__tests__/cold-tier-regression.test.js"],
      },
    });
    // First token in change_target is non-path (dropped); bare core/* → repo-relative;
    // bare __tests__/... has `/` so kept as-is.
    assert.deepStrictEqual(
      set,
      new Set([
        "tools/learning-loop-mastra/core/meta-state.js",
        "__tests__/cold-tier-regression.test.js",
      ]),
    );
  });

  test("real registry fixture: pure token 'docs/' directory", async () => {
    const { canonicalizeChangeTarget } = await import("../../core/change-log-bound-paths.js");
    const set = canonicalizeChangeTarget({
      change_target: "docs/",
      applies_to: { schemas: ["docs/loop-engine.md"] },
    });
    assert.deepStrictEqual(set, new Set(["docs/", "docs/loop-engine.md"]));
  });

  test("real registry fixture: 'meta-state.jsonl#finding.lifecycle' → bare path (anchored entry)", async () => {
    const { canonicalizeChangeTarget } = await import("../../core/change-log-bound-paths.js");
    const set = canonicalizeChangeTarget({
      change_target: "meta-state.jsonl#finding.lifecycle",
    });
    assert.deepStrictEqual(set, new Set(["meta-state.jsonl"]));
  });

  test("top-level file tokens (CONTRACT.md) pass through unchanged", async () => {
    const { canonicalizeChangeTarget } = await import("../../core/change-log-bound-paths.js");
    const set = canonicalizeChangeTarget({
      change_target: "CONTRACT.md",
    });
    assert.deepStrictEqual(set, new Set(["CONTRACT.md"]));
  });

  test("tolerates applies_to without schemas key", async () => {
    const { canonicalizeChangeTarget } = await import("../../core/change-log-bound-paths.js");
    const set = canonicalizeChangeTarget({
      change_target: "docs/x.md",
      applies_to: { tools: ["x"], surfaces: ["y"] },
    });
    assert.deepStrictEqual(set, new Set(["docs/x.md"]));
  });

  test("anchored bare token without `/` AND not in top-level allowlist is dropped", async () => {
    const { canonicalizeChangeTarget } = await import("../../core/change-log-bound-paths.js");
    // `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` has no `/`,
    // and is not in the top-level allowlist, so it is dropped.
    const set = canonicalizeChangeTarget({
      change_target: "loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from",
    });
    assert.deepStrictEqual(set, new Set());
  });
});

describe("isBoundPath — coverage predicate", () => {
  test("matches any CHANGE_LOG_BOUND_PATHS prefix", async () => {
    const { isBoundPath, CHANGE_LOG_BOUND_PATHS } = await import("../../core/change-log-bound-paths.js");
    assert.strictEqual(isBoundPath("docs/loop-engine.md"), true);
    assert.strictEqual(isBoundPath("tools/learning-loop-mastra/core/x.js"), true);
    assert.strictEqual(isBoundPath("schemas/foo.json"), true);
    assert.strictEqual(isBoundPath("AGENTS.md"), true);
    assert.strictEqual(isBoundPath(".claude/skills/x.md"), true);
    // Not bound
    assert.strictEqual(isBoundPath("README.md"), false);
    assert.strictEqual(isBoundPath("src/foo.ts"), false);
    // sanity: at least one positive
    assert.ok(CHANGE_LOG_BOUND_PATHS.length > 0);
  });
});