// Parity tests for the read-only CLI transport.
//
// For each of the 7 read-only tools:
//   - direct side: import the handler module, adaptLegacyHandler, run against tmpdirA.
//   - CLI side: spawnSync node bin/loop.mjs <tool> '<json>' against tmpdirB.
//   - MCP side: call the production MCP server against an independent tmpdir.
//
// The two tmpdirs are INDEPENDENT (each freshly seeded from the same fixture
// bytes). Two reasons a shared tmpdir breaks parity:
//   (a) meta_state_check_grounding auto-records the fingerprint on the FIRST
//       call only, so fingerprint_was_recorded would flip across run order in
//       a shared root;
//   (b) several handlers appendGateLog — a shared root lets one side observe
//       the other's gate-log writes.
//
// Parity comparison is STRUCTURAL: a known set of non-deterministic fields
// (checked_at / duration_ms / built_at / fingerprint_was_recorded / timing.*)
// is stripped from both sides before deepStrictEqual.
//
// `evidence_code_ref` is NOT stripped — it is NORMALIZED: the handler
// resolves it to an absolute path under the per-side tmpdir, so with
// independent roots the raw value differs by tmpdir name even though the
// finding id is the same. Replacing the per-side root prefix with `<root>`
// keeps the field in the comparison AND under the field-set guard, so a
// future rename/drop of evidence_code_ref is caught (a plain strip would
// hide it).
//
// `fingerprint_was_recorded` is stripped: the fixture's evidence_code_ref
// points at bin/loop.mjs which doesn't exist inside either tmpdir, so the
// auto-record branch in meta-state-check-grounding-tool.js is skipped on
// both sides and the field is false on both — the strip keeps the test
// robust to fixture edits that flip the record branch on.
//
// The first comparison checks CLI stdout against a DIRECT handler call with NO
// Mastra context. The second comparison calls the production MCP server, so a
// future read handler that consumes Mastra context cannot drift silently.
//
// Exit-code contract tests lock 0/1/2 (success/handler-error/usage).

import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { adaptLegacyHandler } from "../mastra/handler-adapter.js";
import { resolveToolImportUrl } from "../core/manifest-loader.js";
import { connectMcpServer } from "./with-mcp-server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");
const PROJECT_ROOT = resolve(PKG_ROOT, "..", "..");
const LOOP_BIN = join(PKG_ROOT, "bin", "loop.mjs");
const SERVER_ENTRY = join(PKG_ROOT, "mastra", "server.js");

const READ_ONLY_TOOLS = [
  "loop_describe",
  "loop_get_instruction",
  "meta_state_list",
  "meta_state_relationships",
  "meta_state_derive_status",
  "meta_state_check_grounding",
  "runtime_state_read",
];

// Strip non-deterministic fields the parity comparison must ignore.
// Recurses into `result.grounding`, `result.derivation`, and the top level.
const STRIP_KEYS = new Set([
  "checked_at",
  "duration_ms",
  "built_at",
  "fingerprint_was_recorded",
]);

// Replace a per-side tmpdir root prefix with `<root>` so path-valued fields
// (evidence_code_ref resolved to an absolute path under the tmpdir) compare
// equal across independent roots without dropping the field.
function normalizeRootPath(value, root) {
  if (typeof value !== "string" || !root) return value;
  if (value.startsWith(root)) return "<root>" + value.slice(root.length);
  return value;
}

function stripNonDeterministic(value, root) {
  if (Array.isArray(value)) return value.map((v) => stripNonDeterministic(v, root));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (STRIP_KEYS.has(k)) continue;
      if (k === "timing" && v && typeof v === "object") continue;
      if (k === "evidence_code_ref") {
        out[k] = stripNonDeterministic(normalizeRootPath(v, root), root);
        continue;
      }
      out[k] = stripNonDeterministic(v, root);
    }
    return out;
  }
  return value;
}

function makeTempRoot() {
  const root = mkdtempSync(join(tmpdir(), "cli-read-parity-"));
  mkdirSync(join(root, "records", "meta", "index"), { recursive: true });
  mkdirSync(join(root, "records", "meta", "capabilities"), { recursive: true });
  mkdirSync(join(root, "records", "meta", "evidence"), { recursive: true });
  mkdirSync(join(root, "records", "meta", "decisions"), { recursive: true });
  writeFileSync(join(root, "runtime-state.jsonl"), "\n", { flag: "a" });
  // Seed meta-state.jsonl with a finding + a change-log for the relationships
  // / derive_status / check_grounding parity cases.
  writeFileSync(
    join(root, "meta-state.jsonl"),
    JSON.stringify({
      id: "fixture-finding-cli-parity",
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "meta",
      status: "open",
      description: "Parity fixture finding for cli-read-parity tests.",
      evidence_code_ref: "tools/learning-loop-mastra/bin/loop.mjs",
      mechanism_check: true,
      created_at: "2026-07-21T00:00:00.000Z",
    }) + "\n" +
      JSON.stringify({
        id: "fixture-change-log-cli-parity",
        entry_kind: "change-log",
        change_dimension: "semantic",
        change_target: "tools/learning-loop-mastra/bin/loop.mjs",
        change_diff: { added: ["tools/learning-loop-mastra/bin/loop.mjs"], removed: [], changed: [] },
        reason: "CLI parity fixture change-log (test-only, not a real change).",
        created_at: "2026-07-21T00:00:00.000Z",
      }) + "\n",
  );
  writeFileSync(
    join(root, "runtime-state.jsonl"),
    JSON.stringify({
      affected_system: "meta-state-tools",
      kind: "ledger-event",
      id: "fixture-ledger-cli-parity",
      value: null,
      delta: null,
      source_ref: "local:meta-state:fixture-finding-cli-parity",
      timestamp: "2026-07-21T00:00:00.000Z",
    }) + "\n",
    { flag: "a" },
  );
  return root;
}

function copySchemas(srcRoot, dstRoot) {
  const schemasSrc = join(PROJECT_ROOT, "schemas");
  const schemasDst = join(dstRoot, "schemas");
  mkdirSync(schemasDst, { recursive: true });
  for (const f of readdirSync(schemasSrc)) {
    if (f.endsWith(".schema.json")) {
      copyFileSync(join(schemasSrc, f), join(schemasDst, f));
    }
  }
}

async function importHandler(toolName) {
  // toolName is the bare name (e.g. "loop_describe"). Look it up in the
  // manifest by export-name match.
  const manifest = JSON.parse(
    readFileSync(join(PKG_ROOT, "tools", "manifest.json"), "utf8")
      .replace(/^\s*\/\/.*$/gm, ""),
  );
  for (const entry of manifest) {
    const mod = await import(resolveToolImportUrl(entry.file));
    const legacy = mod[entry.export];
    if (legacy && legacy.name === toolName) {
      return { legacy, file: entry.file, export: entry.export };
    }
  }
  throw new Error(`tool ${toolName} not found in manifest`);
}

function collectKeySet(value, prefix = "", acc = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectKeySet(v, `${prefix}[${i}]`, acc));
    return acc;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${k}` : k;
      acc.add(path);
      collectKeySet(v, path, acc);
    }
    return acc;
  }
  return acc;
}

const TOOL_CASES = [
  {
    tool: "loop_describe",
    args: { tier: "summary" },
  },
  {
    tool: "loop_get_instruction",
    args: { key: 0 },
  },
  {
    tool: "meta_state_list",
    args: { compact: true },
  },
  {
    tool: "meta_state_relationships",
    args: { id: "fixture-finding-cli-parity", direction: "both" },
  },
  {
    tool: "meta_state_derive_status",
    args: { id: "fixture-finding-cli-parity" },
  },
  {
    tool: "meta_state_check_grounding",
    args: { id: "fixture-finding-cli-parity" },
  },
  {
    tool: "runtime_state_read",
    args: { limit: 5 },
  },
];

describe("cli-read parity", () => {
  for (const { tool, args } of TOOL_CASES) {
    test(`${tool}: CLI stdout matches direct handler (normalized deep-equal)`, async () => {
      const tmpdirA = makeTempRoot();
      const tmpdirB = makeTempRoot();
      copySchemas(PROJECT_ROOT, tmpdirA);
      copySchemas(PROJECT_ROOT, tmpdirB);

      // ---- Direct side: tmpdirA ----
      const { legacy } = await importHandler(tool);
      const directExecute = adaptLegacyHandler(legacy);
      const origRoot = process.env.GATE_ROOT;
      const origLoopSurface = process.env.LOOP_SURFACE;
      const origStorage = process.env.MASTRA_STORAGE_DRIVER;
      try {
        process.env.GATE_ROOT = tmpdirA;
        process.env.LOOP_SURFACE = ".claude";
        process.env.MASTRA_STORAGE_DRIVER = "memory";
        const want = await directExecute({ ...args });
        const wantStripped = stripNonDeterministic(want, tmpdirA);

        // ---- CLI side: tmpdirB ----
        const cliEnv = { ...process.env };
        // unset then re-set explicitly to lock the env we hand to the child
        delete cliEnv.LOOP_SURFACE;
        delete cliEnv.MASTRA_STORAGE_DRIVER;
        cliEnv.LOOP_SURFACE = ".claude";
        cliEnv.GATE_ROOT = tmpdirB;
        cliEnv.MASTRA_STORAGE_DRIVER = "memory";
        const proc = spawnSync("node", [LOOP_BIN, tool, JSON.stringify(args)], {
          env: cliEnv,
          encoding: "utf8",
          timeout: 30000,
        });
        assert.strictEqual(proc.status, 0, `cli must exit 0; stderr=${proc.stderr}`);
        const stdoutTrim = (proc.stdout ?? "").trim();
        const gotRaw = JSON.parse(stdoutTrim);
        const gotStripped = stripNonDeterministic(gotRaw, tmpdirB);

        assert.deepStrictEqual(
          gotStripped,
          wantStripped,
          `parity mismatch for ${tool}\nCLI: ${JSON.stringify(gotStripped)}\nDirect: ${JSON.stringify(wantStripped)}`,
        );

        // Field-set guard: same set of keys (after stripping) on both sides —
        // catches future field renames/drops.
        const wantKeys = collectKeySet(wantStripped);
        const gotKeys = collectKeySet(gotStripped);
        assert.deepStrictEqual(
          [...gotKeys].sort(),
          [...wantKeys].sort(),
          `field-set mismatch for ${tool}`,
        );
      } finally {
        if (origRoot === undefined) delete process.env.GATE_ROOT;
        else process.env.GATE_ROOT = origRoot;
        if (origLoopSurface === undefined) delete process.env.LOOP_SURFACE;
        else process.env.LOOP_SURFACE = origLoopSurface;
        if (origStorage === undefined) delete process.env.MASTRA_STORAGE_DRIVER;
        else process.env.MASTRA_STORAGE_DRIVER = origStorage;
      }
    }, 60000);
  }
});

describe("cli-to-mcp read parity", () => {
  for (const { tool, args } of TOOL_CASES) {
    test(`${tool}: CLI stdout matches MCP response (normalized deep-equal)`, async () => {
      const mcpRoot = makeTempRoot();
      const cliRoot = makeTempRoot();
      copySchemas(PROJECT_ROOT, mcpRoot);
      copySchemas(PROJECT_ROOT, cliRoot);

      const mcp = await connectMcpServer(SERVER_ENTRY, mcpRoot, {
        LOOP_READS_VIA_CLI: "0",
      });
      try {
        const mcpRaw = await mcp.callTool(`mastra_${tool}`, { ...args });
        const mcpNormalized = stripNonDeterministic(mcpRaw, mcpRoot);

        const cliEnv = {
          ...process.env,
          LOOP_SURFACE: ".claude",
          GATE_ROOT: cliRoot,
          MASTRA_STORAGE_DRIVER: "memory",
        };
        const proc = spawnSync("node", [LOOP_BIN, tool, JSON.stringify(args)], {
          env: cliEnv,
          encoding: "utf8",
          timeout: 30000,
        });
        assert.strictEqual(proc.status, 0, `cli must exit 0; stderr=${proc.stderr}`);
        const cliRaw = JSON.parse((proc.stdout ?? "").trim());
        const cliNormalized = stripNonDeterministic(cliRaw, cliRoot);

        assert.deepStrictEqual(
          cliNormalized,
          mcpNormalized,
          `MCP parity mismatch for ${tool}\nCLI: ${JSON.stringify(cliNormalized)}\nMCP: ${JSON.stringify(mcpNormalized)}`,
        );
        assert.deepStrictEqual(
          [...collectKeySet(cliNormalized)].sort(),
          [...collectKeySet(mcpNormalized)].sort(),
          `MCP field-set mismatch for ${tool}`,
        );
      } finally {
        await mcp.cleanup();
      }
    }, 60000);
  }
});

describe("cli-read exit-code contract", () => {
  test("loop.mjs with no args exits 2 with stderr diagnostic", () => {
    const proc = spawnSync("node", [LOOP_BIN], { encoding: "utf8", timeout: 10000 });
    assert.strictEqual(proc.status, 2, `must exit 2; stderr=${proc.stderr}`);
    assert.ok((proc.stderr ?? "").length > 0, "stderr must be non-empty");
  });

  test("loop.mjs no_such_tool '{}' exits 2 (unknown tool)", () => {
    const proc = spawnSync("node", [LOOP_BIN, "no_such_tool", "{}"], { encoding: "utf8", timeout: 10000 });
    assert.strictEqual(proc.status, 2, `must exit 2; stderr=${proc.stderr}`);
  });

  test("loop.mjs meta_state_list 'not-json' exits 2 (bad JSON)", () => {
    const proc = spawnSync("node", [LOOP_BIN, "meta_state_list", "not-json"], { encoding: "utf8", timeout: 10000 });
    assert.strictEqual(proc.status, 2, `must exit 2; stderr=${proc.stderr}`);
  });

  test("loop.mjs meta_state_list 'not-an-object' exits 2 (ZodError — valid JSON, wrong shape)", () => {
    // The schema is z.object({...}); passing a non-object trips zod. The JSON
    // is intentionally valid so the JSON-parse branch (separate test) doesn't
    // fire and the ZodError branch in runTool is exercised.
    // LOOP_SURFACE must be set so the identity pin doesn't preempt the ZodError
    // mapping (pin throws first and exits 2 with a different stderr message).
    const env = { ...process.env, LOOP_SURFACE: ".claude" };
    const proc = spawnSync("node", [LOOP_BIN, "meta_state_list", '[1,2,3]'], {
      env,
      encoding: "utf8",
      timeout: 10000,
    });
    assert.strictEqual(proc.status, 2, `must exit 2; stderr=${proc.stderr}`);
    assert.ok(
      (proc.stderr ?? "").toLowerCase().includes("invalid") ||
        (proc.stderr ?? "").toLowerCase().includes("expected") ||
        (proc.stderr ?? "").toLowerCase().includes("arg validation"),
      `stderr must name the zod failure; got: ${proc.stderr}`,
    );
  });

  test("loop.mjs with unset LOOP_SURFACE exits 2 (identity-pin precondition)", () => {
    const env = { ...process.env };
    delete env.LOOP_SURFACE;
    // Set a fresh temp root so resolveRoot doesn't try the repo root.
    const tmpRoot = makeTempRoot();
    env.GATE_ROOT = tmpRoot;
    const proc = spawnSync("node", [LOOP_BIN, "meta_state_list", "{}"], {
      env,
      encoding: "utf8",
      timeout: 10000,
    });
    assert.strictEqual(proc.status, 2, `must exit 2; stderr=${proc.stderr}`);
    assert.ok(
      (proc.stderr ?? "").includes("LOOP_SURFACE"),
      `stderr must name LOOP_SURFACE; got: ${proc.stderr}`,
    );
  });

  test("loop.mjs list prints the 7 bare read-only tool names, no mastra_ prefix", () => {
    const env = { ...process.env };
    env.LOOP_SURFACE = ".claude";
    const proc = spawnSync("node", [LOOP_BIN, "list"], {
      env,
      encoding: "utf8",
      timeout: 30000,
    });
    assert.strictEqual(proc.status, 0, `must exit 0; stderr=${proc.stderr}`);
    const out = proc.stdout ?? "";
    for (const tool of READ_ONLY_TOOLS) {
      assert.ok(out.includes(tool), `list output must contain ${tool}; got: ${out.slice(0, 500)}`);
    }
    assert.ok(!out.includes("mastra_"), `list output must not contain mastra_ prefix; got: ${out.slice(0, 500)}`);
  });

  test("loop.mjs list works WITHOUT LOOP_SURFACE (discovery command is pin-exempt)", () => {
    // `list` reads no runtime records, so it is exempt from the runtime-pin
    // contract — an operator can list the surface before configuring
    // LOOP_SURFACE. Locks the LOW-2 fix against a regression that re-pins
    // before the list early-return.
    const env = { ...process.env };
    delete env.LOOP_SURFACE;
    const proc = spawnSync("node", [LOOP_BIN, "list"], {
      env,
      encoding: "utf8",
      timeout: 30000,
    });
    assert.strictEqual(proc.status, 0, `list must exit 0 without LOOP_SURFACE; stderr=${proc.stderr}`);
    const out = proc.stdout ?? "";
    for (const tool of READ_ONLY_TOOLS) {
      assert.ok(out.includes(tool), `list output must contain ${tool} without LOOP_SURFACE; got: ${out.slice(0, 500)}`);
    }
  });

  test("handler-error path: missing id returns not-found payload (exit 0)", () => {
    // meta_state_check_grounding returns a not-found object (via findEntryOrNotFound)
    // for an unknown id — it does NOT throw. The CLI surfaces this as exit 0
    // with a JSON result carrying the canonical not-found shape
    // { error: "entry_not_found", id } the MCP path returns.
    const tmpRoot = makeTempRoot();
    copySchemas(PROJECT_ROOT, tmpRoot);
    const env = { ...process.env };
    env.LOOP_SURFACE = ".claude";
    env.GATE_ROOT = tmpRoot;
    env.MASTRA_STORAGE_DRIVER = "memory";
    const proc = spawnSync("node", [LOOP_BIN, "meta_state_check_grounding", '{"id":"missing-id-fixture"}'], {
      env,
      encoding: "utf8",
      timeout: 15000,
    });
    assert.strictEqual(proc.status, 0, `not-found must exit 0; stderr=${proc.stderr}`);
    const stdoutTrim = (proc.stdout ?? "").trim();
    const out = JSON.parse(stdoutTrim);
    assert.strictEqual(out.error, "entry_not_found", `not-found payload must carry error: "entry_not_found"; got: ${stdoutTrim}`);
    assert.strictEqual(out.id, "missing-id-fixture", `not-found payload must echo the requested id; got: ${stdoutTrim}`);
  });

  test("handler-throws path: out-of-root evidence_code_ref → exit 1 (PathContainmentError)", () => {
    // Locks the exit-1 contract branch. checkGrounding re-throws
    // PathContainmentError when evidence_code_ref resolves to a REAL path
    // outside root — core/check-grounding.js:165-173 only swallows the
    // missing-inside-root case (resolvedPath === null); an existing
    // outside-root file throws with resolvedPath set (core/path-containment.js
    // :120-121). Seed a finding whose evidence_code_ref is an absolute path
    // to a file that exists outside the tmpdir GATE_ROOT (the project's own
    // package.json). The handler throws post-validation → main().catch
    // fallthrough → exit 1.
    const outsideFile = join(PROJECT_ROOT, "package.json");
    const tmpRoot = mkdtempSync(join(tmpdir(), "cli-exit1-"));
    mkdirSync(join(tmpRoot, "records", "meta", "index"), { recursive: true });
    mkdirSync(join(tmpRoot, "records", "meta", "capabilities"), { recursive: true });
    mkdirSync(join(tmpRoot, "records", "meta", "evidence"), { recursive: true });
    mkdirSync(join(tmpRoot, "records", "meta", "decisions"), { recursive: true });
    writeFileSync(join(tmpRoot, "runtime-state.jsonl"), "\n", { flag: "a" });
    writeFileSync(
      join(tmpRoot, "meta-state.jsonl"),
      JSON.stringify({
        id: "fixture-throw-cli-exit1",
        entry_kind: "finding",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "meta",
        status: "open",
        description: "Exit-1 fixture: evidence_code_ref points outside root.",
        evidence_code_ref: outsideFile,
        mechanism_check: true,
        created_at: "2026-07-21T00:00:00.000Z",
      }) + "\n",
    );
    copySchemas(PROJECT_ROOT, tmpRoot);
    const env = { ...process.env };
    env.LOOP_SURFACE = ".claude";
    env.GATE_ROOT = tmpRoot;
    env.MASTRA_STORAGE_DRIVER = "memory";
    const proc = spawnSync(
      "node",
      [LOOP_BIN, "meta_state_check_grounding", '{"id":"fixture-throw-cli-exit1"}'],
      { env, encoding: "utf8", timeout: 15000 },
    );
    assert.strictEqual(proc.status, 1, `handler-throw must exit 1; stderr=${proc.stderr}`);
    assert.ok((proc.stderr ?? "").length > 0, "stderr must be non-empty on handler error");
  });
});