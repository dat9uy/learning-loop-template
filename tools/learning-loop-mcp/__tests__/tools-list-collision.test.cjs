// Dual-server tools/list collision test.
//
// Spawns both learning-loop-mcp and learning-loop-mastra in the same process,
// asserts the union has 40 + 29 = 69 distinct names, and that each side matches
// its manifest.

const { describe, test } = require("node:test");
const assert = require("node:assert");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const LEGACY_MANIFEST_PATH = join(
  PROJECT_ROOT,
  "tools/learning-loop-mcp/tools/manifest.json",
);
const MASTRA_MANIFEST_PATH = join(
  PROJECT_ROOT,
  "tools/learning-loop-mastra/tools/manifest.json",
);

async function withBothMcpServers(fn) {
  const { withBothMcpServers: helper } = await import(
    "../../learning-loop-mastra/__tests__/with-both-mcp-servers.js"
  );
  return helper(fn);
}

function loadExpectedNames(manifestPath, prefix = "") {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return manifest
    .map(({ file, export: exportName }) => {
      const base = exportName
        .replace(/Tool$/, "")
        .replace(/([A-Z])/g, "_$1")
        .toLowerCase()
        .replace(/^_/, "");
      return prefix + base;
    })
    .sort();
}

describe("tools/list collision", () => {
  test(
    "40 legacy + 29 mastra = 69 distinct names, manifest-matched, no overlap",
    { timeout: 10000 },
    async () => {
      await withBothMcpServers(async ({ listTools }) => {
        const legacyList = await listTools({ server: "legacy" });
        const mastraList = await listTools({ server: "mastra" });

        const legacyNames = legacyList.map((t) => t.name).sort();
        const mastraNames = mastraList.map((t) => t.name).sort();

        assert.strictEqual(legacyNames.length, 40, "legacy must have 40 tools");
        assert.strictEqual(mastraNames.length, 29, "mastra must have 29 tools");

        const allNames = new Set([...legacyNames, ...mastraNames]);
        assert.strictEqual(allNames.size, 69, "no name collisions");

        const expectedLegacy = loadExpectedNames(LEGACY_MANIFEST_PATH);
        const expectedMastra = loadExpectedNames(MASTRA_MANIFEST_PATH, "mastra_");

        assert.deepStrictEqual(legacyNames, expectedLegacy, "legacy names must match manifest");
        assert.deepStrictEqual(mastraNames, expectedMastra, "mastra names must match manifest");
      });
    },
  );

  test("no legacy name starts with mastra_", { timeout: 10000 }, async () => {
    await withBothMcpServers(async ({ listTools }) => {
      const legacyList = await listTools({ server: "legacy" });
      for (const tool of legacyList) {
        assert.ok(
          !tool.name.startsWith("mastra_"),
          `${tool.name} should not have mastra_ prefix`,
        );
      }
    });
  });

  test("every mastra name starts with mastra_", { timeout: 10000 }, async () => {
    await withBothMcpServers(async ({ listTools }) => {
      const mastraList = await listTools({ server: "mastra" });
      for (const tool of mastraList) {
        assert.ok(
          tool.name.startsWith("mastra_"),
          `${tool.name} must have mastra_ prefix`,
        );
      }
    });
  });
});
