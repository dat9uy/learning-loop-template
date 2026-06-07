import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateQueryDriftTool } from "../../tools/meta-state-query-drift-tool.js";
import { metaStateReportTool } from "../../tools/meta-state-report-tool.js";
import { readRegistry } from "#mcp/core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";

describe("SP3 query_drift acceptance", () => {
  const originalEnv = process.env.GATE_ROOT;

  // AT-1: Acceptance — active code-pointed finding → drift with recommendation: resolve
  test("AT-1: acceptance — active code-pointed finding → drift with recommendation resolve", async () => {
    // Synthetic active finding so this acceptance test is not coupled to the real
    // registry's lifecycle. The real "internalization rule" finding was resolved by
    // plan 260606; this test locks the query_drift contract independently.
    const codeRef = "tools/learning-loop-mcp/lib/source-ref-validator.js";
    const syntheticEntry = {
      id: "meta-260606T0000Z-sp3-acceptance-synthetic",
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Synthetic acceptance finding: internalization rule coverage.",
      evidence: { code_ref: codeRef },
      evidence_code_ref: codeRef,
      mechanism_check: true,
      status: "active",
      created_at: "2026-06-06T00:00:00Z",
      expires_at: "2026-06-07T00:00:00Z",
      version: 0,
    };

    const tempDir = mkdtempSync(join(tmpdir(), "sp3-acceptance-1-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const refPath = join(tempDir, codeRef);
      mkdirSync(join(tempDir, "tools", "learning-loop-mcp", "lib"), { recursive: true });
      writeFileSync(refPath, "// real file exists", "utf8");

      writeFileSync(join(tempDir, "meta-state.jsonl"), JSON.stringify(syntheticEntry) + "\n", "utf8");

      const result = await metaStateQueryDriftTool.handler({});
      assert.strictEqual(result.drift_count, 1);
      const ev = result.drift_events[0];
      assert.strictEqual(ev.id, syntheticEntry.id);
      assert.strictEqual(ev.derived_status, "resolved-by-mechanism");
      assert.strictEqual(ev.recommendation, "resolve");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // AT-2: Acceptance — real change-log with evidence_code_ref → drift
  // Post-migration: change-logs carry top-level evidence_code_ref and are
  // evaluated normally. The SP0 self-log change-log points to its own file
  // (evidence_code_ref = "tools/learning-loop-mcp/tools/meta-state-log-change-tool.js")
  // but has no evidence_test. In the test's temp dir, the referenced file
  // is not copied, so SP1 returns kind: "code-missing" → derived_status:
  // "active-no-signal" → case 6 (code-missing) → drift with recommendation
  // "investigate". This locks in the post-migration behavior: change-logs
  // with evidence_code_ref are no longer silently skipped.
  test("AT-2: acceptance — change-log with evidence_code_ref → drift (code-missing case)", async () => {
    const root = resolveRoot();
    const entries = readRegistry(root);
    // Find the SP0 self-log change-log entry.
    const realEntry = entries.find((e) =>
      e.entry_kind === "change-log" &&
      e.change_target === "tools/learning-loop-mcp/tools/meta-state-log-change-tool.js"
    );
    assert.ok(realEntry, "Expected to find the SP0 self-log change-log entry in meta-state.jsonl");

    const tempDir = mkdtempSync(join(tmpdir(), "sp3-acceptance-2-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "meta-state.jsonl"), JSON.stringify(realEntry) + "\n", "utf8");
      const result = await metaStateQueryDriftTool.handler({});
      // Change-log is now evaluated. Referenced file is not present in tempDir
      // → kind: code-missing → active-no-signal → drift (case 6) → investigate.
      assert.strictEqual(result.drift_count, 1);
      const ev = result.drift_events[0];
      assert.strictEqual(ev.id, realEntry.id);
      assert.strictEqual(ev.derived_status, "active-no-signal");
      assert.strictEqual(ev.recommendation, "investigate");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // GM-1: Grounding-mode — no-signals entry (no code_ref) with run_grounding → no drift
  // (case 4 in plan; SP1 fast-path skips before SP2 is called; both mode and grounding don't surface drift)
  test("GM-1: grounding-mode — no-signals entry with run_grounding true → no drift (SP2 not called)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "sp3-acceptance-gm1-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "GM-1 grounding-mode no-signals test entry for SP3 acceptance.",
        // No evidence_code_ref → SP1 returns kind: no-signals → fast-path skip
        // run_grounding: true doesn't matter; SP2 is never called because the entry is skipped
      });

      const result = await metaStateQueryDriftTool.handler({ run_grounding: true });
      assert.strictEqual(result.drift_count, 0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // GM-2: Grounding-mode — mechanism_check: true with drifted hash → drift with investigate
  // (active-uncertain + drifted → investigate per case 5 dominating)
  test("GM-2: grounding-mode — mechanism_check: true with drifted hash on code-only entry → drift with investigate", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "sp3-acceptance-gm2-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const srcFile = join(tempDir, "src.js");
      writeFileSync(srcFile, "// current content\n", "utf8");

      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "GM-2 grounding-mode drifted hash test entry for SP3 acceptance.",
        evidence_code_ref: "src.js",
        evidence_test: "missing.test.js", // missing test → SP1 says active-uncertain
        mechanism_check: true,
        // Wrong fingerprint → SP2 will detect hash_mismatch → drifted
        code_fingerprint: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      });

      // run_grounding: true → SP2 says drifted (hash mismatch); SP1 says active-uncertain
      // Case 5 dominates: active-uncertain → investigate
      const result = await metaStateQueryDriftTool.handler({ run_grounding: true });
      assert.strictEqual(result.drift_count, 1);
      const ev = result.drift_events[0];
      assert.strictEqual(ev.recommendation, "investigate");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });
});
