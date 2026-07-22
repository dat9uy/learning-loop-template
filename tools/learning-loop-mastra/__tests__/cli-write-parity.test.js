// cli-write-parity.test.js — Phase 2 of plans/260722-1343-write-capable-cli-w.
//
// Byte-structural parity: CLI writes produce the same persisted registry
// state as the direct handler call AND the MCP server.
//
// Strategy (mirrors cli-read-parity.test.js):
//   - For each write tool, run direct-handler vs CLI vs MCP against
//     INDEPENDENT seeded tmpdirs (appendGateLog + fingerprint auto-record
//     leak across a shared root, so each side must be fresh).
//   - Compare the persisted files the handler touches: meta-state.jsonl,
//     change-log.jsonl, gate-log.jsonl, runtime-state.jsonl (where
//     relevant). Strip non-deterministic fields (timestamps, fingerprints,
//     `version` auto-increment, `_expected_version` write-arg leakage)
//     before deepStrictEqual.
//
// Why start with meta_state_report: the simplest write tool — single
// finding append, single gate-log row, no batch shape. Extending to
// meta_state_resolve / meta_state_log_change / meta_state_batch /
// meta_state_patch / meta_state_dispatch_finding follows the same
// pattern (add a case to TOOL_CASES). The strip set below may need
// extension as new tools surface new non-deterministic fields.

import { test } from "vitest";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { adaptLegacyHandler } from "../mastra/handler-adapter.js";
import { resolveToolImportUrl } from "../core/manifest-loader.js";
import { withR2Gate } from "../mastra/with-r2-gate.js";
import { normalizeInputSchema } from "../core/schema-normalize.js";
import { connectMcpServer } from "./with-mcp-server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");
const PROJECT_ROOT = resolve(PKG_ROOT, "..", "..");
const LOOP_BIN = join(PKG_ROOT, "bin", "loop.mjs");
const SERVER_ENTRY = join(PKG_ROOT, "mastra", "server.js");

// Strip non-deterministic fields the parity comparison must ignore.
// Write-side strip set differs from reads:
//   - created_at / updated_at / promoted_at / dispatched_at / timestamp
//     (all wall-clock fields the handler stamps on write)
//   - fingerprint / fingerprint_was_recorded (file-index sidecar noise)
//   - version (auto-incrementing per-id counter — non-deterministic
//     across run orders unless both sides seed identical rows, which
//     they do here, but is fragile to extend)
const STRIP_KEYS = new Set([
  "created_at",
  "updated_at",
  "promoted_at",
  "dispatched_at",
  "timestamp",
  "fingerprint",
  "fingerprint_was_recorded",
  "version",
]);

function stripNonDeterministic(value) {
  if (Array.isArray(value)) return value.map(stripNonDeterministic);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (STRIP_KEYS.has(k)) continue;
      out[k] = stripNonDeterministic(v);
    }
    return out;
  }
  return value;
}

function makeTempRoot() {
  const root = mkdtempSync(join(tmpdir(), "cli-write-parity-"));
  mkdirSync(join(root, "records", "meta", "index"), { recursive: true });
  mkdirSync(join(root, "records", "meta", "capabilities"), { recursive: true });
  mkdirSync(join(root, "records", "meta", "evidence"), { recursive: true });
  mkdirSync(join(root, "records", "meta", "decisions"), { recursive: true });
  writeFileSync(join(root, "runtime-state.jsonl"), "\n", { flag: "a" });
  writeFileSync(join(root, "meta-state.jsonl"), "");
  writeFileSync(join(root, "change-log.jsonl"), "");
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

// Read the persisted side of one tmpdir's state. Concatenate the per-file
// JSONL rows into one array, strip non-deterministic fields, and return
// the structural snapshot. Files touched by `meta_state_report`:
// meta-state.jsonl (the new finding), change-log.jsonl (none for a fresh
// report — the first write creates a finding, no change-log follows),
// gate-log.jsonl (the gate-log row appended by the handler).
function readSnapshot(root) {
  const out = {};
  for (const file of ["meta-state.jsonl", "change-log.jsonl", "gate-log.jsonl", "runtime-state.jsonl"]) {
    const path = join(root, file);
    if (!existsSync(path)) {
      out[file] = [];
      continue;
    }
    const text = readFileSync(path, "utf8");
    const rows = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    out[file] = stripNonDeterministic(rows);
  }
  return out;
}

function existsSync(path) {
  try {
    return readFileSync(path).length >= 0;
  } catch {
    return false;
  }
}

const REPORT_ARGS = {
  category: "loop-anti-pattern",
  subtype: "cli-write-parity-fixture",
  severity: "warning",
  affected_system: "meta",
  description: "Parity fixture finding for cli-write-parity tests.",
};

async function importHandler(toolName) {
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

async function runDirect(toolName, args, tmpRoot) {
  const { legacy } = await importHandler(toolName);
  const origRoot = process.env.GATE_ROOT;
  const origLoopSurface = process.env.LOOP_SURFACE;
  const origStorage = process.env.MASTRA_STORAGE_DRIVER;
  try {
    process.env.GATE_ROOT = tmpRoot;
    process.env.LOOP_SURFACE = ".claude";
    process.env.MASTRA_STORAGE_DRIVER = "memory";
    const execute = withR2Gate({
      id: toolName,
      execute: adaptLegacyHandler(legacy),
      pathFields: [],
    });
    return await execute({ ...args });
  } finally {
    if (origRoot === undefined) delete process.env.GATE_ROOT;
    else process.env.GATE_ROOT = origRoot;
    if (origLoopSurface === undefined) delete process.env.LOOP_SURFACE;
    else process.env.LOOP_SURFACE = origLoopSurface;
    if (origStorage === undefined) delete process.env.MASTRA_STORAGE_DRIVER;
    else process.env.MASTRA_STORAGE_DRIVER = origStorage;
  }
}

function runCli(toolName, args, tmpRoot) {
  const env = {
    ...process.env,
    LOOP_SURFACE: ".claude",
    GATE_ROOT: tmpRoot,
    MASTRA_STORAGE_DRIVER: "memory",
  };
  const proc = spawnSync("node", [LOOP_BIN, toolName, JSON.stringify(args)], {
    env,
    encoding: "utf8",
    timeout: 30000,
  });
  return { status: proc.status, stdout: proc.stdout, stderr: proc.stderr };
}

describe("cli-write parity: meta_state_report", () => {
  test("direct vs CLI produce byte-structural parity (meta-state.jsonl + change-log.jsonl + gate-log.jsonl)", async () => {
    const directRoot = makeTempRoot();
    const cliRoot = makeTempRoot();
    copySchemas(PROJECT_ROOT, directRoot);
    copySchemas(PROJECT_ROOT, cliRoot);

    // Direct handler — unwraps content[0].text into a plain result.
    await runDirect("meta_state_report", REPORT_ARGS, directRoot);
    // CLI — stdout is JSON.parse-able.
    const cliResult = runCli("meta_state_report", REPORT_ARGS, cliRoot);
    assert.strictEqual(cliResult.status, 0, `cli must exit 0; stderr=${cliResult.stderr}`);

    const directSnapshot = readSnapshot(directRoot);
    const cliSnapshot = readSnapshot(cliRoot);

    assert.deepStrictEqual(
      cliSnapshot,
      directSnapshot,
      `CLI vs direct persisted-state mismatch\nCLI: ${JSON.stringify(cliSnapshot)}\nDirect: ${JSON.stringify(directSnapshot)}`,
    );
  }, 60000);

  test("CLI vs MCP produce byte-structural parity", async () => {
    const cliRoot = makeTempRoot();
    const mcpRoot = makeTempRoot();
    copySchemas(PROJECT_ROOT, cliRoot);
    copySchemas(PROJECT_ROOT, mcpRoot);

    const cliResult = runCli("meta_state_report", REPORT_ARGS, cliRoot);
    assert.strictEqual(cliResult.status, 0, `cli must exit 0; stderr=${cliResult.stderr}`);

    const mcp = await connectMcpServer(SERVER_ENTRY, mcpRoot, {
      LOOP_RECORDS_VIA_CLI: "0",
    });
    try {
      await mcp.callTool("mastra_meta_state_report", REPORT_ARGS);
    } finally {
      await mcp.cleanup();
    }

    const cliSnapshot = readSnapshot(cliRoot);
    const mcpSnapshot = readSnapshot(mcpRoot);

    assert.deepStrictEqual(
      cliSnapshot,
      mcpSnapshot,
      `CLI vs MCP persisted-state mismatch\nCLI: ${JSON.stringify(cliSnapshot)}\nMCP: ${JSON.stringify(mcpSnapshot)}`,
    );
  }, 60000);
});
