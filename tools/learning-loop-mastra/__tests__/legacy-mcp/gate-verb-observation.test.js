// Gate-verb observation window: a `gate-verb:<verb>` runtime-state
// observation must be recordable (write-side enum derived from the same
// patterns.json gate-verb list the read side maps from) and must satisfy
// the bash gate's `gate-verb:<verb>` constraint only within a bounded age
// window (OBSERVATION_STALENESS_WINDOW_MS, 30 min). Older than the window,
// the observation no longer satisfies the constraint — the allowance is
// deliberate, auditable, and time-boxed.

import { describe, test, expect } from "vitest";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PATTERNS = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../core/patterns.json"),
    "utf8",
  ),
);
const GATE_VERBS = (PATTERNS["gate-verbs"] || []).map((entry) =>
  typeof entry === "string" ? entry : entry.verb,
);

function createRuntimeStatePreflight(root) {
  const markerDir = join(root, ".claude", "coordination");
  mkdirSync(markerDir, { recursive: true });
  writeFileSync(
    join(markerDir, ".loop-preflight-runtime-state"),
    JSON.stringify({ completed_at: new Date().toISOString() }),
    "utf8",
  );
}

function withTempRoot(fn) {
  return async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gate-verb-obs-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      createRuntimeStatePreflight(tempDir);
      await fn(tempDir);
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  };
}

describe("gate-verb observation window", () => {
  test(
    "schema accepts every gate-verb:<verb> affected_system from patterns.json",
    async () => {
      const { runtimeStateRecordTool } = await import(
        "../../tools/handlers/runtime-state-record-tool.js"
      );
      assert.ok(GATE_VERBS.length > 0, "patterns.json must define gate-verbs");
      for (const verb of GATE_VERBS) {
        const parsed = runtimeStateRecordTool.schema.affected_system.safeParse(
          `gate-verb:${verb}`,
        );
        assert.strictEqual(
          parsed.success,
          true,
          `schema must accept gate-verb:${verb} (read side maps it from patterns.json; write side must not drift)`,
        );
      }
    },
  );

  test(
    "runtime_state_record accepts gate-verb:bash and it surfaces as an active observation",
    withTempRoot(async (tempDir) => {
      const { runtimeStateRecordTool } = await import(
        "../../tools/handlers/runtime-state-record-tool.js"
      );
      const { readRuntimeObservations } = await import(
        "../../core/file-readers.js"
      );
      const res = await runtimeStateRecordTool.handler({
        affected_system: "gate-verb:bash",
        kind: "budget-state",
        id: "gate-verb:bash",
        value: 0,
        delta: 0,
        source_ref: "local:meta-state:rule-test",
        timestamp: new Date().toISOString(),
      });
      const parsed = JSON.parse(res.content[0].text);
      assert.strictEqual(parsed.ok, true, `record must be accepted: ${res.content[0].text}`);
      const observations = readRuntimeObservations(tempDir);
      const obs = observations.find(
        (o) => o.constraint_type === "gate-verb:bash" && o.status === "active",
      );
      assert.ok(obs, "an active gate-verb:bash observation must surface");
    }),
  );

  test(
    "fresh gate-verb:bash observation satisfies the bash gate constraint",
    withTempRoot(async (tempDir) => {
      const { runtimeStateRecordTool } = await import(
        "../../tools/handlers/runtime-state-record-tool.js"
      );
      const { evaluateBashGate } = await import("../../core/evaluate-bash-gate.js");
      await runtimeStateRecordTool.handler({
        affected_system: "gate-verb:bash",
        kind: "budget-state",
        id: "gate-verb:bash",
        value: 0,
        delta: 0,
        source_ref: "local:meta-state:rule-test",
        timestamp: new Date().toISOString(),
      });
      const result = evaluateBashGate({
        command: "bash tools/scripts/test-one.sh example.test.js",
        root: tempDir,
      });
      assert.strictEqual(
        result.decision,
        "ok",
        `fresh observation must satisfy the constraint: ${JSON.stringify(result)}`,
      );
    }),
  );

  test(
    "gate-verb:bash observation older than the 30-min window does NOT satisfy the constraint",
    withTempRoot(async (tempDir) => {
      const { runtimeStateRecordTool } = await import(
        "../../tools/handlers/runtime-state-record-tool.js"
      );
      const { evaluateBashGate } = await import("../../core/evaluate-bash-gate.js");
      const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await runtimeStateRecordTool.handler({
        affected_system: "gate-verb:bash",
        kind: "budget-state",
        id: "gate-verb:bash",
        value: 0,
        delta: 0,
        source_ref: "local:meta-state:rule-test",
        timestamp: old,
      });
      const result = evaluateBashGate({
        command: "bash tools/scripts/test-one.sh example.test.js",
        root: tempDir,
      });
      assert.notStrictEqual(
        result.decision,
        "ok",
        "a gate-verb observation older than the staleness window must not satisfy the constraint (bounded 30-min allowance)",
      );
    }),
  );
});
