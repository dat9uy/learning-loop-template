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

  // AT-1: Acceptance — real SP1-resolved finding → drift with recommendation: resolve
  test("AT-1: acceptance — SP1-resolved finding on real codebase → drift with recommendation resolve", async () => {
    const root = resolveRoot();
    const entries = readRegistry(root);
    // Find the source-ref-validator finding (mirrors SP1 acceptance test)
    const realEntry = entries.find((e) =>
      e.entry_kind === "finding" &&
      e.description &&
      e.description.includes("internalization rule")
    );
    assert.ok(realEntry, "Expected to find the source-ref-validator finding in meta-state.jsonl");

    const tempDir = mkdtempSync(join(tmpdir(), "sp3-acceptance-1-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const codeRef = realEntry.evidence?.code_ref || realEntry.evidence_code_ref;
      assert.ok(codeRef, "Expected the finding to have a code_ref");

      // Recreate the code_ref path in temp dir so SP1 returns resolved-by-mechanism
      const refPath = join(tempDir, codeRef);
      mkdirSync(join(tempDir, "tools", "learning-loop-mcp", "lib"), { recursive: true });
      writeFileSync(refPath, "// real file exists", "utf8");
      // Recreate the test file path too if it was referenced
      if (realEntry.evidence_test) {
        const testPath = join(tempDir, realEntry.evidence_test);
        mkdirSync(join(tempDir, "tools", "learning-loop-mcp", "__tests__"), { recursive: true });
        writeFileSync(testPath, "// real test file exists", "utf8");
      }

      // Write the entry to temp registry (preserve entry as-is)
      writeFileSync(join(tempDir, "meta-state.jsonl"), JSON.stringify(realEntry) + "\n", "utf8");

      const result = await metaStateQueryDriftTool.handler({});
      assert.strictEqual(result.drift_count, 1);
      const ev = result.drift_events[0];
      assert.strictEqual(ev.id, realEntry.id);
      assert.strictEqual(ev.derived_status, "resolved-by-mechanism");
      assert.strictEqual(ev.recommendation, "resolve");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // AT-2: Acceptance — real stable finding → no drift
  test("AT-2: acceptance — stable SP1 finding on real codebase → no drift event", async () => {
    const root = resolveRoot();
    const entries = readRegistry(root);
    // Find the SP1 self-log change-log entry (kind: no-signals → fast path skip → no drift)
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
      assert.strictEqual(result.drift_count, 0);
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
