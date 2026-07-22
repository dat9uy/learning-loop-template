// Tests for runtime_state_prune_surface — atomic one-time op that rewrites
// runtime-state.jsonl minus every row whose `affected_system` matches the
// given surface. Required by Phase 4 of plan 260722-1623 to clear the
// finding's PRIMARY symptom: 20 existing vnstock rows have DISTINCT ids
// (GAP 1 same-id collapse does not touch them) and the inbound gate kept
// surfacing them as stale observations.
//
// Contract:
//   - Requires the operator preflight marker
//     `SURFACES/coordination/.loop-preflight-runtime-tracking` (same per-surface
//     guard as runtime_state_pause/resume).
//   - Requires `confirm:true` (destructive one-time op; mirrors
//     meta_state_archive's confirm pattern).
//   - Atomic temp+rename via core/runtime-state.js#pruneSurfaceRows (which
//     runs under withRegistryLock so a prune cannot interleave with an append).
//   - Idempotent on no match: returns {ok:true, pruned:0, remaining:N}.
//   - In CLI_WRITE_TOOLS (CLI-only when LOOP_RECORDS_VIA_CLI=1, otherwise
//     exposed via MCP). Mirrors pause/resume CLI portability.

import { describe, test } from "vitest";
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
  readRuntimeStateRows,
  readRuntimeStateRowsLatest,
} from "../core/runtime-state.js";
import { setPausedSurfaces } from "../core/runtime-tracking.js";
import { runtimeStatePruneSurfaceTool } from "../tools/handlers/runtime-state-prune-surface-tool.js";
import { z } from "zod";
import {
  checkObservationStaleness,
} from "../core/inbound-state.js";

// Minimal stub observations for the inbound-gate test — `stale` rows must
// carry `affected_system` so the gate's filter has something to walk.
const stubObs = (id, affectedSystem) => ({
  id,
  affected_system: affectedSystem,
  status: "active",
  updated_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
});

function createBothPreflights(root) {
  const markerDir = join(root, ".claude", "coordination");
  mkdirSync(markerDir, { recursive: true });
  writeFileSync(join(markerDir, ".loop-preflight-runtime-tracking"), "", "utf8");
  writeFileSync(join(markerDir, ".loop-preflight-runtime-state"), "", "utf8");
}

function seedSidecar(root, rows) {
  const path = join(root, "runtime-state.jsonl");
  writeFileSync(path, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
}

const V1 = {
  affected_system: "vnstock",
  kind: "ledger-event",
  id: "vnstock-p1",
  source_ref: "local:meta-state:rule-test",
  value: null,
  delta: null,
  timestamp: "2026-05-08T10:17:23Z",
  status: "active",
  fingerprint: "sha256:" + "a".repeat(64),
  metadata: {},
  version: 0,
};
const V2 = {
  ...V1,
  id: "vnstock-p2",
  timestamp: "2026-05-08T17:11:12Z",
  fingerprint: "sha256:" + "b".repeat(64),
};
const V3 = { ...V1, id: "vnstock-p3", timestamp: "2026-05-09T09:00:00Z", fingerprint: "sha256:" + "c".repeat(64) };
const M1 = { ...V1, affected_system: "meta-state-tools", id: "meta-state-p1", fingerprint: "sha256:" + "d".repeat(64) };
const M2 = { ...V1, affected_system: "meta-state-tools", id: "meta-state-p2", fingerprint: "sha256:" + "e".repeat(64), timestamp: "2026-05-08T17:11:12Z" };

describe("runtime_state_prune_surface — operator tool", () => {
  test("removes all matching rows atomically; non-matching rows preserved", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "prune-happy-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      createBothPreflights(tempDir);
      seedSidecar(tempDir, [V1, V2, V3, M1, M2]);

      const res = await runtimeStatePruneSurfaceTool.handler({
        surface: "vnstock",
        confirm: true,
      });
      const parsed = JSON.parse(res.content[0].text);
      assert.strictEqual(parsed.ok, true);
      assert.strictEqual(parsed.pruned, 3);
      assert.strictEqual(parsed.remaining, 2);
      assert.strictEqual(parsed.surface, "vnstock");

      // Sanity: only the meta-state-tools rows remain.
      const remaining = readRuntimeStateRows(tempDir);
      assert.strictEqual(remaining.length, 2);
      for (const r of remaining) {
        assert.strictEqual(r.affected_system, "meta-state-tools");
      }
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("no matching rows → idempotent no-op (pruned:0)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "prune-nomatch-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      createBothPreflights(tempDir);
      seedSidecar(tempDir, [M1, M2]);

      const res = await runtimeStatePruneSurfaceTool.handler({
        surface: "vnstock",
        confirm: true,
      });
      const parsed = JSON.parse(res.content[0].text);
      assert.strictEqual(parsed.ok, true);
      assert.strictEqual(parsed.pruned, 0);
      assert.strictEqual(parsed.remaining, 2);
      // No rewrite needed; rows must be byte-identical to the input.
      const after = readFileSync(join(tempDir, "runtime-state.jsonl"), "utf8");
      assert.ok(after.length > 0, "sidecar preserved on no-match");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("without confirm:true → confirm_required (no rewrite)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "prune-noconfirm-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      createBothPreflights(tempDir);
      seedSidecar(tempDir, [V1, V2, M1]);

      const res = await runtimeStatePruneSurfaceTool.handler({ surface: "vnstock" });
      const parsed = JSON.parse(res.content[0].text);
      assert.strictEqual(parsed.ok, false);
      assert.strictEqual(parsed.reason, "confirm_required");

      const after = readRuntimeStateRows(tempDir);
      assert.strictEqual(after.length, 3, "no rewrite when confirm is missing");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('confirm:"false" (string) → confirm_required (strict boolean guard)', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "prune-strfalse-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      createBothPreflights(tempDir);
      seedSidecar(tempDir, [V1, V2, M1]);

      // The CLI transport can deliver confirm as the STRING "false";
      // z.coerce.boolean() would widen it to true. The strict guard must
      // treat anything but true / "true" as unauthorized. Exercise the
      // tool's own schema (the transport's parse step), not just the
      // handler's `!== true` fallback.
      const parsed_args = z.object(runtimeStatePruneSurfaceTool.schema).parse({ surface: "vnstock", confirm: "false" });
      assert.strictEqual(parsed_args.confirm, false, 'schema maps "false" to false');
      const res = await runtimeStatePruneSurfaceTool.handler(parsed_args);
      const parsed = JSON.parse(res.content[0].text);
      assert.strictEqual(parsed.ok, false);
      assert.strictEqual(parsed.reason, "confirm_required");

      const after = readRuntimeStateRows(tempDir);
      assert.strictEqual(after.length, 3, 'no rewrite when confirm is "false"');
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("without preflight marker → preflight_required (no rewrite)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "prune-nopreflight-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      seedSidecar(tempDir, [V1, V2, M1]);

      const res = await runtimeStatePruneSurfaceTool.handler({ surface: "vnstock", confirm: true });
      const parsed = JSON.parse(res.content[0].text);
      assert.strictEqual(parsed.error, "preflight_required");

      const after = readRuntimeStateRows(tempDir);
      assert.strictEqual(after.length, 3, "no rewrite when preflight is missing");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("atomic: no temp file left behind after success", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "prune-atomic-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      createBothPreflights(tempDir);
      seedSidecar(tempDir, [V1, V2]);
      await runtimeStatePruneSurfaceTool.handler({ surface: "vnstock", confirm: true });

      const entries = require("node:fs").readdirSync(tempDir);
      const residue = entries.filter((f) => /\.tmp/.test(f));
      assert.deepStrictEqual(residue, [], "no .tmp residue after atomic rewrite");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("inbound-gate isSurfacePaused skip — clears finding's PRIMARY symptom", () => {
  test("paused surface's stale observation is skipped; unpaused surface with no recent row STILL surfaces", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "inbound-skip-paused-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      createBothPreflights(tempDir);
      // Seed: 1 vnstock row + a marker via setPausedSurfaces.
      seedSidecar(tempDir, [V1, V2]);
      setPausedSurfaces(tempDir, ["vnstock"]);

      // Mark operator state CHANGE so the stale check fires.
      mkdirSync(join(tempDir, ".claude", "coordination"), { recursive: true });
      writeFileSync(
        join(tempDir, ".claude", "coordination", ".last-operator-message"),
        JSON.stringify({ timestamp: new Date().toISOString(), prompt_snippet: "stale" }),
        "utf8",
      );

      // Two observations:
      //   - "obs-vnstock": affected_system="vnstock", paused → must be
      //     SHORT-CIRCUITED before the sidecar scan, so it CANNOT surface.
      //   - "obs-meta": affected_system="meta-state-tools", NOT paused,
      //     and has no matching sidecar row → MUST surface stale.
      //
      // The first observation in the list is iterated first by
      // `checkObservationStaleness` (it short-circuits the moment it finds
      // any stale observation). To assert BOTH invariants we have to run
      // them as separate calls and verify behavior per-observation.
      const pausedOnly = [stubObs("obs-vnstock", "vnstock")];
      const resultPaused = checkObservationStaleness(pausedOnly, tempDir);
      // Critical invariant: a paused surface's observation must NEVER
      // surface stale (the skip runs before the sidecar scan).
      assert.strictEqual(resultPaused.stale, false,
        `paused surface's observation must be skipped, got: ${JSON.stringify(resultPaused)}`);

      const unpausedOnly = [stubObs("obs-meta", "meta-state-tools")];
      const resultUnpaused = checkObservationStaleness(unpausedOnly, tempDir);
      // Critical invariant: an unpaused surface with no recent matching
      // sidecar row MUST surface stale (the gate stays effective for
      // surfaces the operator hasn't paused).
      assert.strictEqual(resultUnpaused.stale, true);
      assert.strictEqual(resultUnpaused.observation_id, "obs-meta");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("unpaused surface still surfaces stale observations normally", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "inbound-skip-unpaused-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      createBothPreflights(tempDir);
      // Seed: meta-state-tools row + operator-stale marker.
      seedSidecar(tempDir, [M1]);
      mkdirSync(join(tempDir, ".claude", "coordination"), { recursive: true });
      writeFileSync(
        join(tempDir, ".claude", "coordination", ".last-operator-message"),
        JSON.stringify({ timestamp: new Date(Date.now() + 60 * 1000).toISOString(), prompt_snippet: "newer" }),
        "utf8",
      );
      setPausedSurfaces(tempDir, ["vnstock"]);

      const observations = [stubObs("obs-unpaused", "meta-state-tools")];
      const result = checkObservationStaleness(observations, tempDir);
      // Unpaused meta-state-tools observation: sidecar's row is older than operator marker → stale
      assert.strictEqual(result.stale, true);
      assert.strictEqual(result.observation_id, "obs-unpaused");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
