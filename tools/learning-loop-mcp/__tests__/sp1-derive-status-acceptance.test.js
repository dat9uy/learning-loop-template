import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateDeriveStatusTool } from "../tools/meta-state-derive-status-tool.js";
import { readRegistry } from "../core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";

describe("SP1 derive_status acceptance", () => {
  const originalEnv = process.env.GATE_ROOT;

  test("acceptance: meta_state_derive_status on the source-ref-validator finding returns resolved-by-mechanism + drift: true", async () => {
    const root = resolveRoot();
    const entries = readRegistry(root);
    const realEntry = entries.find((e) =>
      e.entry_kind === "finding" &&
      e.description &&
      e.description.includes("internalization rule")
    );
    assert.ok(realEntry, "Expected to find the source-ref-validator finding in meta-state.jsonl");

    // Use a temp dir so the tool does not mutate the production gate log.
    // Copy the entry and create the referenced file in the temp dir.
    const tempDir = mkdtempSync(join(tmpdir(), "sp1-acceptance-finding-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const codeRef = realEntry.evidence?.code_ref || realEntry.evidence_code_ref;
      assert.ok(codeRef, "Expected the finding to have a code_ref");

      // Recreate the code_ref path in temp dir
      const refPath = join(tempDir, codeRef);
      mkdirSync(join(tempDir, "tools", "learning-loop-mcp", "lib"), { recursive: true });
      writeFileSync(refPath, "// real file exists", "utf8");

      // Write the entry to temp registry
      writeFileSync(join(tempDir, "meta-state.jsonl"), JSON.stringify(realEntry) + "\n", "utf8");

      const result = await metaStateDeriveStatusTool.handler({ id: realEntry.id });
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

  test("acceptance: meta_state_derive_status on the SP0 self-log change-log entry returns the fast-path response", async () => {
    const root = resolveRoot();
    const entries = readRegistry(root);
    const realEntry = entries.find((e) =>
      e.entry_kind === "change-log" &&
      e.change_target === "tools/learning-loop-mcp/tools/meta-state-log-change-tool.js"
    );
    assert.ok(realEntry, "Expected to find the SP0 self-log change-log entry in meta-state.jsonl");

    const tempDir = mkdtempSync(join(tmpdir(), "sp1-acceptance-changelog-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "meta-state.jsonl"), JSON.stringify(realEntry) + "\n", "utf8");

      const result = await metaStateDeriveStatusTool.handler({ id: realEntry.id });
      const parsed = JSON.parse(result.content[0].text);

      assert.strictEqual(parsed.derivation.kind, "no-signals");
      assert.strictEqual(parsed.derived_status, "active-no-signal");
      assert.strictEqual(parsed.drift, false);
      assert.strictEqual(parsed.recommendation, "no_action");
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        process.env.GATE_ROOT = originalEnv;
      }
    }
  });
});
