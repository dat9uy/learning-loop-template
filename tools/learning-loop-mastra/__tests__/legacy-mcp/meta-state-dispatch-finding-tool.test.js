// Tests for plan 260704-0301-stale-findings-dispatch-handle Phase 2:
// meta_state_dispatch_finding (prepare + commit, idempotent, orthogonal-gated).
//
// Coverage:
//   1. prepare builds body + no ledger row, no ledger_ref change
//   2. commit writes ledger + patches ledger_ref (CAS)
//   3. idempotency: re-prepare returns existing coords (no re-prepare body)
//   4. idempotency: re-commit same coords no-op
//   5. idempotency: commit with different coords refused
//   6. non-operator commit refused (operator_role_required)
//   7. P2 F6 — orthogonal-gate tests:
//      (a) with-preflight + WITHOUT OPERATOR_MODE → refused
//      (b) without-preflight + WITH OPERATOR_MODE → succeeds (dispatch bypasses preflight)
//   8. P2 F7 — concurrent-dispatch test (Promise.all) — CAS safety
//   9. orphan self-heal: re-invoking commit with same coords patches missing ledger_ref

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, unlinkSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateDispatchFindingTool } from "../../tools/legacy/meta-state-dispatch-finding-tool.js";
import { metaStateReportTool } from "../../tools/legacy/meta-state-report-tool.js";
import { readRegistry } from "../../core/meta-state.js";
import { SURFACES } from "../../core/surfaces.js";

describe("meta_state_dispatch_finding", () => {
  const originalEnv = process.env.GATE_ROOT;
  const originalOperator = process.env.OPERATOR_MODE;

  function setupTempRegistry() {
    const tempDir = mkdtempSync(join(tmpdir(), "meta-dispatch-"));
    process.env.GATE_ROOT = tempDir;
    return tempDir;
  }

  function setPreflightMarker(tempDir) {
    // Mimic what gate_mark_preflight would write for the runtime-state surface.
    for (const surface of SURFACES) {
      const dir = join(tempDir, surface, "coordination");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, ".loop-preflight-runtime-state"), "");
    }
  }

  function clearPreflightMarker(tempDir) {
    for (const surface of SURFACES) {
      const path = join(tempDir, surface, "coordination", ".loop-preflight-runtime-state");
      if (existsSync(path)) {
        try { unlinkSync(path); } catch {}
      }
    }
  }

  async function seedFinding(tempDir, opts = {}) {
    const report = await metaStateReportTool.handler({
      category: opts.category || "loop-anti-pattern",
      severity: opts.severity || "warning",
      affected_system: opts.affected_system || "meta-state-tools",
      description: opts.description || "Dispatch test finding — fixable in a separate worktree",
      ...(opts.evidence_code_ref ? { evidence_code_ref: opts.evidence_code_ref } : {}),
    });
    return JSON.parse(report.content[0].text).id;
  }

  function withOperator() {
    process.env.OPERATOR_MODE = "1";
    return () => { delete process.env.OPERATOR_MODE; };
  }

  test("prepare: builds body + no ledger row, no ledger_ref change", async () => {
    const tempDir = setupTempRegistry();
    try {
      const id = await seedFinding(tempDir);
      const r = await metaStateDispatchFindingTool.handler({ id, stage: "prepare" });
      const body = JSON.parse(r.content[0].text);
      assert.strictEqual(body.finding_id, id);
      assert.ok(body.issue_title.includes(id), "issue_title should include the finding id");
      assert.ok(body.issue_body.includes(`local:meta-state:${id}`), "body must cite local:meta-state:<id>");
      assert.ok(body.issue_body.includes("### Description"));
      assert.match(body.coord_repo_hint, /operator-dispatches/);

      // No ledger row, no ledger_ref change.
      const after = readRegistry(tempDir);
      const f = after.find((e) => e.id === id);
      assert.ok(!f.ledger_ref, `prepare must not set ledger_ref; got ${f.ledger_ref}`);
      const sidecarPath = join(tempDir, "runtime-state.jsonl");
      assert.ok(!existsSync(sidecarPath), "prepare must not write runtime-state.jsonl");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("commit: writes ledger + patches ledger_ref (operator-gated)", async () => {
    const tempDir = setupTempRegistry();
    const clearOp = withOperator();
    try {
      const id = await seedFinding(tempDir);
      const r = await metaStateDispatchFindingTool.handler({
        id,
        stage: "commit",
        issue_number: 42,
        issue_url: "https://github.com/example/repo/issues/42",
        repo: "example/repo",
        delegated_to: "agent-alpha",
      });
      const body = JSON.parse(r.content[0].text);
      assert.strictEqual(body.dispatched, true);
      assert.strictEqual(body.issue_number, 42);
      assert.strictEqual(body.ledger_id, `dispatch-${id}`);

      // Ledger row written.
      const sidecar = JSON.parse(readFileSync(join(tempDir, "runtime-state.jsonl"), "utf8")
        .split("\n").filter(Boolean).pop());
      assert.strictEqual(sidecar.id, `dispatch-${id}`);
      assert.strictEqual(sidecar.metadata.issue_number, 42);
      assert.strictEqual(sidecar.metadata.repo, "example/repo");
      assert.strictEqual(sidecar.metadata.delegated_to, "agent-alpha");
      assert.strictEqual(sidecar.metadata.finding_id, id);
      assert.strictEqual(sidecar.source_ref, `local:meta-state:${id}`);

      // ledger_ref patched.
      const after = readRegistry(tempDir);
      const f = after.find((e) => e.id === id);
      assert.strictEqual(f.ledger_ref, `dispatch-${id}`);
    } finally {
      clearOp();
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("idempotency: re-prepare after dispatch returns existing coords", async () => {
    const tempDir = setupTempRegistry();
    const clearOp = withOperator();
    try {
      const id = await seedFinding(tempDir);
      await metaStateDispatchFindingTool.handler({
        id, stage: "commit",
        issue_number: 99,
        issue_url: "https://github.com/example/repo/issues/99",
        repo: "example/repo",
      });

      const r2 = await metaStateDispatchFindingTool.handler({ id, stage: "prepare" });
      const body = JSON.parse(r2.content[0].text);
      assert.strictEqual(body.dispatched, false);
      assert.strictEqual(body.reason, "already_dispatched");
      assert.strictEqual(body.issue_number, 99);
      assert.strictEqual(body.issue_url, "https://github.com/example/repo/issues/99");
    } finally {
      clearOp();
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("idempotency: re-commit same coords is no-op success", async () => {
    const tempDir = setupTempRegistry();
    const clearOp = withOperator();
    try {
      const id = await seedFinding(tempDir);
      const first = await metaStateDispatchFindingTool.handler({
        id, stage: "commit",
        issue_number: 7, issue_url: "https://x/y/issues/7", repo: "x/y",
      });
      assert.strictEqual(JSON.parse(first.content[0].text).dispatched, true);

      const second = await metaStateDispatchFindingTool.handler({
        id, stage: "commit",
        issue_number: 7, issue_url: "https://x/y/issues/7", repo: "x/y",
      });
      const body = JSON.parse(second.content[0].text);
      assert.strictEqual(body.dispatched, true);
      assert.strictEqual(body.idempotent, true);

      // Exactly ONE ledger row.
      const sidecar = readFileSync(join(tempDir, "runtime-state.jsonl"), "utf8")
        .split("\n").filter(Boolean);
      assert.strictEqual(sidecar.length, 1, `expected 1 ledger row, got ${sidecar.length}`);
    } finally {
      clearOp();
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("idempotency: commit different coords after a row exists is refused", async () => {
    const tempDir = setupTempRegistry();
    const clearOp = withOperator();
    try {
      const id = await seedFinding(tempDir);
      await metaStateDispatchFindingTool.handler({
        id, stage: "commit",
        issue_number: 7, issue_url: "https://x/y/issues/7", repo: "x/y",
      });

      const r2 = await metaStateDispatchFindingTool.handler({
        id, stage: "commit",
        issue_number: 8, issue_url: "https://x/y/issues/8", repo: "x/y",
      });
      const body = JSON.parse(r2.content[0].text);
      assert.strictEqual(body.dispatched, false);
      assert.strictEqual(body.reason, "already_dispatched");
      assert.strictEqual(body.existing_issue_number, 7);
      assert.strictEqual(body.existing_issue_url, "https://x/y/issues/7");

      // Still ONE row.
      const sidecar = readFileSync(join(tempDir, "runtime-state.jsonl"), "utf8")
        .split("\n").filter(Boolean);
      assert.strictEqual(sidecar.length, 1);
    } finally {
      clearOp();
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("non-operator commit is refused (operator_role_required)", async () => {
    const tempDir = setupTempRegistry();
    delete process.env.OPERATOR_MODE;
    try {
      const id = await seedFinding(tempDir);
      const r = await metaStateDispatchFindingTool.handler({
        id, stage: "commit",
        issue_number: 1, issue_url: "https://x/y/issues/1", repo: "x/y",
      });
      const body = JSON.parse(r.content[0].text);
      assert.strictEqual(body.dispatched, false);
      assert.strictEqual(body.reason, "operator_role_required");

      // No ledger row written.
      assert.ok(!existsSync(join(tempDir, "runtime-state.jsonl")), "refused commit must not write ledger");
      const after = readRegistry(tempDir);
      const f = after.find((e) => e.id === id);
      assert.ok(!f.ledger_ref, "refused commit must not set ledger_ref");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("P2 F6 (a): commit with preflight + WITHOUT OPERATOR_MODE → refused", async () => {
    const tempDir = setupTempRegistry();
    setPreflightMarker(tempDir);
    delete process.env.OPERATOR_MODE;
    try {
      const id = await seedFinding(tempDir);
      const r = await metaStateDispatchFindingTool.handler({
        id, stage: "commit",
        issue_number: 1, issue_url: "https://x/y/issues/1", repo: "x/y",
      });
      const body = JSON.parse(r.content[0].text);
      assert.strictEqual(body.dispatched, false);
      assert.strictEqual(body.reason, "operator_role_required");
    } finally {
      clearPreflightMarker(tempDir);
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("P2 F6 (b): commit WITHOUT preflight + WITH OPERATOR_MODE → succeeds", async () => {
    // Orthogonal-gate design: the dispatch tool bypasses preflight by design.
    // It checks OPERATOR_MODE only. A preflight-installed non-operator agent
    // is refused at the OPERATOR_MODE check; a non-preflight operator is OK.
    const tempDir = setupTempRegistry();
    clearPreflightMarker(tempDir);
    const clearOp = withOperator();
    try {
      const id = await seedFinding(tempDir);
      const r = await metaStateDispatchFindingTool.handler({
        id, stage: "commit",
        issue_number: 2, issue_url: "https://x/y/issues/2", repo: "x/y",
      });
      const body = JSON.parse(r.content[0].text);
      assert.strictEqual(body.dispatched, true, `commit should succeed without preflight; got ${JSON.stringify(body)}`);
      assert.strictEqual(body.issue_number, 2);

      const after = readRegistry(tempDir);
      const f = after.find((e) => e.id === id);
      assert.strictEqual(f.ledger_ref, `dispatch-${id}`);
    } finally {
      clearOp();
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("P2 F7 — concurrent dispatch (Promise.all): CAS safety under true concurrency", async () => {
    // Both commits use the SAME id + SAME coords. Acceptance: exactly ONE
    // ledger row + ONE applied=true; the other commit returns idempotent=true
    // OR version_mismatch. The CAS layer on ledger_ref is the only safety
    // under true concurrency; the ledger scan is best-effort.
    const tempDir = setupTempRegistry();
    const clearOp = withOperator();
    try {
      const id = await seedFinding(tempDir);
      const coords = { issue_number: 100, issue_url: "https://x/y/issues/100", repo: "x/y" };

      const [a, b] = await Promise.all([
        metaStateDispatchFindingTool.handler({ id, stage: "commit", ...coords }),
        metaStateDispatchFindingTool.handler({ id, stage: "commit", ...coords }),
      ]);
      const bodies = [JSON.parse(a.content[0].text), JSON.parse(b.content[0].text)];

      const successes = bodies.filter((b) => b.dispatched === true && !b.idempotent && !b.orphan_warning).length;
      const idempotents = bodies.filter((b) => b.dispatched === true && b.idempotent === true).length;
      const orphans = bodies.filter((b) => b.orphan_warning).length;
      assert.strictEqual(successes + idempotents + orphans, 2, `expected 2 returns total, got ${JSON.stringify(bodies)}`);
      // At least one of the two committed (success or idempotent re-run); the
      // other either no-ops or hits orphan_warning. We don't pin which —
      // the contract is ONE ledger row.
      const sidecar = readFileSync(join(tempDir, "runtime-state.jsonl"), "utf8")
        .split("\n").filter(Boolean);
      assert.strictEqual(sidecar.length, 1, `expected 1 ledger row, got ${sidecar.length}`);
    } finally {
      clearOp();
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("orphan self-heal: re-invoking commit with same coords patches missing ledger_ref", async () => {
    // Simulate the orphan: write the dispatch ledger row but do NOT patch
    // ledger_ref (e.g. due to a CAS version_mismatch on the original commit).
    // Then re-invoke commit with the same coords; the tool should heal by
    // patching ledger_ref.
    const tempDir = setupTempRegistry();
    const clearOp = withOperator();
    try {
      const id = await seedFinding(tempDir);
      const coords = { issue_number: 200, issue_url: "https://x/y/issues/200", repo: "x/y" };

      // Write the dispatch ledger row directly (simulating a prior commit
      // whose ledger_ref patch failed).
      const { appendLedgerEvent } = await import("../../core/runtime-state.js");
      appendLedgerEvent(tempDir, {
        affected_system: "meta-state-tools",
        kind: "ledger-event",
        id: `dispatch-${id}`,
        value: null,
        delta: null,
        source_ref: `local:meta-state:${id}`,
        timestamp: new Date().toISOString(),
        status: "active",
        fingerprint: null,
        metadata: {
          issue_number: coords.issue_number,
          issue_url: coords.issue_url,
          repo: coords.repo,
          dispatched_by: "operator",
          dispatched_at: new Date().toISOString(),
          finding_id: id,
          delegated_to: null,
        },
      });

      // Verify ledger_ref is NOT set on the finding (the orphan condition).
      const before = readRegistry(tempDir).find((e) => e.id === id);
      assert.ok(!before.ledger_ref, "test setup: ledger_ref should be unset");

      // Re-invoke commit with the same coords. Should detect existing row
      // + patch the missing ledger_ref (orphan self-heal).
      const r = await metaStateDispatchFindingTool.handler({ id, stage: "commit", ...coords });
      const body = JSON.parse(r.content[0].text);
      assert.strictEqual(body.dispatched, true);
      assert.strictEqual(body.idempotent, true);

      const after = readRegistry(tempDir).find((e) => e.id === id);
      assert.strictEqual(after.ledger_ref, `dispatch-${id}`, "orphan self-heal should patch ledger_ref");
    } finally {
      clearOp();
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("prepare is ungated (any session can run it, even without OPERATOR_MODE)", async () => {
    const tempDir = setupTempRegistry();
    delete process.env.OPERATOR_MODE;
    try {
      const id = await seedFinding(tempDir);
      const r = await metaStateDispatchFindingTool.handler({ id, stage: "prepare" });
      const body = JSON.parse(r.content[0].text);
      assert.strictEqual(body.finding_id, id);
      assert.ok(body.issue_title);
      assert.ok(body.issue_body);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });
});