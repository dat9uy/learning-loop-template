import assert from "node:assert";
import { test } from "vitest";
import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { CHECKLIST, stripCommentsAndStrings } from "../../core/runtime-agnostic-checklist.js";
import { SURFACES } from "../../core/surfaces.js";

const MCP_ROOT = new URL("../../../../", import.meta.url).pathname;
const CORE_DIR = join(MCP_ROOT, "tools/learning-loop-mastra/core");
const SHIM_DIRS = SURFACES.map((s) => join(MCP_ROOT, s, "coordination/hooks"));
const MANIFEST_PATH = join(MCP_ROOT, "tools/learning-loop-mastra/agent-manifest.json");
const PROTOCOL_ADAPTER_PATH = join(MCP_ROOT, "tools/learning-loop-mastra/hooks/universal/lib/protocol-adapter.js");

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
  assert.deepStrictEqual([...mod.SURFACES], [".claude", ".factory", ".mastracode"]);
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

await test("core/ has no hard-coded join(root, <surface>) outside surfaces.js", () => {
  // Surface alternation derived from SURFACES so the enforcement covers every
  // runtime (a file hard-coding join(root, ".mastracode") is caught too).
  const surfaceAlt = SURFACES.map((s) => s.slice(1)).join("|");
  const hardCodedSurfacePath = new RegExp(`join\\s*\\(\\s*root\\s*,\\s*"\\.(${surfaceAlt})"`);
  const offenders = [];
  for (const file of readdirSync(CORE_DIR, { recursive: true })) {
    if (typeof file !== "string") continue;
    if (!file.endsWith(".js")) continue;
    if (file.endsWith(".test.js")) continue;
    if (file.endsWith("surfaces.js")) continue;
    const path = join(CORE_DIR, file);
    const src = readFileSync(path, "utf8");
    if (hardCodedSurfacePath.test(src)) offenders.push(file);
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

await test("all shim directories have the same set of .cjs shim names", () => {
  const filterShims = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".cjs")).sort() : []);
  const nameSets = SHIM_DIRS.map(filterShims);
  const reference = nameSets[0];
  assert.ok(reference.length > 0, "expected at least one .cjs shim per surface");
  for (let i = 0; i < SHIM_DIRS.length; i++) {
    assert.deepStrictEqual(
      nameSets[i],
      reference,
      `shim name-set mismatch for ${SHIM_DIRS[i]}: got ${nameSets[i].join(", ")}`,
    );
  }
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

await test("shims-in-sync fails when shim contents differ across surfaces", () => {
  const root = mkdtempSync(join(tmpdir(), "runtime-agnostic-shim-mismatch-"));
  for (const s of SURFACES) {
    mkdirSync(join(root, s, "coordination", "hooks"), { recursive: true });
  }
  // .claude and .factory identical; .mastracode differs -> hash mismatch.
  writeFileSync(join(root, ".claude", "coordination", "hooks", "test-hook.cjs"), "// shim", "utf8");
  writeFileSync(join(root, ".factory", "coordination", "hooks", "test-hook.cjs"), "// shim", "utf8");
  writeFileSync(join(root, ".mastracode", "coordination", "hooks", "test-hook.cjs"), "// divergent shim", "utf8");

  const item = CHECKLIST.find((i) => i.id === "shims-in-sync");
  const result = item.verify("feature/hooks", root);
  assert.strictEqual(result.ok, false, "divergent shim content should fail");
  assert.ok(result.found.includes("test-hook.cjs"), "failure should name the mismatched shim");
  assert.ok(/differ/i.test(result.found), "failure should report hash divergence");
});

await test("shims-in-sync flags a missing .mastracode shim", () => {
  const root = mkdtempSync(join(tmpdir(), "runtime-agnostic-shim-missing-mastracode-"));
  mkdirSync(join(root, ".claude", "coordination", "hooks"), { recursive: true });
  mkdirSync(join(root, ".factory", "coordination", "hooks"), { recursive: true });
  // .mastracode dir intentionally absent the shim.
  writeFileSync(join(root, ".claude", "coordination", "hooks", "test-hook.cjs"), "// shim", "utf8");
  writeFileSync(join(root, ".factory", "coordination", "hooks", "test-hook.cjs"), "// shim", "utf8");

  const item = CHECKLIST.find((i) => i.id === "shims-in-sync");
  const result = item.verify("feature/hooks", root);
  assert.strictEqual(result.ok, false, "a missing .mastracode shim should fail");
  assert.ok(
    result.found.includes(".mastracode/coordination/hooks/test-hook.cjs"),
    "failure should name the missing mastracode shim path",
  );
});

await test("shims-in-sync passes against the real repo (all 3 surfaces, byte-identical)", () => {
  const item = CHECKLIST.find((i) => i.id === "shims-in-sync");
  const result = item.verify("tools/learning-loop-mastra/hooks/universal", MCP_ROOT);
  assert.ok(result.ok, `real-repo shims-in-sync should pass: ${result.found ?? ""}`);
});

await test("cross-surface-iteration flags a hard-coded .mastracode surface path", () => {
  // Regression guard: the auditor's hardCodedPath regex is derived from SURFACES,
  // so a file with join(root, ".mastracode", ...) is flagged. The prior
  // hand-rolled /\.claude|\.factory/ regex did not match .mastracode, so such a
  // file was a false negative.
  const root = mkdtempSync(join(tmpdir(), "runtime-agnostic-mastracode-hardcode-"));
  mkdirSync(join(root, "feature"), { recursive: true });
  writeFileSync(
    join(root, "feature", "hook.js"),
    'const x = join(root, ".mastracode", "coordination", ".marker");',
    "utf8",
  );
  const item = CHECKLIST.find((i) => i.id === "cross-surface-iteration");
  const result = item.verify("feature", root);
  assert.strictEqual(result.ok, false, "hard-coded .mastracode path should be flagged");
  assert.ok(result.found.includes("hook.js"), `failure should name the offending file: ${result.found}`);
});

await test("parameterized-for-new-surfaces flags a .mastracode-touching file that does not import surfaces.js", () => {
  // Regression guard: the auditor's touchesSurfaces regex is derived from
  // SURFACES, so a file touching .mastracode (even without the "coordination"
  // keyword) is audited. The prior /\.claude|\.factory/|coordination/ regex
  // did not match .mastracode, so a .mastracode-only file was skipped entirely.
  const root = mkdtempSync(join(tmpdir(), "runtime-agnostic-mastracode-nosurfaces-"));
  mkdirSync(join(root, "feature"), { recursive: true });
  writeFileSync(
    join(root, "feature", "hook.js"),
    'const p = join(root, ".mastracode", "session.json");',
    "utf8",
  );
  const item = CHECKLIST.find((i) => i.id === "parameterized-for-new-surfaces");
  const result = item.verify("feature", root);
  assert.strictEqual(result.ok, false, "a .mastracode-touching file not importing surfaces.js should be flagged");
  assert.ok(result.found.includes("hook.js"), `failure should name the offending file: ${result.found}`);
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

await test("inbound-gate.js writes the operator marker via surfaces.js helper, not a hard-coded surface list", () => {
  const src = readFileSync(join(MCP_ROOT, "tools/learning-loop-mastra/hooks/universal/inbound-gate.js"), "utf8");
  assert.ok(src.includes("writeToAllSurfaces"), "inbound-gate.js must use writeToAllSurfaces for the marker write");
  assert.ok(
    !/for\s*\(\s*const\s+\w+\s+of\s*\[\s*"\.claude"\s*,\s*"\.factory"\s*\]/.test(src),
    "inbound-gate.js must not keep the hard-coded 2-surface for-of loop",
  );
  // GATE_MARKER_PATH single-path test override must remain intact.
  assert.ok(src.includes("process.env.GATE_MARKER_PATH"), "GATE_MARKER_PATH override must be preserved");
});

await test("mark-preflight-complete-tool.js derives coordination dirs from SURFACES, not a hard-coded list", () => {
  const src = readFileSync(join(MCP_ROOT, "tools/learning-loop-mastra/tools/handlers/mark-preflight-complete-tool.js"), "utf8");
  assert.ok(src.includes("SURFACES.map"), "mark-preflight tool must derive coordDirs via SURFACES.map");
  assert.ok(
    !/`\$\{root\}\/\.claude\/coordination`/.test(src) && !/`\$\{root\}\/\.factory\/coordination`/.test(src),
    "mark-preflight tool must not keep hard-coded .claude/.factory coordination literals",
  );
  // GATE_COORD_DIR single-dir test override must remain intact.
  assert.ok(src.includes("process.env.GATE_COORD_DIR"), "GATE_COORD_DIR override must be preserved");
});
