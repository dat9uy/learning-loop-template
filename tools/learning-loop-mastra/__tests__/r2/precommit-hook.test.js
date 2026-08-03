import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");
const GITIGNORE = resolve(REPO_ROOT, ".gitignore");
const ALLOWLIST = resolve(REPO_ROOT, ".loop", "r2-allowlist.json");
const PKG_JSON = resolve(REPO_ROOT, "package.json");

// R13 regression guard: the hybrid test-tiering gate layout. This test
// locks the load-bearing invariants the pre-commit (fast unit) + pre-push
// (full `pnpm test && pnpm fallow:gate`) split relies on so a regression
// is caught early. See
// `plans/260803-1314-hybrid-test-tiering-and-pre-push-gate/` for context.
describe("hybrid gate layout (R13)", () => {
  test(".loop/r2-allowlist.json exists and is committed (not gitignored)", () => {
    assert.ok(existsSync(ALLOWLIST), ".loop/r2-allowlist.json must exist at repo root");
    const gitignore = readFileSync(GITIGNORE, "utf8");
    // No blanket .loop/ ignore that would exclude r2-allowlist.json.
    // An explicit un-ignore line is acceptable; a blanket .loop/ ignore is not.
    const lines = gitignore.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) continue;
      if (trimmed === ".loop/" || trimmed === ".loop/*" || trimmed === ".loop") {
        assert.fail(`.gitignore line "${trimmed}" would ignore .loop/r2-allowlist.json — add an un-ignore line`);
      }
    }
  });

  test(".loop/r2-allowlist.json parses and matches F4 schema", () => {
    const parsed = JSON.parse(readFileSync(ALLOWLIST, "utf8"));
    assert.equal(parsed.schema, "r2-allowlist/v1");
    assert.equal(parsed.version, 1);
    for (const runtime of ["claude-code", "droid", "mastra-code"]) {
      assert.ok(Array.isArray(parsed[runtime]?.own), `${runtime}.own must be an array`);
      assert.ok(Array.isArray(parsed[runtime]?.deny), `${runtime}.deny must be an array`);
    }
    assert.ok(Array.isArray(parsed.universal), "universal must be an array");
  });

  test("claude-code deny list includes the bootstrap-deny critical files", () => {
    const parsed = JSON.parse(readFileSync(ALLOWLIST, "utf8"));
    const deny = parsed["claude-code"].deny;
    for (const pat of [".loop/r2-allowlist.json", "runtime-state.jsonl", ".gate-override", ".factory/**", ".mastracode/**"]) {
      assert.ok(deny.includes(pat), `claude-code.deny must include "${pat}"`);
    }
  });

  test("universal list includes the shared write targets", () => {
    const parsed = JSON.parse(readFileSync(ALLOWLIST, "utf8"));
    const uni = parsed.universal;
    for (const pat of ["records/**", "plans/**", "docs/**", "AGENTS.md", "tools/learning-loop-mastra/**", "meta-state.jsonl"]) {
      assert.ok(uni.includes(pat), `universal must include "${pat}"`);
    }
  });

  test("package.json pre-commit hook runs the fast unit project (not the full gate)", () => {
    const pkg = JSON.parse(readFileSync(PKG_JSON, "utf8"));
    const hook = pkg["simple-git-hooks"]?.["pre-commit"];
    assert.ok(hook, "simple-git-hooks pre-commit must be configured");
    assert.equal(
      hook,
      "pnpm test:unit",
      "pre-commit must run only the unit project — fallow moves to pre-push so per-commit cost is bounded",
    );
  });

  test("package.json pre-push hook runs the full gate (pnpm test + fallow:gate)", () => {
    const pkg = JSON.parse(readFileSync(PKG_JSON, "utf8"));
    const hook = pkg["simple-git-hooks"]?.["pre-push"];
    assert.ok(hook, "simple-git-hooks pre-push must be configured");
    assert.ok(hook.includes("pnpm test"), "pre-push must run pnpm test");
    assert.ok(hook.includes("fallow:gate"), "pre-push must run pnpm fallow:gate");
  });

  test("package.json scripts define test:unit and test:e2e for the projects", () => {
    const pkg = JSON.parse(readFileSync(PKG_JSON, "utf8"));
    assert.ok(pkg.scripts?.["test:unit"], "test:unit script must exist");
    assert.ok(pkg.scripts?.["test:e2e"], "test:e2e script must exist");
    assert.ok(
      pkg.scripts["test:unit"].includes("--project unit"),
      "test:unit must run the unit project",
    );
    assert.ok(
      pkg.scripts["test:e2e"].includes("--project e2e"),
      "test:e2e must run the e2e project",
    );
  });
});