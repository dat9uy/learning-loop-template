// Tests for plan 260704-0301-stale-findings-dispatch-handle Phase 3:
// the four TTL cases (dispatch/TTL interaction in v1) + the close-flow test
// (refresh_file_index → log_change → resolve; fingerprint_mismatch block
// without refresh). These were called out as the Phase-3 Medium-risk
// mitigation in phase-03.md and were absent from the original Phase-3 ship.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeEntry, readRegistry, updateEntry } from "../../core/meta-state.js";
import { invalidateCache } from "../../core/read-registry-cache.js";
import { readRuntimeStateRows } from "../../core/runtime-state.js";
import { computeFileHash } from "../../core/check-grounding.js";
import { metaStateReportTool } from "../../tools/legacy/meta-state-report-tool.js";
import { metaStateDispatchFindingTool } from "../../tools/legacy/meta-state-dispatch-finding-tool.js";
import { metaStateSweepTool } from "../../tools/legacy/meta-state-sweep-tool.js";
import { metaStateReVerifyTool } from "../../tools/legacy/meta-state-re-verify-tool.js";
import { metaStateResolveTool } from "../../tools/legacy/meta-state-resolve-tool.js";
import { metaStateRefreshFileIndexTool, _clearIdempotencyCacheForTests as clearRefreshCache } from "../../tools/legacy/meta-state-refresh-file-index-tool.js";
import { metaStateLogChangeTool } from "../../tools/legacy/meta-state-log-change-tool.js";

const PREV_GATE_ROOT = process.env.GATE_ROOT;
const PREV_OPERATOR = process.env.OPERATOR_MODE;
const PREV_VERIFY_EXEC = process.env.META_STATE_VERIFY_EXEC;

function setupTempRegistry() {
  const tempDir = mkdtempSync(join(tmpdir(), "dispatch-ttl-close-"));
  process.env.GATE_ROOT = tempDir;
  return tempDir;
}

function restoreEnv() {
  if (PREV_GATE_ROOT === undefined) delete process.env.GATE_ROOT;
  else process.env.GATE_ROOT = PREV_GATE_ROOT;
  if (PREV_OPERATOR === undefined) delete process.env.OPERATOR_MODE;
  else process.env.OPERATOR_MODE = PREV_OPERATOR;
  if (PREV_VERIFY_EXEC === undefined) delete process.env.META_STATE_VERIFY_EXEC;
  else process.env.META_STATE_VERIFY_EXEC = PREV_VERIFY_EXEC;
}

async function seedDispatchedFinding(tempDir, opts = {}) {
  // Report a finding with an evidence_code_ref so mechanism_check defaults
  // to true and a code_fingerprint baseline is recorded. Then dispatch-commit
  // so ledger_ref + the dispatch-<id> ledger row both exist.
  const report = await metaStateReportTool.handler({
    category: opts.category || "loop-anti-pattern",
    severity: opts.severity || "warning",
    affected_system: opts.affected_system || "meta-state-tools",
    description: opts.description || "Dispatch TTL/close-flow test fixture (min 20 chars)",
    ...(opts.evidence_code_ref ? { evidence_code_ref: opts.evidence_code_ref } : {}),
  });
  const id = JSON.parse(report.content[0].text).id;
  if (opts.status) {
    await updateEntry(tempDir, id, { status: opts.status, ...(opts.acked_at ? { acked_at: opts.acked_at } : {}) });
  }
  if (opts.expires_at !== undefined) {
    await updateEntry(tempDir, id, { expires_at: opts.expires_at });
  }
  const commit = await metaStateDispatchFindingTool.handler({
    id,
    stage: "commit",
    issue_number: opts.issue_number ?? 101,
    issue_url: opts.issue_url ?? "https://github.com/example/coord/issues/101",
    repo: "example/coord",
  });
  assert.strictEqual(JSON.parse(commit.content[0].text).dispatched, true, "seed dispatch must succeed");
  return id;
}

describe("dispatch TTL interaction (Phase 3 four TTL cases)", () => {
  test("(a) dispatched open finding → sweep is read-only → ledger_ref + ledger event survive (no status mutation)", async () => {
    const tempDir = setupTempRegistry();
    process.env.OPERATOR_MODE = "1";
    try {
      const id = await seedDispatchedFinding(tempDir, {
        evidence_code_ref: "tools/x.js:1",
        status: "open",
      });

      // Precondition: open + ledger_ref set + ledger row exists.
      const before = readRegistry(tempDir).find((e) => e.id === id);
      assert.strictEqual(before.status, "open");
      assert.strictEqual(before.ledger_ref, `dispatch-${id}`);
      assert.ok(readRuntimeStateRows(tempDir).some((r) => r.id === `dispatch-${id}`));

      // Sweep is read-only (Plan 260707-0812 Phase 3): no status writes.
      const sweepRes = await metaStateSweepTool.handler({});
      const sweepBody = JSON.parse(sweepRes.content[0].text);
      assert.strictEqual(sweepBody.swept, false, "sweep is read-only — swept must be false");
      assert.strictEqual(sweepBody.read_only, true);
      assert.strictEqual(sweepBody.dry_run, true);

      const after = readRegistry(tempDir).find((e) => e.id === id);
      assert.strictEqual(after.status, "open", "sweep must not mutate status");
      // The invariant: ledger_ref survives (not stripped).
      assert.strictEqual(after.ledger_ref, `dispatch-${id}`, "ledger_ref must survive read-only sweep");
      // The ledger row survives too.
      assert.ok(readRuntimeStateRows(tempDir).some((r) => r.id === `dispatch-${id}`), "ledger row must survive");
    } finally {
      restoreEnv();
    }
  });

  test("(b) re_verify stamps last_verified_at, status stays open, ledger_ref survives", async () => {
    const tempDir = setupTempRegistry();
    process.env.OPERATOR_MODE = "1";
    process.env.META_STATE_VERIFY_EXEC = "1";
    try {
      // Seed a dispatched finding with a passing verification step.
      const report = await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "meta-state-tools",
        description: "Re-verify ledger_ref persistence fixture (min 20 chars)",
        evidence_code_ref: "tools/x.js:1",
      });
      const id = JSON.parse(report.content[0].text).id;
      await metaStateDispatchFindingTool.handler({
        id, stage: "commit", issue_number: 202,
        issue_url: "https://github.com/example/coord/issues/202", repo: "example/coord",
      });
      // Attach a trivially-passing verification step (node is allowlisted).
      invalidateCache(tempDir);
      const entry = readRegistry(tempDir).find((e) => e.id === id);
      await updateEntry(tempDir, id, {
        verification: { steps: [{ cmd: "node", args: ["-e", "process.exit(0)"] }] },
      });
      assert.strictEqual(entry.ledger_ref, `dispatch-${id}`);

      // Re-verify: on pass stamps last_verified_at only; status stays open.
      const r = await metaStateReVerifyTool.handler({ id });
      const body = JSON.parse(r.content[0].text);
      assert.strictEqual(body.re_verified, true, "re_verify must pass");
      assert.strictEqual(body.status, "open", "re_verify must not transition status");

      const after = readRegistry(tempDir).find((e) => e.id === id);
      assert.strictEqual(after.status, "open", "status stays open after re_verify");
      assert.ok(after.last_verified_at, "last_verified_at must be stamped on pass");
      assert.strictEqual(after.ledger_ref, `dispatch-${id}`, "ledger_ref must survive re_verify");
    } finally {
      restoreEnv();
    }
  });

  test("(c) regression-pin: a ledger_ref-set finding with a modified evidence file is NOT auto-resolved by sweep", async () => {
    // Plan 260707-0812 Phase 3: sweep is read-only and performs NO status
    // writes, so there is no file-modification→auto-resolved branch. This
    // test pins that: a dispatched, ledger_ref-set finding with a MODIFIED
    // evidence file stays `open` (not auto-resolved) and keeps its ledger_ref.
    const tempDir = setupTempRegistry();
    process.env.OPERATOR_MODE = "1";
    try {
      const dummyPath = join(tempDir, "evidence-c.js");
      writeFileSync(dummyPath, "const v = 1;\n");
      const id = await seedDispatchedFinding(tempDir, {
        evidence_code_ref: "evidence-c.js",
        status: "open",
      });

      // Modify the evidence file (the condition a future auto-resolve branch
      // would key on).
      writeFileSync(dummyPath, "const v = 2;\n");

      await metaStateSweepTool.handler({});

      const after = readRegistry(tempDir).find((e) => e.id === id);
      assert.notStrictEqual(after.status, "auto-resolved", "sweep must NOT auto-resolve a dispatched finding");
      assert.strictEqual(after.status, "open", "sweep is read-only — status stays open");
      assert.strictEqual(after.ledger_ref, `dispatch-${id}`, "ledger_ref survives sweep");
    } finally {
      restoreEnv();
    }
  });

  test("(d) sweep between dispatch and resolve neither orphans nor duplicates ledger_ref", async () => {
    const tempDir = setupTempRegistry();
    process.env.OPERATOR_MODE = "1";
    try {
      const id = await seedDispatchedFinding(tempDir, {
        evidence_code_ref: "tools/x.js:1",
        status: "open",
      });

      // Run sweep twice (simulating repeated pre-commit sweeps between
      // dispatch and resolve). Sweep is read-only, so neither run mutates.
      await metaStateSweepTool.handler({});
      await metaStateSweepTool.handler({});

      const after = readRegistry(tempDir).find((e) => e.id === id);
      assert.strictEqual(after.status, "open", "sweep is read-only — status stays open");
      assert.strictEqual(after.ledger_ref, `dispatch-${id}`, "ledger_ref not orphaned");
      // Exactly one dispatch ledger row — no duplication.
      const dispatchRows = readRuntimeStateRows(tempDir).filter((r) => r.id === `dispatch-${id}`);
      assert.strictEqual(dispatchRows.length, 1, "exactly one dispatch ledger row");
    } finally {
      restoreEnv();
    }
  });
});

describe("dispatch close flow (refresh_file_index → log_change → resolve)", () => {
  test("resolve is blocked by fingerprint_mismatch after an evidence edit; refresh + log_change unblock it", async () => {
    const tempDir = setupTempRegistry();
    process.env.OPERATOR_MODE = "1";
    try {
      const dummyPath = join(tempDir, "evidence-close.js");
      writeFileSync(dummyPath, "const v = 1;\n");
      const baselineHash = computeFileHash(dummyPath);

      // Seed an ACTIVE dispatched finding with a known code_fingerprint baseline.
      // (Active — not stale — so the rule-no-orphaned-evidence consult-gate,
      // which filters active/reported mechanism_check=true findings, includes it.)
      const findingId = "meta-260704T0900Z-close-flow-fixture-finding";
      await writeEntry(tempDir, {
        id: findingId,
        entry_kind: "finding",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "meta-state-tools",
        description: "Close-flow fixture: dispatched finding whose evidence file is edited (min 20 chars)",
        status: "open",
        created_at: new Date().toISOString(),
        version: 0,
        mechanism_check: true,
        evidence_code_ref: "evidence-close.js",
        code_fingerprint: baselineHash,
      });

      // Seed the global consult-gate rule so the resolve tool consults it.
      // The rule schema requires origin/promoted_at/promoted_by; use synthetic
      // values (this rule is normally promoted from a finding, but the resolve
      // tool only cares that an active resolution-evidence-required rule with
      // applies_to_resolution="*" exists in the registry).
      await writeEntry(tempDir, {
        id: "rule-no-orphaned-evidence",
        entry_kind: "rule",
        status: "active",
        enforcement: "agent",
        pattern_type: "resolution-evidence-required",
        pattern: "*",
        applies_to_resolution: "*",
        origin: "meta-260704T0900Z-close-flow-seed-origin",
        promoted_at: new Date().toISOString(),
        promoted_by: "operator",
        description: "All active findings with mechanism_check=true must have a grounded evidence_code_ref (min 20 chars)",
      });

      // Dispatch the finding (sets ledger_ref + the ledger row).
      const commit = await metaStateDispatchFindingTool.handler({
        id: findingId, stage: "commit", issue_number: 303,
        issue_url: "https://github.com/example/coord/issues/303", repo: "example/coord",
      });
      assert.strictEqual(JSON.parse(commit.content[0].text).dispatched, true);

      // Edit the evidence file → live hash diverges from the per-record baseline.
      clearRefreshCache();
      writeFileSync(dummyPath, "const v = 2;\n");

      // resolve WITHOUT refresh → blocked by fingerprint_mismatch.
      const blocked = await metaStateResolveTool.handler({
        id: findingId,
        resolution: "fixed in PR #999 (change-log pending)",
      });
      const blockedBody = JSON.parse(blocked.content[0].text);
      assert.strictEqual(blockedBody.resolved, false);
      assert.strictEqual(blockedBody.reason, "resolution_evidence_required");
      assert.ok(blockedBody.orphans, "expected orphan evidence");
      const orphan = blockedBody.orphans.find((o) => o.id === findingId);
      assert.ok(orphan, "the dispatched finding should be the blocking orphan");
      assert.strictEqual(orphan.reason, "fingerprint_mismatch");

      // refresh_file_index → upserts the new hash into file-index.jsonl (authoritative).
      const refresh = await metaStateRefreshFileIndexTool.handler({ path: "evidence-close.js", reason: "fix landed in PR #999" });
      const refreshBody = JSON.parse(refresh.content[0].text);
      assert.strictEqual(refreshBody.status, "refreshed", `refresh failed: ${JSON.stringify(refreshBody)}`);

      // log_change → records the fix in the durable audit log.
      const log = await metaStateLogChangeTool.handler({
        change_dimension: "mechanical",
        change_target: "evidence-close.js",
        change_diff: { added: ["const v = 2;"], removed: ["const v = 1;"], changed: [] },
        reason: "Fixed the close-flow fixture evidence file in PR #999 (min 20 chars)",
      });
      const logBody = JSON.parse(log.content[0].text);
      assert.ok(logBody.id, "log_change must return a change-log id");

      // resolve again → succeeds now that the evidence is re-grounded.
      const resolved = await metaStateResolveTool.handler({
        id: findingId,
        resolution: `fixed in PR #999 (change-log ${logBody.id})`,
      });
      const resolvedBody = JSON.parse(resolved.content[0].text);
      assert.strictEqual(resolvedBody.resolved, true, `resolve should succeed after refresh: ${JSON.stringify(resolvedBody)}`);

      const finalEntry = readRegistry(tempDir).find((e) => e.id === findingId);
      assert.strictEqual(finalEntry.status, "resolved");
      // ledger_ref survived through resolve.
      assert.strictEqual(finalEntry.ledger_ref, `dispatch-${findingId}`);
    } finally {
      clearRefreshCache();
      restoreEnv();
    }
  });
});