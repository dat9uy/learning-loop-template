import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateDeriveStatusTool } from "../../tools/legacy/meta-state-derive-status-tool.js";
import { readRegistry } from "../../core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";

describe("SP1 derive_status acceptance", () => {
  const originalEnv = process.env.GATE_ROOT;

  test("acceptance: meta_state_derive_status on an active code-pointed finding returns resolved-by-mechanism + drift: true", async () => {
    // Use a synthetic active finding so this acceptance test is not coupled to
    // the real registry's lifecycle. The real "internalization rule" finding was
    // resolved by plan 260606; this test locks the derive_status contract for
    // any active code-pointed finding independently of real-registry state.
    const codeRef = "tools/learning-loop-mastra/core/lib/source-ref-validator.js";
    const syntheticEntry = {
      id: "meta-260606T0000Z-sp1-acceptance-synthetic",
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Synthetic acceptance finding: internalization rule coverage.",
      evidence: { code_ref: codeRef },
      evidence_code_ref: codeRef,
      mechanism_check: true,
      status: "open",
      created_at: "2026-06-06T00:00:00Z",
      version: 0,
    };

    const tempDir = mkdtempSync(join(tmpdir(), "sp1-acceptance-finding-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const refPath = join(tempDir, codeRef);
      mkdirSync(join(tempDir, "tools", "learning-loop-mastra", "core", "lib"), { recursive: true });
      writeFileSync(refPath, "// real file exists", "utf8");
      writeFileSync(join(tempDir, "meta-state.jsonl"), JSON.stringify(syntheticEntry) + "\n", "utf8");

      const result = await metaStateDeriveStatusTool.handler({ id: syntheticEntry.id });
      const parsed = JSON.parse(result.content[0].text);

      assert.strictEqual(parsed.derived_status, "resolved-by-mechanism");
      assert.strictEqual(parsed.derivation.kind, "mechanism-shipped");
      assert.strictEqual(parsed.recommendation, "resolve");
      assert.strictEqual(parsed.drift, true);
      assert.strictEqual(parsed.derivation.signals.code_ref_exists, true);
      assert.strictEqual(parsed.derivation.signals.code_ref_path, codeRef);
      assert.strictEqual(parsed.derivation.signals.test_passed, null);
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        process.env.GATE_ROOT = originalEnv;
      }
    }
  });

  test("acceptance: meta_state_derive_status on the SP0 self-log change-log entry evaluates normally post-migration", async () => {
    const root = resolveRoot();
    const entries = readRegistry(root);
    const realEntry = entries.find((e) =>
      e.entry_kind === "change-log" &&
      typeof e.change_target === "string" &&
      e.change_target.includes("meta-state-log-change-tool.js")
    );
    assert.ok(realEntry, "Expected to find the SP0 self-log change-log entry in meta-state.jsonl");

    const tempDir = mkdtempSync(join(tmpdir(), "sp1-acceptance-changelog-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "meta-state.jsonl"), JSON.stringify(realEntry) + "\n", "utf8");

      const result = await metaStateDeriveStatusTool.handler({ id: realEntry.id });
      const parsed = JSON.parse(result.content[0].text);

      // Post-migration: change-log has top-level evidence_code_ref → evaluated normally.
      // Referenced file is not present in tempDir → kind: code-missing → investigate.
      assert.strictEqual(parsed.derivation.kind, "code-missing");
      assert.strictEqual(parsed.derived_status, "active-no-signal");
      assert.strictEqual(parsed.drift, false);
      assert.strictEqual(parsed.recommendation, "investigate");
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        process.env.GATE_ROOT = originalEnv;
      }
    }
  });
});
