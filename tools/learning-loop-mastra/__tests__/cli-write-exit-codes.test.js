// cli-write-exit-codes.test.js — Phase 2 of plans/260722-1343-write-capable-cli-w.
//
// Locks the write-path error contract for `bin/loop.mjs`:
//   - exit 0  : success (result JSON on stdout)
//   - exit 1  : handler / transport rejection (recognized: structured
//               {error, code, reason} JSON on stderr; unrecognized:
//               {error: "InternalError", reason, internal: true} JSON on
//               stderr — distinct shape so the agent does NOT loop
//               retrying programmer bugs by fixing args)
//   - exit 2  : usage / caller-configuration (UsageError, identity-pin
//               preconditions, bad JSON, ZodError — existing exit-2 path)
//
// Agent recovery policy:
//   - recognized rejection  → parse, fix args, retry.
//   - InternalError         → file a bug; do NOT retry by arg-fixing.
//
// The test scaffolds use `LOOP_SURFACE=.claude` + `GATE_ROOT=<tmp>` for
// every spawn so the identity-pin contract does not preempt the
// handler-level error path we are exercising.

import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");
const PROJECT_ROOT = resolve(PKG_ROOT, "..", "..");
const LOOP_BIN = join(PKG_ROOT, "bin", "loop.mjs");

function makeTempRoot() {
  const root = mkdtempSync(join(tmpdir(), "cli-write-exit-codes-"));
  mkdirSync(join(root, "records", "meta", "index"), { recursive: true });
  mkdirSync(join(root, "records", "meta", "capabilities"), { recursive: true });
  mkdirSync(join(root, "records", "meta", "evidence"), { recursive: true });
  mkdirSync(join(root, "records", "meta", "decisions"), { recursive: true });
  writeFileSync(join(root, "runtime-state.jsonl"), "\n", { flag: "a" });
  // meta-state.jsonl intentionally not seeded — handler validation paths
  // are exercised by passing invalid args; CAS / not_found paths are
  // exercised by referencing ids that don't exist.
  return root;
}

function withEnv(extraEnv = {}) {
  return {
    ...process.env,
    LOOP_SURFACE: ".claude",
    MASTRA_STORAGE_DRIVER: "memory",
    ...extraEnv,
  };
}

describe("cli-write exit-code contract (Phase 2)", () => {
  test("success: meta_state_report with valid args → exit 0, result JSON on stdout (unwrapped)", () => {
    const tmpRoot = makeTempRoot();
    const args = JSON.stringify({
      category: "loop-anti-pattern",
      subtype: "cli-write-exit-fixture",
      severity: "warning",
      affected_system: "meta",
      description: "Phase 2 exit-code fixture: valid meta_state_report write via CLI.",
    });
    const proc = spawnSync("node", [LOOP_BIN, "meta_state_report", args], {
      env: withEnv({ GATE_ROOT: tmpRoot }),
      encoding: "utf8",
      timeout: 15000,
    });
    assert.strictEqual(proc.status, 0, `must exit 0; stderr=${proc.stderr}`);
    const stdoutTrim = (proc.stdout ?? "").trim();
    // adaptLegacyHandler unwraps `content[0].text` before stdout emission,
    // so the result is the handler's plain object — `{reported, id, status}`
    // for meta_state_report.
    const out = JSON.parse(stdoutTrim);
    assert.strictEqual(out.reported, true, `expected reported: true; got ${stdoutTrim}`);
    assert.ok(typeof out.id === "string" && out.id.length > 0, `result must carry id; got ${stdoutTrim}`);
  });

  test("usage: bad JSON → exit 2 with human-readable stderr (existing path)", () => {
    const tmpRoot = makeTempRoot();
    const proc = spawnSync("node", [LOOP_BIN, "meta_state_report", "not-json"], {
      env: withEnv({ GATE_ROOT: tmpRoot }),
      encoding: "utf8",
      timeout: 10000,
    });
    assert.strictEqual(proc.status, 2, `bad JSON must exit 2; stderr=${proc.stderr}`);
    assert.ok(
      (proc.stderr ?? "").startsWith("loop.mjs:"),
      `stderr must carry the loop.mjs: prefix; got: ${proc.stderr}`,
    );
  });

  test("ZodError (invalid affected_system enum) → exit 2 with human-readable stderr (existing UsageError path)", () => {
    // Per plan 260722-1343 Phase 2: schema validation failures stay on
    // the exit-2 human-readable path (UsageError). The ZodError message
    // names the failing field so the agent can fix args and retry —
    // structurally similar to recognized rejection (the agent retries by
    // arg-fixing) but the human line is sufficient and matches the
    // existing contract.
    const tmpRoot = makeTempRoot();
    const args = JSON.stringify({
      category: "loop-anti-pattern",
      subtype: "cli-write-exit-enum",
      severity: "warning",
      affected_system: "not-a-real-system",
      description: "Phase 2 exit-code fixture: invalid enum, exercises schema rejection.",
    });
    const proc = spawnSync("node", [LOOP_BIN, "meta_state_report", args], {
      env: withEnv({ GATE_ROOT: tmpRoot }),
      encoding: "utf8",
      timeout: 15000,
    });
    assert.strictEqual(proc.status, 2, `ZodError must exit 2; stderr=${proc.stderr}`);
    assert.ok(
      (proc.stderr ?? "").startsWith("loop.mjs:"),
      `stderr must carry the loop.mjs: prefix; got: ${proc.stderr}`,
    );
  });

  test("recognized rejection: resolve unknown id → exit 0 with structured result (handler returns not_found, does not throw)", () => {
    // meta_state_resolve returns `{ resolved: false, reason: 'not_found', id }`
    // for unknown ids — it does NOT throw. So this case exits 0 and the
    // agent parses the structured result. Locks the "no false exit 1 on
    // not_found" invariant: the handler's structured result is the
    // recovery path; only handler-layer throws → exit 1.
    const tmpRoot = makeTempRoot();
    const args = JSON.stringify({ id: "meta-cli-write-not-found-fixture", resolution: "test-only" });
    const proc = spawnSync("node", [LOOP_BIN, "meta_state_resolve", args], {
      env: withEnv({ GATE_ROOT: tmpRoot }),
      encoding: "utf8",
      timeout: 10000,
    });
    assert.strictEqual(proc.status, 0, `not_found must exit 0; stderr=${proc.stderr}`);
    const out = JSON.parse((proc.stdout ?? "").trim());
    assert.strictEqual(out.resolved, false, `not-found payload must carry resolved: false; got: ${JSON.stringify(out)}`);
    assert.strictEqual(out.reason, "not_found", `not-found payload must carry reason: 'not_found'; got: ${JSON.stringify(out)}`);
  });

  test("identity-pin precondition: missing LOOP_SURFACE → exit 2 (existing path)", () => {
    const tmpRoot = makeTempRoot();
    const env = { ...process.env };
    delete env.LOOP_SURFACE;
    env.GATE_ROOT = tmpRoot;
    env.MASTRA_STORAGE_DRIVER = "memory";
    const proc = spawnSync("node", [LOOP_BIN, "meta_state_report", JSON.stringify({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "meta",
      description: "Phase 2 exit-code fixture: missing LOOP_SURFACE.",
    })], {
      env,
      encoding: "utf8",
      timeout: 10000,
    });
    assert.strictEqual(proc.status, 2, `missing LOOP_SURFACE must exit 2; stderr=${proc.stderr}`);
    assert.ok(
      (proc.stderr ?? "").includes("LOOP_SURFACE"),
      `stderr must name LOOP_SURFACE; got: ${proc.stderr}`,
    );
  });
});
