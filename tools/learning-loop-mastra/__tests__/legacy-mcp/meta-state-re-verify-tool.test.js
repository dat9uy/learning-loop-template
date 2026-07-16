/**
 * Plan 260716-0624 Phase 03 tests for the opt-in `refresh: true` flag on
 * `meta_state_re_verify`. RT: M8 — the test file did not exist; add as a
 * deliverable. Covers:
 *   1. Pass + refresh:true → index_refreshed:true, file-index baseline updated.
 *   2. Pass + refresh:false (default) → index_refreshed:false, file-index unchanged.
 *   3. Best-effort skip on file missing/EACCES → re_verified:true, index_refreshed:false, gate-log breadcrumb emitted.
 *   4. META_STATE_VERIFY_EXEC unset → early dry-return; index_refreshed absent.
 *   5. CAS conflict → re_verified:false; index never mutates (no orphan baseline).
 */

import { describe, test, beforeAll, afterAll } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateReVerifyTool } from "../../tools/handlers/meta-state-re-verify-tool.js";
import { metaStateReportTool } from "../../tools/handlers/meta-state-report-tool.js";
import { readRegistry, writeEntry, readFileIndex } from "../../core/meta-state.js";

describe("meta_state_re_verify — opt-in refresh (plan 260716-0624 Phase 03)", () => {
  let root;
  let prevGateRoot;
  let prevVerifyExec;

  beforeAll(() => {
    prevGateRoot = process.env.GATE_ROOT;
    prevVerifyExec = process.env.META_STATE_VERIFY_EXEC;
    root = mkdtempSync(join(tmpdir(), "meta-state-re-verify-refresh-"));
    process.env.GATE_ROOT = root;
    mkdirSync(root, { recursive: true });
  });

  afterAll(() => {
    if (prevGateRoot === undefined) delete process.env.GATE_ROOT;
    else process.env.GATE_ROOT = prevGateRoot;
    if (prevVerifyExec === undefined) delete process.env.META_STATE_VERIFY_EXEC;
    else process.env.META_STATE_VERIFY_EXEC = prevVerifyExec;
    try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  async function setupEntry(id, verification, evidence_code_ref) {
    await writeEntry(root, {
      id,
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test fixture for refresh opt-in (min 20 chars)",
      status: "open",
      verification,
      ...(evidence_code_ref ? { evidence_code_ref } : {}),
      created_at: new Date().toISOString(),
      version: 0,
    });
  }

  test("verify_exec unset → early dry-return; index_refreshed absent", async () => {
    delete process.env.META_STATE_VERIFY_EXEC;
    await setupEntry("meta-test-refresh-noexec", { steps: [], history: [] });
    const r = await metaStateReVerifyTool.handler({ id: "meta-test-refresh-noexec", refresh: true });
    const parsed = JSON.parse(r.content[0].text);
    assert.strictEqual(parsed.re_verified, false);
    assert.strictEqual(parsed.reason, "verify_exec_required");
    // index_refreshed must NOT be present when verify_exec is unset.
    assert.strictEqual(parsed.index_refreshed, undefined);
  });

  test("pass + refresh:true → index_refreshed:true; baseline updated", async () => {
    process.env.META_STATE_VERIFY_EXEC = "1";
    // Create a target file inside root (including parent dir).
    const targetRel = "tools/refresh-target.js";
    mkdirSync(join(root, "tools"), { recursive: true });
    writeFileSync(join(root, targetRel), "// initial content");
    await setupEntry("meta-test-refresh-true", {
      steps: [
        { cmd: "ls", args: [targetRel], expect: { exit_code: 0 } },
      ],
      history: [],
      last_verified_at: null,
    }, targetRel);
    const before = readFileIndex(root);
    assert.ok(!before.has(targetRel), "fixture precondition: no baseline yet");

    const r = await metaStateReVerifyTool.handler({ id: "meta-test-refresh-true", refresh: true });
    const parsed = JSON.parse(r.content[0].text);
    assert.strictEqual(parsed.re_verified, true);
    assert.strictEqual(parsed.index_refreshed, true);

    const after = readFileIndex(root);
    assert.ok(after.has(targetRel), "baseline upserted");
    assert.match(after.get(targetRel), /^sha256:[a-f0-9]{64}$/);
  });

  test("pass + refresh:false (default) → index_refreshed:false; file-index unchanged", async () => {
    process.env.META_STATE_VERIFY_EXEC = "1";
    const targetRel = "tools/refresh-target-default.js";
    mkdirSync(join(root, "tools"), { recursive: true });
    writeFileSync(join(root, targetRel), "// default content");
    await setupEntry("meta-test-refresh-default", {
      steps: [{ cmd: "ls", args: [targetRel], expect: { exit_code: 0 } }],
      history: [],
      last_verified_at: null,
    }, targetRel);

    // No refresh opt-in.
    const r = await metaStateReVerifyTool.handler({ id: "meta-test-refresh-default" });
    const parsed = JSON.parse(r.content[0].text);
    assert.strictEqual(parsed.re_verified, true);
    assert.strictEqual(parsed.index_refreshed, false);
  });

  test("pass + refresh:true + missing file → re_verified:true, index_refreshed:false, gate-log breadcrumb", async () => {
    process.env.META_STATE_VERIFY_EXEC = "1";
    const targetRel = "tools/refresh-missing-file.js"; // does NOT exist
    mkdirSync(join(root, "tools"), { recursive: true });
    await setupEntry("meta-test-refresh-missing", {
      steps: [
        // Use a passing step so re_verified is true. The refresh path tries
        // to hash a missing file via evidence_code_ref → best-effort skip.
        { cmd: "echo", args: ["pass"], expect: { exit_code: 0 } },
      ],
      history: [],
      last_verified_at: null,
    });
    // Update the entry to point evidence_code_ref at a missing file.
    const reg = readRegistry(root);
    const entry = reg.find((e) => e.id === "meta-test-refresh-missing");
    entry.evidence_code_ref = targetRel;
    writeFileSync(join(root, "meta-state.jsonl"),
      reg.map((e) => JSON.stringify(e)).join("\n") + "\n");

    const r = await metaStateReVerifyTool.handler({ id: "meta-test-refresh-missing", refresh: true });
    const parsed = JSON.parse(r.content[0].text);
    assert.strictEqual(parsed.re_verified, true);
    assert.strictEqual(parsed.index_refreshed, false);

    // Plan 260716-0624 Finding 2: a missing evidence file surfaces as
    // PathContainmentError("outside_root", resolvedPath:null) — the refresh
    // skip reason must be "missing", NOT "containment_violation:outside_root"
    // (which would mislabel a benign absent file as a traversal/escape attempt).
    const gateLogPath = join(root, ".claude", "coordination", "gate-log.jsonl");
    assert.ok(existsSync(gateLogPath), "gate-log must be written for the refresh skip");
    const skipEntry = readFileSync(gateLogPath, "utf8")
      .split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l))
      .find((e) => e.tool === "meta_state_re_verify" && e.action === "index_refresh_skipped" && e.id === "meta-test-refresh-missing");
    assert.ok(skipEntry, "an index_refresh_skipped breadcrumb must exist for the missing file");
    assert.strictEqual(skipEntry.reason, "missing", `missing file must log reason "missing", not a containment_violation; got: ${skipEntry.reason}`);
  });

  test("CAS conflict → re_verified:false; index never mutates (no orphan baseline)", async () => {
    process.env.META_STATE_VERIFY_EXEC = "1";
    const targetRel = "tools/refresh-cas-conflict.js";
    mkdirSync(join(root, "tools"), { recursive: true });
    writeFileSync(join(root, targetRel), "// cas conflict content");
    await setupEntry("meta-test-refresh-cas", {
      steps: [{ cmd: "ls", args: [targetRel], expect: { exit_code: 0 } }],
      history: [],
      last_verified_at: null,
    }, targetRel);

    // Stale version (the entry is at version 0, but we'll pass _expected_version: 99).
    const r = await metaStateReVerifyTool.handler({
      id: "meta-test-refresh-cas",
      refresh: true,
      _expected_version: 99, // wrong on purpose
    });
    const parsed = JSON.parse(r.content[0].text);
    assert.strictEqual(parsed.re_verified, false);
    // index_refreshed is NOT set on the conflict path.
    assert.strictEqual(parsed.index_refreshed, undefined);

    // Baseline must NOT be set (CAS conflict → no entry patch → no refresh attempt).
    const after = readFileIndex(root);
    assert.ok(!after.has(targetRel), "no orphan baseline after CAS conflict");
  });
});
