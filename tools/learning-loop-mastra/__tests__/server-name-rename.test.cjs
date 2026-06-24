// Server name rename test — asserts the R4 cascade is complete:
//   1. .mcp.json has key "learning-loop" (not "learning-loop-mastra")
//   2. .factory/mcp.json has key "learning-loop"
//   3. .claude/settings.local.json allowlist uses "mcp__learning-loop__*"
//   4. .claude/settings.local.json enabledMcpjsonServers is ["learning-loop"]
//   5. No "learning-loop-mastra" string in non-legacy code (.js/.cjs/.mjs in tools/, .claude/, .factory/)
//   6. The 3 historical references in plans/reports/ are preserved (sample audit)

const { describe, test } = require("node:test");
const assert = require("node:assert");
const { readFileSync, existsSync } = require("node:fs");
const { execSync } = require("node:child_process");
const { join, resolve } = require("node:path");

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");

describe("server name rename (R4)", () => {
  test(".mcp.json has key learning-loop", () => {
    const mcp = JSON.parse(readFileSync(join(PROJECT_ROOT, ".mcp.json"), "utf8"));
    assert.ok(mcp.mcpServers["learning-loop"], ".mcp.json should have key learning-loop");
    assert.strictEqual(mcp.mcpServers["learning-loop-mastra"], undefined,
      ".mcp.json should not have key learning-loop-mastra");
  });

  test(".factory/mcp.json has key learning-loop", () => {
    const mcp = JSON.parse(readFileSync(join(PROJECT_ROOT, ".factory/mcp.json"), "utf8"));
    assert.ok(mcp.mcpServers["learning-loop"], ".factory/mcp.json should have key learning-loop");
    assert.strictEqual(mcp.mcpServers["learning-loop-mastra"], undefined,
      ".factory/mcp.json should not have key learning-loop-mastra");
  });

  test(".claude/settings.local.json allowlist uses mcp__learning-loop__*", () => {
    const settings = JSON.parse(readFileSync(join(PROJECT_ROOT, ".claude/settings.local.json"), "utf8"));
    const allow = settings.permissions?.allow ?? [];
    for (const entry of allow) {
      if (typeof entry === "string" && entry.startsWith("mcp__learning-loop")) {
        assert.ok(entry.startsWith("mcp__learning-loop__"),
          `allowlist entry should start with mcp__learning-loop__, got ${entry}`);
      }
    }
  });

  test(".claude/settings.local.json enabledMcpjsonServers is [learning-loop]", () => {
    const settings = JSON.parse(readFileSync(join(PROJECT_ROOT, ".claude/settings.local.json"), "utf8"));
    const enabled = settings.enabledMcpjsonServers ?? [];
    assert.ok(enabled.includes("learning-loop"),
      `enabledMcpjsonServers should include learning-loop, got ${JSON.stringify(enabled)}`);
    assert.ok(!enabled.includes("learning-loop-mastra"),
      `enabledMcpjsonServers should not include learning-loop-mastra, got ${JSON.stringify(enabled)}`);
  });

  test("no learning-loop-mastra in non-legacy code (tools/, .claude/, .factory/)", () => {
    let result;
    try {
      // Exclude legacy/ directories and this test file
      result = execSync(
        'grep -rln "learning-loop-mastra" tools/ .claude/ .factory/ --include="*.js" --include="*.cjs" --include="*.mjs" --include="*.json" | grep -v "/legacy/" | grep -v "server-name-rename.test.cjs" || true',
        { cwd: PROJECT_ROOT, encoding: "utf8" },
      );
    } catch (e) {
      result = "";
    }
    const files = result.trim().split("\n").filter(Boolean);
    // Filter out files that only have filesystem paths (tools/learning-loop-mastra/... or ../../learning-loop-mastra/...)
    const serverNameRefs = files.filter((f) => {
      const content = readFileSync(join(PROJECT_ROOT, f), "utf8");
      // Check if the file has learning-loop-mastra NOT as part of a filesystem path
      const lines = content.split("\n");
      for (const line of lines) {
        if (line.includes("learning-loop-mastra") &&
            !line.includes("tools/learning-loop-mastra/") &&
            !line.includes("../../learning-loop-mastra/") &&
            !line.includes('"learning-loop-mastra"') &&
            !line.includes("'learning-loop-mastra'")) {
          return true;
        }
      }
      return false;
    });
    assert.deepStrictEqual(serverNameRefs, [],
      `expected 0 non-legacy files with learning-loop-mastra server name, got ${serverNameRefs.length}: ${serverNameRefs.join(", ")}`);
  });

  test("historical references in plans/reports/ are preserved", () => {
    // Sample audit: confirm at least 1 plan file still has learning-loop-mastra
    // (the historical record should not be erased)
    let result;
    try {
      result = execSync(
        'grep -rln "learning-loop-mastra" plans/reports/ | head -3',
        { cwd: PROJECT_ROOT, encoding: "utf8" },
      );
    } catch (e) {
      result = "";
    }
    const files = result.trim().split("\n").filter(Boolean);
    assert.ok(files.length >= 1,
      `expected at least 1 historical plan/report with learning-loop-mastra, got ${files.length}`);
  });
});
