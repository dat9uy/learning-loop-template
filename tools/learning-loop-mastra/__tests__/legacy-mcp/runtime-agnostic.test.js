import assert from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { CHECKLIST, stripCommentsAndStrings } from "../../core/runtime-agnostic-checklist.js";

const MCP_ROOT = new URL("../../../../", import.meta.url).pathname;
const CORE_DIR = join(MCP_ROOT, "tools/learning-loop-mastra/core");
const SHIM_CLAUDE = join(MCP_ROOT, ".claude/coordination/hooks");
const SHIM_FACTORY = join(MCP_ROOT, ".factory/coordination/hooks");
const MANIFEST_PATH = join(MCP_ROOT, "tools/learning-loop-mastra/agent-manifest.json");
const PROTOCOL_ADAPTER_PATH = join(MCP_ROOT, "tools/learning-loop-mastra/hooks/legacy/lib/protocol-adapter.js");

await test("runtime-agnostic checklist has 6 items and surfaces.js passes them all", () => {
  assert.strictEqual(CHECKLIST.length, 6, "checklist must have 6 items");
  for (const item of CHECKLIST) {
    assert.ok(item.id && typeof item.id === "string", "item must have string id");
    assert.ok(item.description && typeof item.description === "string", "item must have description");
    assert.strictEqual(typeof item.verify, "function", "item must have verify function");
  }

  const surfacesRel = "tools/learning-loop-mastra/core/surfaces.js";
  for (const item of CHECKLIST) {
    const result = item.verify(surfacesRel, MCP_ROOT);
    assert.ok(result.ok, `${item.id} failed for surfaces.js: ${result.found ?? ""}`);
  }
});

await test("surfaces.js exports all cross-surface helpers", () => {
  const src = readFileSync(join(CORE_DIR, "surfaces.js"), "utf8");
  for (const helper of [
    "SURFACES",
    "getAllCoordinationPaths",
    "writeToAllSurfaces",
    "readFromAllSurfaces",
    "appendToAllSurfaces",
    "readJsonlFromAllSurfaces",
    "readModifyWriteOnAllSurfaces",
  ]) {
    assert.ok(src.includes("export") && src.includes(helper), `surfaces.js must export ${helper}`);
  }
});

await test("surfaces.js SURFACES is frozen and contains the canonical runtimes", async () => {
  const mod = await import("../../core/surfaces.js");
  assert.ok(Object.isFrozen(mod.SURFACES), "SURFACES must be Object.frozen");
  assert.deepStrictEqual([...mod.SURFACES], [".claude", ".factory"]);
});

await test("surfaces.js helper signatures are stable", () => {
  const src = readFileSync(join(CORE_DIR, "surfaces.js"), "utf8");
  assert.ok(src.includes("function writeToAllSurfaces(root, subpath, content)"));
  assert.ok(src.includes("function readFromAllSurfaces(root, subpath"));
  assert.ok(src.includes("function appendToAllSurfaces(root, subpath, line)"));
  assert.ok(src.includes("function readJsonlFromAllSurfaces(root, subpath"));
  assert.ok(src.includes("function readModifyWriteOnAllSurfaces(root, subpath, modifier"));
});

await test("core/ has no inline for-of-SURFACES loops outside surfaces.js", () => {
  // Exempted files iterate SURFACES for VALIDATION/discovery, not I/O.
  // The hand-rolled-loop ban targets cross-surface read/append/write (those
  // should use the helpers). Per-surface validation iteration that calls
  // a per-entry predicate (e.g., validateMarker in gate-override.js) is a
  // different concern and is allowed when the predicate is the only
  // justification for the loop. Add to this set with a comment justifying
  // why a helper does not fit.
  const VALIDATION_LOOP_EXEMPTIONS = new Set([
    "gate-override.js", // F-1 fix: per-surface validateMarker iteration (first-VALID-wins)
  ]);
  const offenders = [];
  for (const file of readdirSync(CORE_DIR, { recursive: true })) {
    if (typeof file !== "string") continue;
    if (!file.endsWith(".js")) continue;
    if (file.endsWith("surfaces.js")) continue;
    if (VALIDATION_LOOP_EXEMPTIONS.has(file)) continue;
    const path = join(CORE_DIR, file);
    const src = readFileSync(path, "utf8");
    if (/for\s*\(\s*const\s+\w+\s+of\s+SURFACES\s*\)/.test(src)) offenders.push(file);
  }
  assert.deepStrictEqual(offenders, [], `core/ files with hand-rolled SURFACES loops: ${offenders.join(", ")}`);
});

await test("core/ has no hard-coded join(root, \".claude\" or \".factory\") outside surfaces.js", () => {
  const offenders = [];
  for (const file of readdirSync(CORE_DIR, { recursive: true })) {
    if (typeof file !== "string") continue;
    if (!file.endsWith(".js")) continue;
    if (file.endsWith(".test.js")) continue;
    if (file.endsWith("surfaces.js")) continue;
    const path = join(CORE_DIR, file);
    const src = readFileSync(path, "utf8");
    if (/join\s*\(\s*root\s*,\s*"\.(claude|factory)"/.test(src)) offenders.push(file);
  }
  assert.deepStrictEqual(offenders, [], `core/ files with hard-coded surface paths: ${offenders.join(", ")}`);
});

await test("all core/ files that read or write coordination paths import from surfaces.js", () => {
  const offenders = [];
  for (const file of readdirSync(CORE_DIR, { recursive: true })) {
    if (typeof file !== "string") continue;
    if (!file.endsWith(".js")) continue;
    if (file.endsWith(".test.js")) continue;
    if (file.endsWith("surfaces.js")) continue;
    const path = join(CORE_DIR, file);
    const src = readFileSync(path, "utf8");
    if (!src.includes("coordination")) continue;
    if (!src.includes('from "./surfaces.js"') && !src.includes('from "../surfaces.js"')) {
      offenders.push(file);
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `core/ files mentioning 'coordination' without importing surfaces.js: ${offenders.join(", ")}`,
  );
});

await test("both shim directories have the same set of .cjs shim names", () => {
  const filterShims = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".cjs")).sort() : []);
  const claudeShims = filterShims(SHIM_CLAUDE);
  const factoryShims = filterShims(SHIM_FACTORY);
  assert.deepStrictEqual(
    claudeShims,
    factoryShims,
    `claude shims: ${claudeShims.join(", ")}; factory shims: ${factoryShims.join(", ")}`,
  );
});

await test("agent-manifest.json is registered and has the expected group structure", () => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  assert.strictEqual(manifest.server, "learning-loop");
  assert.ok(manifest.groups.gate, "manifest must have a 'gate' group");
  assert.ok(manifest.groups.workflow, "manifest must have a 'workflow' group");
  assert.ok(manifest.groups.meta_state, "manifest must have a 'meta_state' group");
  assert.ok(manifest.groups.introspection, "manifest must have an 'introspection' group");
});

await test("protocol-adapter.js exports the canonical I/O contract", () => {
  const src = readFileSync(PROTOCOL_ADAPTER_PATH, "utf8");
  for (const sym of ["parseInput", "formatOutput", "normalizeToolName"]) {
    assert.ok(src.includes("export") && src.includes(sym), `protocol-adapter.js must export ${sym}`);
  }
});

await test("shims-in-sync fails when shim contents differ", () => {
  const root = mkdtempSync(join(tmpdir(), "runtime-agnostic-shim-mismatch-"));
  mkdirSync(join(root, "feature", "hooks"), { recursive: true });
  mkdirSync(join(root, ".claude", "coordination", "hooks"), { recursive: true });
  mkdirSync(join(root, ".factory", "coordination", "hooks"), { recursive: true });
  writeFileSync(join(root, "feature", "hooks", "test-hook.js"), "// hook", "utf8");
  writeFileSync(join(root, ".claude", "coordination", "hooks", "test-hook.cjs"), "// claude shim", "utf8");
  writeFileSync(join(root, ".factory", "coordination", "hooks", "test-hook.cjs"), "// factory shim", "utf8");

  const item = CHECKLIST.find((i) => i.id === "shims-in-sync");
  const result = item.verify("feature/hooks", root);
  assert.strictEqual(result.ok, false, "mismatched shims should fail");
  assert.ok(result.found.includes("test-hook.cjs"), "failure should name the mismatched shim");
});

await test("stripCommentsAndStrings removes comments and template literals before regex testing", () => {
  const input = [
    "    // This comment contains .claude which is a false-positive bait",
    "    /* This block comment contains .factory which is also a false-positive bait */",
    '    const x = ".claude";  // string literal containing .claude (preserved)',
    "    const y = '.factory'; // single-quoted string (preserved)",
    "    const z = `${SURFACES[0]}/foo`;  // template literal (stripped)",
    '    const real = "real string content";',
    "  ",
  ].join("\n");
  const stripped = stripCommentsAndStrings(input);
  assert.strictEqual(stripped.includes("// This comment contains .claude"), false, "line comment should be stripped");
  assert.strictEqual(stripped.includes("This block comment contains .factory"), false, "block comment should be stripped");
  assert.strictEqual(stripped.includes("${SURFACES[0]}/foo"), false, "template literal content should be stripped");
  assert.ok(stripped.includes('const x = ".claude"'), "quoted string literals should be preserved");
  assert.ok(stripped.includes("const real"), "non-surface code should remain");
});

await test("GLOB_SCOPE_WHITELIST includes both surface prefixes via SURFACES", () => {
  const src = readFileSync(join(CORE_DIR, "gate-logic.js"), "utf8");
  assert.ok(src.includes("...SURFACES.map"), "GLOB_SCOPE_WHITELIST must use SURFACES.map(...) to derive prefixes");
});
