#!/usr/bin/env node
/**
 * Measure the CLI transport's context-savings dogfood invariant and, with
 * `--record`, append a `runtime_state_record` ledger row so savings are
 * tracked across sessions.
 *
 * Plan: plans/260726-1953-cli-context-savings-measurement-and-ledger-dogfood.
 *
 * Sibling-of-distinction: measure-context-surfaces.mjs measures MCP-surface
 * absolutes via live tools/list (a different input + lifecycle). This script
 * measures the CLI delta against the static manifest (the planning report
 * explicitly recommended "extend, don't fork" — justified per Phase 2's
 * Risk Assessment: the two scripts have different inputs and lifecycles, and
 * the new script owns the spawnSync + preflight-handling shape that the old
 * one does not).
 *
 * Output: prints pretty JSON on stdout with `measured_at`, `cli_tool_count`,
 * `dropped_def_bytes`, `banner_bytes`, `savings_bytes`, `savings_pct`,
 * `per_tool` (bytes desc), and (when --record was passed) the recorded row
 * summary. Errors print to stderr with non-zero exit.
 *
 * --record mints its own runtime-state preflight marker (TTL 30 min) so the
 * flag works from a fresh shell without an operator preflight dance. The
 * marker is a coordination marker (direct file write), NOT a record (the
 * canonical-record rule still routes through bin/loop.mjs runtime_state_record).
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseManifestJsonc,
  resolveWireBytesForCliTools,
  computeCliContextSavings,
  pickPriorCtxSavingsRow,
  computeSavingsDelta,
} from "../learning-loop-mastra/core/cli-context-savings.js";
import { CLI_TOOLS } from "../learning-loop-mastra/core/cli-tools.js";

const scriptDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const root = resolve(scriptDir, "..", "..");
const binLoopPath = join(root, "tools", "learning-loop-mastra", "bin", "loop.mjs");
const manifestPath = join(root, "tools", "learning-loop-mastra", "tools", "manifest.json");
const hookPath = join(
  root,
  "tools",
  "learning-loop-mastra",
  "hooks",
  "universal",
  "session-start-inject-discoverability.cjs",
);

const PREFLIGHT_PATH_REL = ".claude/coordination/.loop-preflight-runtime-state";
const PREFLIGHT_PATH = join(root, PREFLIGHT_PATH_REL);
const PREFLIGHT_TTL_MS = 30 * 60 * 1000; // mirrors core/runtime-tracking.js:37
const FINDING_ID = "meta-260722T1546Z-the-write-capable-cli-transport-s-context-savings-dogfood-ch";

// `runWithRecord` flips on the existence of `--record` (or `-- --record`,
// since the pnpm script convention passes through additional args via `--`).
const recordMode = process.argv.includes("--record");

function parseBannerBytes(requireFn) {
  // The hook exports `buildTransportBanner({ surface })`. The banner is
  // unconditional (single-surface contract): it always carries the write-tool
  // sketches. One measurement feeds the savings calc.
  const hook = requireFn(hookPath);
  const bannerBytes = Buffer.byteLength(hook.buildTransportBanner({ surface: ".claude" }), "utf8");
  return { readsOnly: bannerBytes, recordsViaCli: bannerBytes };
}

async function main() {
  const { readFileSync: readFs } = await import("node:fs");
  const manifestText = readFs(manifestPath, "utf8");
  const manifest = parseManifestJsonc(manifestText);
  const requireFn = createRequire(import.meta.url);
  const banner = parseBannerBytes(requireFn);

  const wireBytes = await resolveWireBytesForCliTools(manifest, CLI_TOOLS);
  const delta = computeCliContextSavings({ wireBytes, bannerBytes: banner });
  const measuredAt = new Date().toISOString();

  const result = {
    measured_at: measuredAt,
    cli_tool_count: delta.cli_tool_count,
    dropped_def_bytes: delta.dropped_def_bytes,
    per_tool: delta.per_tool,
    banner_bytes: delta.banner_bytes,
    banner_bytes_reads_only: banner.readsOnly,
    banner_bytes_records_via_cli: banner.recordsViaCli,
    savings_bytes: delta.savings_bytes,
    savings_pct: delta.savings_pct,
    root,
  };

  if (!recordMode) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  // --record guard: refuse to mint a ledger row unless every CLI_TOOLS member
  // resolved. A partial resolution would otherwise record a row whose
  // cli_tool_count (perTool.length) and dropped_def_bytes agree with each
  // other but understate the true surface — masking the very regression the
  // dogfood loop is meant to surface. The preceding stderr carries the failed
  // dynamic-import / wire-def-assembly message that explains the shortfall.
  if (wireBytes.length !== CLI_TOOLS.size) {
    console.error(
      `measure-cli-context: --record aborted — only ${wireBytes.length}/${CLI_TOOLS.size} CLI_TOOLS members resolved. ` +
        `Recording now would mint a ledger row that undercounts the surface. ` +
        `See the preceding stderr for the failed dynamic import / wire-def assembly.`,
    );
    process.exit(1);
  }

  // --record path: mint preflight marker, look up prior row, write new row.
  // Mint preflight FIRST so a fresh shell can record without an operator dance.
  const now = Date.now();
  mkdirSync(dirname(PREFLIGHT_PATH), { recursive: true });
  writeFileSync(PREFLIGHT_PATH, JSON.stringify({ completed_at: new Date(now).toISOString() }), "utf8");

  let priorRow = null;
  try {
    const readRes = spawnSync(
      process.execPath,
      [
        binLoopPath,
        "runtime_state_read",
        JSON.stringify({
          affected_system: "runtime-state",
          kind: "ledger-event",
          include_all_versions: true,
          limit: 1000,
        }),
      ],
      {
        cwd: root,
        env: { ...process.env, LOOP_SURFACE: process.env.LOOP_SURFACE ?? ".claude", GATE_ROOT: root },
        encoding: "utf8",
        timeout: 30000,
      },
    );
    if (readRes.status !== 0) {
      throw new Error(`runtime_state_read exited ${readRes.status}: ${readRes.stderr || ""}`);
    }
    const readPayload = JSON.parse(readRes.stdout);
    const rows = Array.isArray(readPayload?.rows) ? readPayload.rows : [];
    priorRow = pickPriorCtxSavingsRow(rows);
  } catch (err) {
    // Prior lookup failure is recoverable: log and proceed with delta=null.
    // Stopping the script here would block the dogfood loop on a transient
    // read failure, which is the failure mode Phase 2 explicitly avoided.
    console.error(`measure-cli-context: prior-row lookup failed (delta=null): ${err?.message ?? err}`);
  }

  const row = {
    affected_system: "runtime-state",
    kind: "ledger-event",
    id: `ctx-savings-${measuredAt.replace(/[:.]/g, "-")}-${process.pid}`,
    source_ref: `local:meta-state:${FINDING_ID}`,
    value: delta.savings_bytes,
    delta: computeSavingsDelta(delta.savings_bytes, priorRow),
    timestamp: measuredAt,
    status: "active",
    fingerprint: null,
    metadata: {
      dropped_def_bytes: Math.trunc(delta.dropped_def_bytes),
      banner_bytes: delta.banner_bytes,
      savings_pct: Number(delta.savings_pct.toFixed(1)),
      cli_tool_count: delta.cli_tool_count,
    },
  };

  const recordRes = spawnSync(
    process.execPath,
    [
      binLoopPath,
      "runtime_state_record",
      JSON.stringify(row),
    ],
    {
      cwd: root,
      env: { ...process.env, LOOP_SURFACE: process.env.LOOP_SURFACE ?? ".claude", GATE_ROOT: root },
      encoding: "utf8",
      timeout: 30000,
    },
  );
  if (recordRes.status !== 0) {
    console.error(`measure-cli-context: runtime_state_record exited ${recordRes.status}: ${recordRes.stderr || ""}`);
    console.error(JSON.stringify({ ok: false, row, child_stdout: recordRes.stdout }, null, 2));
    process.exit(recordRes.status || 1);
  }

  const recordPayload = JSON.parse(recordRes.stdout);
  process.stdout.write(JSON.stringify({ ...result, recorded: { row_id: row.id, ledger_response: recordPayload } }, null, 2) + "\n");
}

main().catch((err) => {
  console.error(`measure-cli-context: ${err?.stack ?? err}`);
  process.exit(1);
});
