import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  metaStateFindingEntrySchema,
  TERMINAL_STATUSES,
  readRegistry,
  checkExpiry,
} from "../core/meta-state.js";
import { summarize } from "../core/loop-introspect.js";
import { deriveStatus, META_STATE_RECOMMENDATIONS } from "../core/derive-status.js";
import { runVerification } from "../core/verification-runner.js";
import { metaStateReVerifyTool } from "../tools/meta-state-re-verify-tool.js";
import { metaStateSupersedeTool } from "../tools/meta-state-supersede-tool.js";
import { metaStateReportTool } from "../tools/meta-state-report-tool.js";
import { metaStateAckTool } from "../tools/meta-state-ack-tool.js";
import { metaStateLogChangeTool } from "../tools/meta-state-log-change-tool.js";

describe("stale status schema + behavior (TDD red)", () => {
  const originalEnv = process.env.GATE_ROOT;
  const originalOperator = process.env.OPERATOR_MODE;
  const originalVerifyExec = process.env.META_STATE_VERIFY_EXEC;

  function setup() {
    const tempDir = mkdtempSync(join(tmpdir(), "stale-flag-"));
    process.env.GATE_ROOT = tempDir;
    return tempDir;
  }

  function teardown() {
    process.env.GATE_ROOT = originalEnv;
    process.env.OPERATOR_MODE = originalOperator;
    process.env.META_STATE_VERIFY_EXEC = originalVerifyExec;
  }

  test("T1: schema accepts status=stale and rejects unknown values", () => {
    const valid = metaStateFindingEntrySchema.safeParse({
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "A test finding with stale status for schema validation",
      status: "stale",
    });
    assert.strictEqual(valid.success, true, "stale should be valid");

    const invalid = metaStateFindingEntrySchema.safeParse({
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "A test finding with invalid status for schema validation",
      status: "stale-of-the-century",
    });
    assert.strictEqual(invalid.success, false, "unknown status should be rejected");
  });

  test("T2: schema accepts 4 new optional fields", () => {
    const withFields = metaStateFindingEntrySchema.safeParse({
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "A test finding with new optional fields for schema validation",
      last_verified_at: "2026-06-09T00:00:00Z",
      verification: { steps: [] },
      superseded_at: "2026-06-09T00:00:00Z",
      superseded_by: "operator",
    });
    assert.strictEqual(withFields.success, true, "new optional fields should be valid");

    const withoutFields = metaStateFindingEntrySchema.safeParse({
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "A test finding without new optional fields for schema validation",
    });
    assert.strictEqual(withoutFields.success, true, "missing optional fields should still be valid");
  });

  test("T3: summarize includes last_verified_at when present", () => {
    const result = summarize({
      id: "meta-260601T0000Z-test",
      entry_kind: "finding",
      status: "stale",
      last_verified_at: "2026-06-09T00:00:00Z",
    });
    assert.strictEqual(result.last_verified_at, "2026-06-09T00:00:00Z");
  });

  test("T4: META_STATE_RECOMMENDATIONS includes re_verify", () => {
    assert.ok(META_STATE_RECOMMENDATIONS.includes("re_verify"), "re_verify should be in recommendations");
  });

  test("T5: deriveStatus on stale + mechanism-shipped returns re_verify", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "derive-stale-"));
    writeFileSync(join(tempDir, "src.js"), "// code");
    const entry = {
      id: "meta-260601T0000Z-test",
      entry_kind: "finding",
      status: "stale",
      evidence_code_ref: "src.js",
    };
    const result = deriveStatus(entry, { root: tempDir, now: () => Date.now() });
    assert.strictEqual(result.recommendation, "re_verify");
  });

  test("T6: TERMINAL_STATUSES does NOT include stale", () => {
    assert.strictEqual(TERMINAL_STATUSES.has("stale"), false, "stale must not be terminal");
  });

  test("T7: checkExpiry returns null for stale entries", () => {
    const entry = {
      id: "meta-260601T0000Z-test",
      status: "stale",
      expires_at: new Date(Date.now() - 1000).toISOString(),
    };
    assert.strictEqual(checkExpiry(entry), null, "stale entries should not re-expire");
  });

  test("T8: runVerification rejects cmd not in allowlist", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "verify-runner-"));
    const bad = runVerification(tempDir, { cmd: "rm", args: ["-rf", "/"] });
    assert.strictEqual(bad.status, "failed");
    assert.strictEqual(bad.signal, "cmd_not_allowlisted");

    const good = runVerification(tempDir, { cmd: "echo", args: ["hello"] });
    assert.strictEqual(good.status, "passed");
  });

  test("T9: meta_state_re_verify round-trip", async () => {
    const tempDir = setup();
    process.env.OPERATOR_MODE = "1";
    process.env.META_STATE_VERIFY_EXEC = "1";
    try {
      // Create a finding and ack it, then manually set to stale
      const report = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "A test finding for re_verify round-trip testing",
      });
      const id = JSON.parse(report.content[0].text).id;

      await metaStateAckTool.handler({ id, reason: "ack for test" });

      // Set verification steps and stale status
      await import("../core/meta-state.js").then(({ updateEntry }) =>
        updateEntry(tempDir, id, {
          status: "stale",
          verification: {
            steps: [{ cmd: "echo", args: ["pass"] }],
          },
        })
      );

      // Subtest A: passing step -> active
      const resultA = JSON.parse((await metaStateReVerifyTool.handler({ id })).content[0].text);
      assert.strictEqual(resultA.re_verified, true, "passing step should re_verify to active");
      assert.strictEqual(resultA.status, "active");
      assert.ok(resultA.last_verified_at);

      // Reset to stale for subtest B
      await import("../core/meta-state.js").then(({ updateEntry }) =>
        updateEntry(tempDir, id, {
          status: "stale",
          verification: {
            steps: [{ cmd: "node", args: ["-e", "process.exit(1)"] }],
            history: [],
          },
          last_verified_at: undefined,
        })
      );

      // Subtest B: failing step -> stays stale
      const resultB = JSON.parse((await metaStateReVerifyTool.handler({ id })).content[0].text);
      assert.strictEqual(resultB.re_verified, false, "failing step should keep stale");
      assert.strictEqual(resultB.status, "stale");
      assert.strictEqual(resultB.history_appended, 1);

      // Subtest C: gate off
      process.env.META_STATE_VERIFY_EXEC = "0";
      const resultC = JSON.parse((await metaStateReVerifyTool.handler({ id })).content[0].text);
      assert.strictEqual(resultC.re_verified, false);
      assert.strictEqual(resultC.reason, "verify_exec_required");
    } finally {
      teardown();
    }
  });

  test("T10: meta_state_supersede end-to-end", async () => {
    const tempDir = setup();
    process.env.OPERATOR_MODE = "1";
    try {
      // Create a finding
      const report = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "A test finding for supersede end-to-end testing",
      });
      const findingId = JSON.parse(report.content[0].text).id;

      // Create a change-log entry
      const change = await metaStateLogChangeTool.handler({
        change_dimension: "semantic",
        change_target: "test-target",
        change_diff: { added: ["test"], removed: [], changed: [] },
        reason: "A test change-log entry for supersede validation testing",
      });
      const changeLogId = JSON.parse(change.content[0].text).id;

      // Manually transition the finding to stale (the modern past-TTL state;
      // 'expired' was removed in plan 260611-1000).
      await import("../core/meta-state.js").then(({ updateEntry }) =>
        updateEntry(tempDir, findingId, { status: "stale" })
      );

      // Subtest A: supersede
      const resultA = JSON.parse(
        (await metaStateSupersedeTool.handler({
          id: findingId,
          consolidated_into: changeLogId,
          _expected_version: 1,
        })).content[0].text
      );
      assert.strictEqual(resultA.superseded, true);
      assert.strictEqual(resultA.status, "superseded");
      assert.ok(resultA.superseded_at);
      assert.strictEqual(resultA.superseded_by, "operator");
      assert.strictEqual(resultA.consolidated_into, changeLogId);

      // Subtest B: consolidated_into must be a change-log
      const resultB = JSON.parse(
        (await metaStateSupersedeTool.handler({
          id: findingId,
          consolidated_into: "not-a-change-log-id",
        })).content[0].text
      );
      assert.strictEqual(resultB.superseded, false);
      assert.strictEqual(resultB.reason, "consolidated_into_not_a_change_log");

      // Subtest C: operator gate
      process.env.OPERATOR_MODE = "0";
      const resultC = JSON.parse(
        (await metaStateSupersedeTool.handler({
          id: findingId,
          consolidated_into: changeLogId,
        })).content[0].text
      );
      assert.strictEqual(resultC.superseded, false);
      assert.strictEqual(resultC.reason, "operator_role_required");

      // Subtest D: CAS mismatch
      process.env.OPERATOR_MODE = "1";
      const resultD = JSON.parse(
        (await metaStateSupersedeTool.handler({
          id: findingId,
          consolidated_into: changeLogId,
          _expected_version: 99,
        })).content[0].text
      );
      assert.strictEqual(resultD.superseded, false);
      assert.strictEqual(resultD.reason, "version_mismatch");
    } finally {
      teardown();
    }
  });
});
