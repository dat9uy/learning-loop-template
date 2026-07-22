// Tests for the runtime-tracking helper: loadPausedSurfaces / isSurfacePaused / setPausedSurfaces.
//
// Behavior contract:
//   - `loadPausedSurfaces(root)` returns `string[]` of paused surface names.
//   - Absent sidecar → `[]` (nothing paused).
//   - Malformed sidecar → THROWS (fail-closed — refuses to silently unpause
//     on corruption; mirrors `core/r2/allowlist-cache.js:39-48`).
//   - `setPausedSurfaces(root, arr)` does atomic temp+rename. The persisted
//     shape is `{schema:"runtime-tracking/v1", version:1, paused_surfaces}`.
//   - Read-from-disk per call (no in-process cache).
//
// Plus: handler-level tests for `runtime_state_pause` / `runtime_state_resume`
// routing through the per-surface preflight marker (same convention as
// `runtime_state_record`, so writes stay gated).

import { describe, test, expect } from "vitest";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  existsSync,
  readFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadPausedSurfaces,
  isSurfacePaused,
  setPausedSurfaces,
} from "../core/runtime-tracking.js";

const SURFACE_ENUM = ["vnstock", "fastapi", "tanstack", "product", "api", "web", "meta-state-tools", "runtime-state"];

function createRuntimeTrackingPreflight(root) {
  const markerDir = join(root, ".claude", "coordination");
  mkdirSync(markerDir, { recursive: true });
  writeFileSync(join(markerDir, ".loop-preflight-runtime-tracking"), "", "utf8");
}

function createRuntimeStatePreflight(root) {
  // The runtime_state_record tool requires `.loop-preflight-runtime-state`
  // (a different marker from pause/resume's `.loop-preflight-runtime-tracking`).
  const markerDir = join(root, ".claude", "coordination");
  mkdirSync(markerDir, { recursive: true });
  writeFileSync(join(markerDir, ".loop-preflight-runtime-state"), "", "utf8");
}

function createBothPreflights(root) {
  createRuntimeTrackingPreflight(root);
  createRuntimeStatePreflight(root);
}

describe("loadPausedSurfaces / isSurfacePaused", () => {
  test("absent sidecar → empty list (nothing paused)", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "rt-absent-"));
    const paused = loadPausedSurfaces(tempDir);
    assert.deepStrictEqual(paused, []);
    assert.strictEqual(isSurfacePaused(tempDir, "vnstock"), false);
  });

  test("malformed sidecar → loadPausedSurfaces THROWS (fail-closed)", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "rt-bad-"));
    const dotloopDir = join(tempDir, ".loop");
    mkdirSync(dotloopDir, { recursive: true });
    writeFileSync(join(dotloopDir, "runtime-tracking.json"), "{ this is not json", "utf8");
    assert.throws(() => loadPausedSurfaces(tempDir), /runtime_tracking_invalid/, "fail-closed must throw");
    // isSurfacePaused wraps loadPausedSurfaces and propagates the throw — writers must refuse, not silently unpause.
    assert.throws(() => isSurfacePaused(tempDir, "vnstock"));
  });

  test("setPausedSurfaces writes v1 shape; isSurfacePaused returns correct boolean per surface", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "rt-write-"));
    setPausedSurfaces(tempDir, ["vnstock"]);
    // Sidecar shape
    const raw = JSON.parse(readFileSync(join(tempDir, ".loop", "runtime-tracking.json"), "utf8"));
    assert.strictEqual(raw.schema, "runtime-tracking/v1");
    assert.strictEqual(raw.version, 1);
    assert.deepStrictEqual(raw.paused_surfaces, ["vnstock"]);
    // isSurfacePaused
    assert.strictEqual(isSurfacePaused(tempDir, "vnstock"), true);
    assert.strictEqual(isSurfacePaused(tempDir, "meta-state-tools"), false);
  });

  test("setPausedSurfaces deduplicates + sorts on write (stable canonical form)", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "rt-dedup-"));
    setPausedSurfaces(tempDir, ["z-meta", "vnstock", "vnstock", "a-fastapi"]);
    const raw = JSON.parse(readFileSync(join(tempDir, ".loop", "runtime-tracking.json"), "utf8"));
    assert.deepStrictEqual(raw.paused_surfaces, ["a-fastapi", "vnstock", "z-meta"]);
    assert.strictEqual(isSurfacePaused(tempDir, "vnstock"), true);
  });

  test("setPausedSurfaces is atomic — temp file is not left behind on success", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "rt-atomic-"));
    setPausedSurfaces(tempDir, ["vnstock"]);
    // List .loop/ to verify only runtime-tracking.json remains (no .tmp-* residue).
    const files = require("node:fs").readdirSync(join(tempDir, ".loop"));
    assert.deepStrictEqual(
      files.filter((f) => /\.tmp/.test(f)),
      [],
      "no temp file may remain after setPausedSurfaces",
    );
  });

  test("loadPausedSurfaces is read-from-disk per call (no in-process cache)", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "rt-nocache-"));
    // First read: nothing paused.
    assert.deepStrictEqual(loadPausedSurfaces(tempDir), []);
    // Mutate disk WITHOUT going through setPausedSurfaces (simulate operator edit).
    const dotloopDir = join(tempDir, ".loop");
    mkdirSync(dotloopDir, { recursive: true });
    writeFileSync(
      join(dotloopDir, "runtime-tracking.json"),
      JSON.stringify({ schema: "runtime-tracking/v1", version: 1, paused_surfaces: ["vnstock"] }),
      "utf8",
    );
    // Second read sees the new state WITHOUT any cache invalidation step.
    assert.deepStrictEqual(loadPausedSurfaces(tempDir), ["vnstock"]);
  });

  test("expected legacy schema-version → error", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "rt-wrong-schema-"));
    const dotloopDir = join(tempDir, ".loop");
    mkdirSync(dotloopDir, { recursive: true });
    writeFileSync(
      join(dotloopDir, "runtime-tracking.json"),
      JSON.stringify({ schema: "runtime-tracking/v999", version: 1, paused_surfaces: [] }),
      "utf8",
    );
    assert.throws(() => loadPausedSurfaces(tempDir), /runtime_tracking_invalid_schema/);
  });
});

describe("runtime_state_pause / runtime_state_resume handlers", () => {
  test("pause adds surface to paused_surfaces; resume removes it", async () => {
    const { runtimeStatePauseTool } = await import("../tools/handlers/runtime-state-pause-tool.js");
    const { runtimeStateResumeTool } = await import("../tools/handlers/runtime-state-resume-tool.js");

    const tempDir = mkdtempSync(join(tmpdir(), "rt-pause-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      createRuntimeTrackingPreflight(tempDir);

      const pauseRes = await runtimeStatePauseTool.handler({ surface: "vnstock" });
      const pauseParsed = JSON.parse(pauseRes.content[0].text);
      assert.strictEqual(pauseParsed.ok, true);
      assert.deepStrictEqual(pauseParsed.paused_surfaces, ["vnstock"]);

      const resumeRes = await runtimeStateResumeTool.handler({ surface: "vnstock" });
      const resumeParsed = JSON.parse(resumeRes.content[0].text);
      assert.strictEqual(resumeParsed.ok, true);
      assert.deepStrictEqual(resumeParsed.paused_surfaces, []);
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("pause rejects unknown surface (not in the runtime-state enum) — schema-level", async () => {
    // Surface must match the runtime-state `affected_system` enum, not the
    // superset in core/meta-state.js. `vnstock_vendor` is meta-state-only;
    // passing it to the pause tool must fail at the Zod schema level
    // (matches `runtime-state-record-tool`'s `source_ref` rejection precedent).
    const { runtimeStatePauseTool } = await import("../tools/handlers/runtime-state-pause-tool.js");
    const surfaceParse = runtimeStatePauseTool.schema.surface.safeParse("vnstock_vendor");
    assert.strictEqual(surfaceParse.success, false, "schema must reject meta-state-only surfaces");
  });

  test("pause without preflight marker returns preflight_required", async () => {
    const { runtimeStatePauseTool } = await import("../tools/handlers/runtime-state-pause-tool.js");
    const tempDir = mkdtempSync(join(tmpdir(), "rt-pause-nopreflight-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      const res = await runtimeStatePauseTool.handler({ surface: "vnstock" });
      const parsed = JSON.parse(res.content[0].text);
      assert.strictEqual(parsed.error, "preflight_required");
      // No sidecar should be written.
      assert.strictEqual(existsSync(join(tempDir, ".loop", "runtime-tracking.json")), false);
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("runtime_state_record refuses a paused surface (writes no row, fails closed)", async () => {
    const { setPausedSurfaces } = await import("../core/runtime-tracking.js");
    const { runtimeStateRecordTool } = await import("../tools/handlers/runtime-state-record-tool.js");
    const { readRuntimeStateRows } = await import("../core/runtime-state.js");

    const tempDir = mkdtempSync(join(tmpdir(), "rt-record-paused-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      createBothPreflights(tempDir);
      setPausedSurfaces(tempDir, ["vnstock"]);

      const res = await runtimeStateRecordTool.handler({
        affected_system: "vnstock",
        kind: "ledger-event",
        id: "vnstock-paused-1",
        value: 0,
        delta: 0,
        source_ref: "local:meta-state:rule-test",
        timestamp: "2026-05-08T10:17:23Z",
      });
      const parsed = JSON.parse(res.content[0].text);
      assert.strictEqual(parsed.ok, false);
      assert.strictEqual(parsed.paused, true);
      assert.strictEqual(parsed.affected_system, "vnstock");
      // No row should be appended to the sidecar.
      const rows = readRuntimeStateRows(tempDir);
      assert.strictEqual(rows.length, 0, "paused surface must produce zero rows");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("unpaused surface still records normally when another surface is paused", async () => {
    const { setPausedSurfaces } = await import("../core/runtime-tracking.js");
    const { runtimeStateRecordTool } = await import("../tools/handlers/runtime-state-record-tool.js");
    const tempDir = mkdtempSync(join(tmpdir(), "rt-record-mixed-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      createBothPreflights(tempDir);
      setPausedSurfaces(tempDir, ["vnstock"]);

      const res = await runtimeStateRecordTool.handler({
        affected_system: "meta-state-tools",
        kind: "ledger-event",
        id: "unpaused-1",
        value: 0,
        delta: 0,
        source_ref: "local:meta-state:rule-test",
        timestamp: "2026-05-08T10:17:23Z",
      });
      const parsed = JSON.parse(res.content[0].text);
      assert.strictEqual(parsed.ok, true);
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("malformed sidecar makes runtime_state_record refuse (fail-closed, not silent unpause)", async () => {
    const { runtimeStateRecordTool } = await import("../tools/handlers/runtime-state-record-tool.js");
    const tempDir = mkdtempSync(join(tmpdir(), "rt-record-malformed-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      createBothPreflights(tempDir);
      // Hand-write a malformed sidecar (operator's editor corrupted it).
      mkdirSync(join(tempDir, ".loop"), { recursive: true });
      writeFileSync(join(tempDir, ".loop", "runtime-tracking.json"), "{ corrupt", "utf8");

      let threwOrRefused = false;
      try {
        const res = await runtimeStateRecordTool.handler({
          affected_system: "vnstock",
          kind: "ledger-event",
          id: "vnstock-malformed-1",
          value: 0,
          delta: 0,
          source_ref: "local:meta-state:rule-test",
          timestamp: "2026-05-08T10:17:23Z",
        });
        const parsed = JSON.parse(res.content[0].text);
        // A malformed sidecar must NOT return ok:true. Either it errors out
        // before reading or it returns ok:false with a corruption reason.
        if (parsed.ok !== true) threwOrRefused = true;
      } catch (err) {
        // Acceptable: writer throws when the helper propagates the load error.
        assert.match(String(err.message || err), /runtime_tracking_invalid/);
        threwOrRefused = true;
      }
      assert.ok(threwOrRefused, "malformed sidecar must refuse or throw — never silently unpause");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("meta_state_dispatch_finding honors meta-state-tools pause at BOTH stages", () => {
  test("prepare stage returns surface_paused when meta-state-tools is paused (no issue body drafted)", async () => {
    const { setPausedSurfaces } = await import("../core/runtime-tracking.js");
    const { runtimeStateRecordTool } = await import("../tools/handlers/runtime-state-record-tool.js");
    const { metaStateDispatchFindingTool } = await import("../tools/handlers/meta-state-dispatch-finding-tool.js");

    const tempDir = mkdtempSync(join(tmpdir(), "rt-dispatch-prepare-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      // The pause check fires at the TOP of the handler (before stage
      // dispatch), so we don't need a real finding id — the handler
      // short-circuits before reading the registry.
      setPausedSurfaces(tempDir, ["meta-state-tools"]);

      const res = await metaStateDispatchFindingTool.handler({
        id: "meta-260722T0006Z-runtime-state-jsonl-has-two-coupled-maintenance-gaps-that-le",
        stage: "prepare",
      });
      const parsed = JSON.parse(res.content[0].text);
      assert.strictEqual(parsed.dispatched, false);
      assert.strictEqual(parsed.reason, "surface_paused");
      assert.strictEqual(parsed.affected_system, "meta-state-tools");
      assert.strictEqual(parsed.stage, "prepare");
      // Critical: no issue body was drafted.
      assert.strictEqual(parsed.issue_title, undefined, "prepare must NOT draft an issue body");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("commit stage returns surface_paused when meta-state-tools is paused", async () => {
    const { setPausedSurfaces } = await import("../core/runtime-tracking.js");
    const { metaStateDispatchFindingTool } = await import("../tools/handlers/meta-state-dispatch-finding-tool.js");
    const tempDir = mkdtempSync(join(tmpdir(), "rt-dispatch-commit-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      setPausedSurfaces(tempDir, ["meta-state-tools"]);
      const res = await metaStateDispatchFindingTool.handler({
        id: "meta-260722T0006Z-runtime-state-jsonl-has-two-coupled-maintenance-gaps-that-le",
        stage: "commit",
        issue_number: 1,
        issue_url: "https://example.com/x",
      });
      const parsed = JSON.parse(res.content[0].text);
      assert.strictEqual(parsed.dispatched, false);
      assert.strictEqual(parsed.reason, "surface_paused");
      assert.strictEqual(parsed.stage, "commit");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("3-layer write protection for .loop/runtime-tracking.json", () => {
  test("direct Write-tool to .loop/runtime-tracking.json is blocked by BOUND_ARTIFACTS", async () => {
    const { evaluateWriteGate } = await import("../core/evaluate-write-gate.js");
    const decision = await evaluateWriteGate({ filePath: ".loop/runtime-tracking.json" });
    assert.strictEqual(decision.decision, "block", "Write-tool gate must block writes to the runtime-tracking sidecar");
    assert.match(
      String(decision.matched_rule ?? ""),
      /runtime-tracking\.json/,
      "the block reason must name the sidecar",
    );
  });

  test("bash echo/tee redirect to .loop/runtime-tracking.json is blocked", async () => {
    const { evaluateBashGate } = await import("../core/evaluate-bash-gate.js");
    // echo form
    const echo = evaluateBashGate({ command: `echo '{}' > .loop/runtime-tracking.json` });
    assert.strictEqual(echo.decision, "block");
    assert.strictEqual(echo.hard_block, true);
    // tee form
    const tee = evaluateBashGate({ command: `echo '{}' | tee .loop/runtime-tracking.json` });
    assert.strictEqual(tee.decision, "block");
    assert.strictEqual(tee.hard_block, true);
  });

  test("BOOTSTRAP_DENY_PATTERNS in ownership.js hard-blocks R2 ownership claim", () => {
    const { checkR2Ownership, BOOTSTRAP_DENY_PATTERNS } = require("../core/r2/ownership.js");
    assert.ok(
      BOOTSTRAP_DENY_PATTERNS.includes(".loop/runtime-tracking.json"),
      "the sidecar must be in BOOTSTRAP_DENY_PATTERNS (the actual precedent layer)",
    );
    const result = checkR2Ownership({
      runtime: "claude-code",
      path: ".loop/runtime-tracking.json",
      allowlist: {
        "claude-code": { own: ["**"], deny: [] },
        universal: [],
      },
      root: "/tmp/fake",
    });
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, "bootstrap_deny");
  });
});
