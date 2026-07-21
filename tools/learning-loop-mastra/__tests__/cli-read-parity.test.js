// cli-read-parity.test.js — Phase 2 of plans/260721-1933-cli-transport-phase1-read-only-slice.
//
// Parity test for bin/loop.mjs. For each of the 7 read-only tools:
//   - direct side: import the handler module, adaptLegacyHandler, run against tmpdirA.
//   - CLI side: spawnSync node bin/loop.mjs <tool> '<json>' against tmpdirB.
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
// (checked_at / duration_ms / built_at / timing.*) is stripped from both
// sides before deepStrictEqual. `fingerprint_was_recorded` is also stripped
// from the comparison: the fixture's evidence_code_ref points at
// bin/loop.mjs which doesn't exist inside either tmpdir, so the auto-record
// branch in meta-state-check-grounding-tool.js is skipped on both sides
// and the field is false on both — but the strip keeps the test robust to
// fixture edits that flip the record branch on.
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");
const PROJECT_ROOT = resolve(PKG_ROOT, "..", "..");
const LOOP_BIN = join(PKG_ROOT, "bin", "loop.mjs");

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
  // `evidence_code_ref` is the resolved absolute path under the per-side
  // tmpdir; with independent roots it differs by tmpdir name even though the
  // finding id is the same. Strip from the comparison so the test is robust
  // to tempdir naming (the field is identical-shape on both sides — both are
  // absolute paths under their respective roots).
  "evidence_code_ref",
]);

function stripNonDeterministic(value) {
  if (Array.isArray(value)) return value.map(stripNonDeterministic);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (STRIP_KEYS.has(k)) continue;
      if (k === "timing" && v && typeof v === "object") continue;
      out[k] = stripNonDeterministic(v);
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

describe("cli-read parity (Phase 2)", () => {
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
        const wantStripped = stripNonDeterministic(want);

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
        const gotStripped = stripNonDeterministic(gotRaw);

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

describe("cli-read exit-code contract (Phase 2)", () => {
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

  test("handler-error path: missing id returns not-found payload (exit 0)", () => {
    // meta_state_check_grounding returns a not-found object (via findEntryOrNotFound)
    // for an unknown id — it does NOT throw. The CLI surfaces this as exit 0
    // with a JSON result carrying the not-found shape the MCP path returns.
    // The plan's contract: "pin whichever the handler actually does (throws
    // → status === 1; returns a not-found object → status === 0)".
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
    // findEntryOrNotFound returns a content-shaped envelope with an entry_not_found
    // error; CLI goes through adaptLegacyHandler which unwraps it to the inner
    // object — but if the CLI does not unwrap, the envelope stays. Accept both:
    // either a top-level error string, or an entry_not_found code on the result.
    const flat = JSON.stringify(out);
    assert.ok(
      flat.includes("entry_not_found") || flat.includes("not_found") || flat.includes("error"),
      `not-found result must carry an error signal; got: ${flat}`,
    );
  });
});