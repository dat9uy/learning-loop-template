// cli-write-parity.test.js — Phase 2 of plans/260722-1343-write-capable-cli-w.
//
// Byte-structural parity: CLI writes produce the same persisted registry
// state as the direct handler call AND the MCP server, for every tool in
// CLI_WRITE_TOOLS.
//
// Strategy (mirrors cli-read-parity.test.js):
//   - For each write tool, run a step sequence (seed writes that build
//     prerequisite state, then the target write) against INDEPENDENT
//     seeded tmpdirs for direct / CLI / MCP (appendGateLog + fingerprint
//     auto-record leak across a shared root, so each side must be fresh).
//   - Compare the persisted files the sequence touches: meta-state.jsonl,
//     change-log.jsonl, gate-log.jsonl, runtime-state.jsonl. Strip
//     non-deterministic fields (timestamps, fingerprints, version) before
//     deepStrictEqual.
//
// Seed chaining: most write tools act on an existing entry (resolve, patch,
// supersede, archive, dispatch). Finding/change-log ids are minute-granular
// (`generateId(slug) = meta-<YYMMDDTHHMMZ>-<slug>`), so the same seed write on
// every side produces the SAME id within the same minute, and the target
// step references that id captured from the seed's result. Each side runs
// its own seed sequence, so ids match across sides without hardcoding a
// timestamp.
//
// Tool-specific notes:
//   - meta_state_supersede + meta_state_dispatch_finding(commit) are gated
//     on LOOP_SESSION_MODE=live; those cases set it on all three sides.
//   - runtime_state_record requires a `.loop-preflight-runtime-state` marker
//     that gate_mark_preflight cannot create (its surface enum is
//     product/skills/schemas only). The case writes that marker directly as
//     a test fixture via `setup(root)` before the target step.
//   - The strip set strips any key ending in `_at` (wall-clock stamps:
//     created_at, updated_at, resolved_at, superseded_at, archived_at,
//     promoted_at, dispatched_at, shipped_at, last_verified_at, …) plus
//     timestamp, version, and fingerprint noise.

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
//   - any `*_at` key: wall-clock stamps the handler stamps on write
//     (created_at / updated_at / resolved_at / superseded_at / archived_at /
//     promoted_at / dispatched_at / shipped_at / last_verified_at / …)
//   - timestamp: gate-log + ledger row wall-clock
//   - fingerprint / fingerprint_was_recorded: file-index + ledger noise
//     (the ledger fingerprint is content-derived and would match, but
//     stripping is harmless and matches the read-parity strip policy)
//   - version: auto-incrementing per-id counter
const STRIP_KEYS = new Set([
  "timestamp",
  "fingerprint",
  "fingerprint_was_recorded",
  "version",
]);

function stripNonDeterministic(value) {
  if (Array.isArray(value)) return value.map(stripNonDeterministic);
  if (typeof value === "string") {
    // Finding/change-log ids are minute-granular (`meta-<YYMMDDTHHMMZ>-<slug>`).
    // When direct/CLI/MCP seed runs straddle a minute boundary the generated
    // ids differ only by the timestamp token; the slug is deterministic. Strip
    // the `<YYMMDDTHHMMZ>-` token so id-bearing fields (and the id-reference
    // fields that point at them — consolidated_into, ledger_ref, supersedes,
    // applies_to, consolidates) compare equal across sides. The slug half is
    // unique per case, so this never falsely merges two different entries.
    return value.replace(/\d{6}T\d{4}Z-/g, "");
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (STRIP_KEYS.has(k) || k.endsWith("_at")) continue;
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

function copySchemas(_, dstRoot) {
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
// JSONL rows into one array, strip non-deterministic fields, and return the
// structural snapshot across every file a write tool can touch.
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

// Write the `.loop-preflight-runtime-state` marker directly as a test
// fixture. `gate_mark_preflight` cannot create this marker (its surface
// enum is product/skills/schemas only); runtime_state_record reads it via
// `hasPreflightMarker`. Mirrors the fixture pattern in
// legacy-mcp/meta-state-dispatch-finding-tool.test.js:42.
function writeRuntimeStatePreflightMarker(root) {
  const dir = join(root, ".claude", "coordination");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".loop-preflight-runtime-state"), JSON.stringify({ completed_at: new Date().toISOString() }));
}

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

// Unwrap the {content:[{type:"text",text:<json>}]} envelope into the parsed
// result object so seed-step ids can feed the next step's args.
function unwrap(envelope) {
  const text = envelope?.content?.[0]?.text;
  if (typeof text !== "string") return envelope;
  try {
    return JSON.parse(text);
  } catch {
    return envelope;
  }
}

function resolveArgs(step, results) {
  return typeof step.args === "function" ? step.args(results) : step.args;
}

async function runDirectSeq(steps, tmpRoot, live) {
  const results = [];
  for (const step of steps) {
    const args = resolveArgs(step, results);
    const { legacy } = await importHandler(step.tool);
    const origRoot = process.env.GATE_ROOT;
    const origLoopSurface = process.env.LOOP_SURFACE;
    const origStorage = process.env.MASTRA_STORAGE_DRIVER;
    const origSessionMode = process.env.LOOP_SESSION_MODE;
    try {
      process.env.GATE_ROOT = tmpRoot;
      process.env.LOOP_SURFACE = ".claude";
      process.env.MASTRA_STORAGE_DRIVER = "memory";
      if (live) process.env.LOOP_SESSION_MODE = "live";
      const execute = withR2Gate({
        id: step.tool,
        execute: adaptLegacyHandler(legacy),
        pathFields: [],
      });
      // Parse args through the same zod schema the CLI (`parseSchemaArgs`)
      // and MCP (`createLoopTool`) paths use, so zod defaults (e.g. resolve's
      // `resolved_by: .default("operator")`) apply on the direct side too.
      // Without this, the raw `execute({...args})` call skips schema
      // normalization and diverges from the two real transports.
      const parsed = normalizeInputSchema(legacy.schema).parse(args);
      const envelope = await execute(parsed);
      results.push(unwrap(envelope));
    } finally {
      if (origRoot === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = origRoot;
      if (origLoopSurface === undefined) delete process.env.LOOP_SURFACE;
      else process.env.LOOP_SURFACE = origLoopSurface;
      if (origStorage === undefined) delete process.env.MASTRA_STORAGE_DRIVER;
      else process.env.MASTRA_STORAGE_DRIVER = origStorage;
      if (origSessionMode === undefined) delete process.env.LOOP_SESSION_MODE;
      else process.env.LOOP_SESSION_MODE = origSessionMode;
    }
  }
  return results;
}

function runCliSeq(steps, tmpRoot, live) {
  const results = [];
  for (const step of steps) {
    const args = resolveArgs(step, results);
    const env = {
      ...process.env,
      LOOP_SURFACE: ".claude",
      GATE_ROOT: tmpRoot,
      MASTRA_STORAGE_DRIVER: "memory",
      ...(live ? { LOOP_SESSION_MODE: "live" } : {}),
    };
    const proc = spawnSync("node", [LOOP_BIN, step.tool, JSON.stringify(args)], {
      env,
      encoding: "utf8",
      timeout: 30000,
    });
    assert.strictEqual(
      proc.status,
      0,
      `cli ${step.tool} must exit 0; stderr=${proc.stderr}`,
    );
    results.push(unwrap(JSON.parse(proc.stdout)));
  }
  return results;
}

async function runMcpSeq(steps, tmpRoot, live) {
  const mcp = await connectMcpServer(SERVER_ENTRY, tmpRoot, {
    LOOP_RECORDS_VIA_CLI: "0",
    ...(live ? { LOOP_SESSION_MODE: "live" } : {}),
  });
  const results = [];
  try {
    for (const step of steps) {
      const args = resolveArgs(step, results);
      const envelope = await mcp.callTool("mastra_" + step.tool, args);
      results.push(unwrap(envelope));
    }
  } finally {
    await mcp.cleanup();
  }
  return results;
}

// Shared arg builders. Descriptions are unique per case so the slug-derived
// ids never collide within a sequence.
const report = (description) => ({
  category: "loop-anti-pattern",
  subtype: "cli-write-parity-fixture",
  severity: "warning",
  affected_system: "meta",
  description,
});
const logChange = (change_target) => ({
  change_dimension: "mechanical",
  change_target,
  change_diff: { added: [], removed: [], changed: [] },
  reason: "parity fixture reason",
});

// The parity matrix. Each case = a step sequence (seed writes that build
// prerequisite state, then the target write). `setup(root)` does direct
// test-fixture writes (e.g. the runtime-state preflight marker) that are
// NOT part of the compared snapshot. `live` sets LOOP_SESSION_MODE=live on
// all three sides for live-gated tools.
const CASES = [
  {
    name: "meta_state_report",
    steps: [{ tool: "meta_state_report", args: () => report("parity target report") }],
  },
  {
    name: "meta_state_log_change",
    steps: [{ tool: "meta_state_log_change", args: () => logChange("parity-target-change") }],
  },
  {
    name: "runtime_state_record",
    setup: writeRuntimeStatePreflightMarker,
    steps: [
      {
        tool: "runtime_state_record",
        args: () => ({
          affected_system: "meta-state-tools",
          kind: "ledger-event",
          id: "parity-ledger-1",
          value: 1,
          source_ref: "local:meta-state:parity-seed",
          timestamp: "2026-07-22T00:00:00.000Z",
        }),
      },
    ],
  },
  {
    name: "meta_state_resolve",
    steps: [
      { tool: "meta_state_report", args: () => report("resolve target finding") },
      { tool: "meta_state_resolve", args: (r) => ({ id: r[0].id, resolution: "fixed in parity test" }) },
    ],
  },
  {
    name: "meta_state_patch",
    steps: [
      { tool: "meta_state_report", args: () => report("patch target finding") },
      {
        tool: "meta_state_patch",
        args: (r) => ({ id: r[0].id, entry_kind: "finding", patch: { severity: "escalate" } }),
      },
    ],
  },
  {
    name: "meta_state_archive",
    steps: [
      { tool: "meta_state_report", args: () => report("archive target finding") },
      {
        tool: "meta_state_archive",
        args: (r) => ({ override: [r[0].id], reason: "parity archive" }),
      },
    ],
  },
  {
    name: "meta_state_batch",
    steps: [
      { tool: "meta_state_report", args: () => report("batch target finding") },
      {
        tool: "meta_state_batch",
        // update op: inline mutable fields are the patch (op schema is
        // passthrough). `severity` is not in IMMUTABLE_PATCH_FIELDS.
        args: (r) => ({ operations: [{ op: "update", id: r[0].id, severity: "escalate" }] }),
      },
    ],
  },
  {
    name: "meta_state_supersede",
    live: true,
    steps: [
      // consolidated_into must reference an existing change-log entry.
      { tool: "meta_state_log_change", args: () => logChange("supersede canonical change") },
      { tool: "meta_state_report", args: () => report("supersede target finding") },
      {
        tool: "meta_state_supersede",
        args: (r) => ({
          id: r[1].id,
          consolidated_into: r[0].id,
          resolution: "superseded in parity test",
        }),
      },
    ],
  },
  {
    name: "meta_state_dispatch_finding",
    live: true,
    steps: [
      { tool: "meta_state_report", args: () => report("dispatch target finding") },
      { tool: "meta_state_dispatch_finding", args: (r) => ({ id: r[0].id, stage: "prepare" }) },
      {
        tool: "meta_state_dispatch_finding",
        args: (r) => ({
          id: r[0].id,
          stage: "commit",
          issue_number: 42,
          issue_url: "https://example.com/i/42",
          repo: "dat9uy/loop",
        }),
      },
    ],
  },
];

describe("cli-write parity: every CLI_WRITE_TOOLS entry (direct vs CLI vs MCP)", () => {
  for (const c of CASES) {
    test(`${c.name}: direct / CLI / MCP produce byte-structural parity`, async () => {
      const directRoot = makeTempRoot();
      const cliRoot = makeTempRoot();
      const mcpRoot = makeTempRoot();
      for (const root of [directRoot, cliRoot, mcpRoot]) copySchemas(null, root);
      if (c.setup) for (const root of [directRoot, cliRoot, mcpRoot]) c.setup(root);

      await runDirectSeq(c.steps, directRoot, c.live);
      runCliSeq(c.steps, cliRoot, c.live);
      await runMcpSeq(c.steps, mcpRoot, c.live);

      const directSnapshot = readSnapshot(directRoot);
      const cliSnapshot = readSnapshot(cliRoot);
      const mcpSnapshot = readSnapshot(mcpRoot);

      assert.deepStrictEqual(
        cliSnapshot,
        directSnapshot,
        `CLI vs direct persisted-state mismatch\nCLI: ${JSON.stringify(cliSnapshot)}\nDirect: ${JSON.stringify(directSnapshot)}`,
      );
      assert.deepStrictEqual(
        cliSnapshot,
        mcpSnapshot,
        `CLI vs MCP persisted-state mismatch\nCLI: ${JSON.stringify(cliSnapshot)}\nMCP: ${JSON.stringify(mcpSnapshot)}`,
      );
    }, 60000);
  }
});