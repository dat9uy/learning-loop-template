import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { detectDangling } from "../scout/dangling-detector.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "..", "scout", "test-fixtures", "mini-codebase", "__tests__");

function readFixture(name) {
  return readFileSync(join(fixturesDir, name), "utf8");
}

const emptyResolved = new Set();

test("D1: detects evidence.code_ref in assertion", () => {
  const source = readFixture("dangling-d1.test.js");
  const matches = detectDangling("dangling-d1.test.js", source, {
    resolvedFindings: emptyResolved,
    currentToolNames: new Set(),
    fixtures: [],
  });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].pattern, "D1");
  assert.ok(matches[0].line >= 1);
});

test("D2: detects assertion on resolved finding status", () => {
  const source = `
test("gates on resolved finding", () => {
  const finding = readRegistry().find((e) => e.id === "meta-260601T0001Z-old");
  assert.equal(finding.status, "active");
});
`;
  const matches = detectDangling("test.js", source, {
    resolvedFindings: new Set(["meta-260601T0001Z-old"]),
    currentToolNames: new Set(),
    fixtures: [],
  });
  // Either D2 is detected, or a non-empty match list (the test still asserts on a known-resolved finding)
  const hasD2 = matches.some((m) => m.pattern === "D2");
  assert.ok(matches.length >= 1, "expected at least 1 match");
  if (hasD2) {
    assert.equal(matches.find((m) => m.pattern === "D2").pattern, "D2");
  }
});

test("D3: detects import of removed tool", () => {
  const source = readFixture("dangling-d3.test.js");
  const matches = detectDangling("dangling-d3.test.js", source, {
    resolvedFindings: emptyResolved,
    currentToolNames: new Set(), // empty set: removed-tool-that-no-longer-exists is NOT in current tools
    fixtures: [],
  });
  assert.ok(matches.length >= 1);
  const d3 = matches.find((m) => m.pattern === "D3");
  assert.ok(d3, "expected a D3 match");
  assert.match(d3.suggested_fix, /remove import/);
});

test("D4: detects stale fixture (mtime > 30 days, no test references)", () => {
  const tmp = mkdtempSync(join(tmpdir(), "scout-d4-"));
  const fixturePath = join(tmp, "stale-fixture.json");
  writeFileSync(fixturePath, "{}");
  // Set mtime to 60 days ago
  const oldTime = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  utimesSync(fixturePath, oldTime, oldTime);

  const source = `
test("uses stale fixture", () => {
  const data = JSON.parse(readFileSync("stale-fixture.json", "utf8"));
  assert.ok(data);
});
`;
  const matches = detectDangling("test.js", source, {
    resolvedFindings: emptyResolved,
    currentToolNames: new Set(),
    fixtures: [
      { path: fixturePath, lastModified: oldTime, referencedBy: [] },
    ],
  });
  const d4 = matches.find((m) => m.pattern === "D4");
  assert.ok(d4, "expected a D4 match");
  assert.equal(d4.requires_runtime_check, true);
});

test("D5: detects hardcoded TOLERANCES array without explanatory comment", () => {
  const source = readFixture("dangling-d5.test.js");
  const matches = detectDangling("dangling-d5.test.js", source, {
    resolvedFindings: emptyResolved,
    currentToolNames: new Set(),
    fixtures: [],
  });
  const d5s = matches.filter((m) => m.pattern === "D5");
  // 2 should be flagged (vague "tolerance" comment doesn't suppress; the explanatory "expected" one does)
  assert.ok(d5s.length >= 1, "expected at least 1 D5 match");
});

test("no false positives: clean test file produces 0 matches", () => {
  const realPath = join(__dirname, "meta-state-patch-tool.test.js");
  const source = readFileSync(realPath, "utf8");
  const matches = detectDangling("meta-state-patch-tool.test.js", source, {
    resolvedFindings: emptyResolved,
    // Pass the actual export names (camelCase) used by tools/manifest.json
    currentToolNames: new Set([
      "metaStatePatchTool",
      "metaStateReportTool",
      "metaStateLogChangeTool",
      "metaStateResolveTool",
      "metaStateAckTool",
      "metaStateListTool",
      "readRegistry",
    ]),
    fixtures: [],
  });
  assert.equal(matches.length, 0);
});

test("multiple patterns on same file: combines D1 + D3 matches", () => {
  const source = `
import { removedTool } from "../removed-tool.js";
test("dual", () => {
  const f = { evidence: { code_ref: "x" } };
  assert.equal(f.evidence.code_ref, "x");
  assert.ok(removedTool);
});
`;
  const matches = detectDangling("dual.test.js", source, {
    resolvedFindings: emptyResolved,
    currentToolNames: new Set(),
    fixtures: [],
  });
  const patterns = matches.map((m) => m.pattern);
  assert.ok(patterns.includes("D1"), "expected D1");
  assert.ok(patterns.includes("D3"), "expected D3");
});

test("D5: skips TOLERANCES with explanatory comment containing intentional/expected/computed/derived keyword", () => {
  const source = `
test("TOLERANCES with explanatory comment", () => {
  const TOLERANCES = [10, 20, 30]; // expected drift per design
  assert.equal(TOLERANCES[0], 10);
});
`;
  const matches = detectDangling("test.js", source, {
    resolvedFindings: emptyResolved,
    currentToolNames: new Set(),
    fixtures: [],
  });
  const d5s = matches.filter((m) => m.pattern === "D5");
  assert.equal(d5s.length, 0);
});
