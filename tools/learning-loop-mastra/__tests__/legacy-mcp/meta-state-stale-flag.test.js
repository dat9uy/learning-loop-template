import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  metaStateFindingEntrySchema,
  TERMINAL_STATUSES,
  readRegistry,
} from "../../core/meta-state.js";
import { summarize } from "../../core/loop-introspect.js";
import { deriveStatus, META_STATE_RECOMMENDATIONS } from "../../core/derive-status.js";
import { runVerification } from "../../core/verification-runner.js";
import { metaStateReVerifyTool } from "../../tools/handlers/meta-state-re-verify-tool.js";
import { metaStateSupersedeTool } from "../../tools/handlers/meta-state-supersede-tool.js";
import { metaStateReportTool } from "../../tools/handlers/meta-state-report-tool.js";
import { metaStateLogChangeTool } from "../../tools/handlers/meta-state-log-change-tool.js";

describe("stale status schema + behavior (TDD red)", () => {
  const originalEnv = process.env.GATE_ROOT;
  const originalLoopSessionMode = process.env.LOOP_SESSION_MODE;
  const originalVerifyExec = process.env.META_STATE_VERIFY_EXEC;

  function setup() {
    const tempDir = mkdtempSync(join(tmpdir(), "stale-flag-"));
    process.env.GATE_ROOT = tempDir;
    return tempDir;
  }

  function teardown() {
    if (originalEnv === undefined) {
      delete process.env.GATE_ROOT;
    } else {
      process.env.GATE_ROOT = originalEnv;
    }
    process.env.LOOP_SESSION_MODE = originalLoopSessionMode;
    process.env.META_STATE_VERIFY_EXEC = originalVerifyExec;
  }

  test("T1: schema accepts status=open and rejects legacy/unknown values", () => {
    // Plan 260707-0812 Phase 2: enum collapsed to {open, resolved, superseded}.
    const valid = metaStateFindingEntrySchema.safeParse({
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "A test finding with open status for schema validation",
      status: "open",
    });
    assert.strictEqual(valid.success, true, "open should be valid");

    const invalid = metaStateFindingEntrySchema.safeParse({
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "A test finding with invalid status for schema validation",
      status: "stale-of-the-century",
    });
    assert.strictEqual(invalid.success, false, "unknown status should be rejected");

    // Legacy statuses (stale, active, reported, auto-resolved) are now rejected.
    for (const legacy of ["stale", "active", "reported", "auto-resolved"]) {
      const r = metaStateFindingEntrySchema.safeParse({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: `A test finding with legacy ${legacy} status for schema validation`,
        status: legacy,
      });
      assert.strictEqual(r.success, false, `legacy ${legacy} status should be rejected`);
    }
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
      status: "open",
      last_verified_at: "2026-06-09T00:00:00Z",
    });
    assert.strictEqual(result.last_verified_at, "2026-06-09T00:00:00Z");
  });

  test("T4: META_STATE_RECOMMENDATIONS includes re_verify", () => {
    assert.ok(META_STATE_RECOMMENDATIONS.includes("re_verify"), "re_verify should be in recommendations");
  });

  test("T5: deriveStatus on stale-view (open + aged) + code-only returns investigate", () => {
    // `stale` is no longer a status — it's a derived view from age + drift.
    // With the corrected contract (no positive test_passed signal), this
    // entry is code-only (active-uncertain) and recommends investigate
    // rather than the old re_verify.
    const tempDir = mkdtempSync(join(tmpdir(), "derive-stale-"));
    writeFileSync(join(tempDir, "src.js"), "// code");
    const OLD = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const entry = {
      id: "meta-260601T0000Z-test",
      entry_kind: "finding",
      status: "open",
      created_at: OLD,
      evidence_code_ref: "src.js",
    };
    const result = deriveStatus(entry, { root: tempDir, now: () => Date.now() });
    assert.strictEqual(result.recommendation, "investigate");
  });

  test("T6: TERMINAL_STATUSES does NOT include stale", () => {
    assert.strictEqual(TERMINAL_STATUSES.has("stale"), false, "stale must not be terminal");
  });

  test("T7: runVerification rejects cmd not in allowlist", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "verify-runner-"));
    const bad = runVerification(tempDir, { cmd: "rm", args: ["-rf", "/"] });
    assert.strictEqual(bad.status, "failed");
    assert.strictEqual(bad.signal, "cmd_not_allowlisted");

    const good = runVerification(tempDir, { cmd: "echo", args: ["hello"] });
    assert.strictEqual(good.status, "passed");
  });

  test("T8: meta_state_re_verify round-trip (Phase 3: stamps last_verified_at, finding stays open)", async () => {
    const tempDir = setup();
    process.env.LOOP_SESSION_MODE = "live";
    process.env.META_STATE_VERIFY_EXEC = "1";
    try {
      // Create a finding. Plan 260707-0812 Phase 3: ack is gone; report writes
      // status:"open" directly. re_verify accepts isOpen findings (no stale
      // hard-requirement). Set verification steps + backdate created_at so
      // the entry is in the derived stale view (triggers re_verify's relevance).
      const report = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "A test finding for re_verify round-trip testing",
      });
      const id = JSON.parse(report.content[0].text).id;

      const OLD = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      await import("../../core/meta-state.js").then(({ updateEntry }) =>
        updateEntry(tempDir, id, {
          created_at: OLD,
          verification: {
            steps: [{ cmd: "echo", args: ["pass"] }],
          },
        })
      );

      // Subtest A: passing step -> re_verified=true, finding stays open,
      // last_verified_at stamped (no status transition; Phase 3 change).
      const resultA = JSON.parse((await metaStateReVerifyTool.handler({ id })).content[0].text);
      assert.strictEqual(resultA.re_verified, true, "passing step should re_verify");
      assert.strictEqual(resultA.status, "open", "finding stays open (no transition)");
      assert.ok(resultA.last_verified_at, "passing run stamps last_verified_at");

      // Subtest B: failing step -> re_verified=false, history appended.
      await import("../../core/meta-state.js").then(({ updateEntry }) =>
        updateEntry(tempDir, id, {
          verification: {
            steps: [{ cmd: "node", args: ["-e", "process.exit(1)"] }],
            history: [],
          },
          last_verified_at: undefined,
        })
      );
      const resultB = JSON.parse((await metaStateReVerifyTool.handler({ id })).content[0].text);
      assert.strictEqual(resultB.re_verified, false, "failing step should not re_verify");
      assert.strictEqual(resultB.status, "open", "finding still stays open on fail");
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

  test("T9: meta_state_supersede end-to-end", async () => {
    const tempDir = setup();
    process.env.LOOP_SESSION_MODE = "live";
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

      // Post-migration (plan 260707-0812): `stale` is no longer a persisted
      // status — it is a derived evidence-freshness view, so there is no
      // `stale → superseded` transition to test. `meta_state_supersede` accepts
      // any `isOpen` finding, so superseding the freshly-reported `open` finding
      // is the canonical post-migration path this test exercises.

      // Subtest A: supersede. `_expected_version` is omitted so supersede
      // defaults it to the finding's current version (CAS auto-passes); the
      // explicit CAS-mismatch case is covered by Subtest D below.
      const resultA = JSON.parse(
        (await metaStateSupersedeTool.handler({
          id: findingId,
          consolidated_into: changeLogId,
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
      process.env.LOOP_SESSION_MODE = "autonomous";
      const resultC = JSON.parse(
        (await metaStateSupersedeTool.handler({
          id: findingId,
          consolidated_into: changeLogId,
        })).content[0].text
      );
      assert.strictEqual(resultC.superseded, false);
      assert.strictEqual(resultC.reason, "live_session_required");

      // Subtest D: CAS mismatch
      process.env.LOOP_SESSION_MODE = "live";
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
