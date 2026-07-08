import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateDeriveStatusTool } from "../../tools/handlers/meta-state-derive-status-tool.js";
import { metaStateLogChangeTool } from "../../tools/handlers/meta-state-log-change-tool.js";

describe("meta_state_derive_status tool", () => {
  const originalEnv = process.env.GATE_ROOT;

  function getGateLogPath(tempDir) {
    return join(tempDir, ".claude", "coordination", "gate-log.jsonl");
  }

  test("reads registry, finds entry by id, calls deriveStatus with loaded codeContext", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "derive-status-tool-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const entry = {
        id: "meta-260601T0000Z-test-finding-for-derive-status-tool-lookup",
        entry_kind: "finding",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Test finding for derive status tool lookup.",
        status: "open",
        evidence_code_ref: "src.js",
        created_at: "2026-06-01T06:39:41.872Z",
      };
      writeFileSync(join(tempDir, "meta-state.jsonl"), JSON.stringify(entry) + "\n", "utf8");

      // Create the referenced file so derivation has a signal
      writeFileSync(join(tempDir, "src.js"), "// code");

      const result = await metaStateDeriveStatusTool.handler({ id: entry.id });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.error, undefined);
      assert.ok(parsed.id);
      assert.ok(parsed.derived_status);
      assert.ok(parsed.derivation);
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        if (originalEnv === undefined) {
          delete process.env.GATE_ROOT;
        } else {
          if (originalEnv === undefined) {
            delete process.env.GATE_ROOT;
          } else {
            process.env.GATE_ROOT = originalEnv;
          }
        }
      }
      }
    }
  });

  test("returns locked shape on a known derivable finding", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "derive-status-known-"));
    process.env.GATE_ROOT = tempDir;
    try {
      // Write the referenced files (use the post-Plan-4 paths)
      const srcDir = join(tempDir, "tools", "learning-loop-mastra", "core", "lib");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "source-ref-validator.js"), "// code");
      const testDir = join(tempDir, "tools", "learning-loop-mastra", "__tests__", "legacy-mcp");
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, "source-ref-validator.test.js"), "// test");

      // Write a finding entry matching the acceptance-test shape
      const entry = {
        id: "meta-260601T1339Z-test-known-finding",
        entry_kind: "finding",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Known derivable finding for acceptance test simulation.",
        status: "open",
        evidence_code_ref: "tools/learning-loop-mastra/core/lib/source-ref-validator.js",
        evidence_test: "tools/learning-loop-mastra/__tests__/legacy-mcp/source-ref-validator.test.js",
        created_at: "2026-06-01T06:39:41.872Z",
      };
      writeFileSync(join(tempDir, "meta-state.jsonl"), JSON.stringify(entry) + "\n", "utf8");

      const result = await metaStateDeriveStatusTool.handler({ id: entry.id });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.derived_status, "resolved-by-mechanism");
      assert.strictEqual(parsed.derivation.kind, "mechanism-shipped");
      assert.strictEqual(parsed.recommendation, "re_verify");
      assert.strictEqual(parsed.drift, true);
      assert.strictEqual(parsed.derivation.signals.code_ref_exists, true);
      assert.strictEqual(parsed.derivation.signals.test_file_exists, true);
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        if (originalEnv === undefined) {
          delete process.env.GATE_ROOT;
        } else {
          if (originalEnv === undefined) {
            delete process.env.GATE_ROOT;
          } else {
            process.env.GATE_ROOT = originalEnv;
          }
        }
      }
    }
  });

  test("change-log with no evidence_code_ref returns kind: no-signals (post-migration, no entry-kind fast path)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "derive-status-changelog-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateLogChangeTool.handler({
        change_dimension: "surface",
        change_target: "test/tool.js",
        change_diff: { added: ["x"], removed: [], changed: [] },
        reason: "Test change-log entry for derive status (no evidence_code_ref → no-signals).",
      });

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const id = JSON.parse(raw.trim().split("\n")[0]).id;

      const result = await metaStateDeriveStatusTool.handler({ id });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.derivation.kind, "no-signals");
      assert.strictEqual(parsed.derived_status, "active-no-signal");
      assert.strictEqual(parsed.drift, false);
      assert.strictEqual(parsed.recommendation, "no_action");
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        if (originalEnv === undefined) {
          delete process.env.GATE_ROOT;
        } else {
          if (originalEnv === undefined) {
            delete process.env.GATE_ROOT;
          } else {
            process.env.GATE_ROOT = originalEnv;
          }
        }
      }
    }
  });

  test("returns error for missing entry id (entry_not_found)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "derive-status-missing-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const result = await metaStateDeriveStatusTool.handler({ id: "does-not-exist" });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.error, "entry_not_found");
      assert.strictEqual(parsed.id, "does-not-exist");
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        if (originalEnv === undefined) {
          delete process.env.GATE_ROOT;
        } else {
          if (originalEnv === undefined) {
            delete process.env.GATE_ROOT;
          } else {
            process.env.GATE_ROOT = originalEnv;
          }
        }
      }
    }
  });

  test("respects run_tests: true and populates signals.test_passed from test runner exit code", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "derive-status-runtests-"));
    process.env.GATE_ROOT = tempDir;
    try {
      // Create a minimal package.json so pnpm test works in temp dir
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "tmp", version: "1.0.0", type: "module", scripts: { test: "node" } }),
        "utf8"
      );
      // Create a deliberately failing script (not node:test, to avoid recursive-test skip)
      writeFileSync(
        join(tempDir, "failing.test.js"),
        `throw new Error("deliberate failure");\n`,
        "utf8"
      );

      const entry = {
        id: "meta-260601T0000Z-runtests-finding",
        entry_kind: "finding",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Test finding for run_tests path.",
        status: "open",
        evidence_test: "failing.test.js",
        created_at: "2026-06-01T06:39:41.872Z",
      };
      writeFileSync(join(tempDir, "meta-state.jsonl"), JSON.stringify(entry) + "\n", "utf8");

      const result = await metaStateDeriveStatusTool.handler({ id: entry.id, run_tests: true });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.derivation.signals.test_passed, false);
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        if (originalEnv === undefined) {
          delete process.env.GATE_ROOT;
        } else {
          if (originalEnv === undefined) {
            delete process.env.GATE_ROOT;
          } else {
            process.env.GATE_ROOT = originalEnv;
          }
        }
      }
    }
  });

  test("respects run_tests: false and sets signals.test_passed to null", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "derive-status-notests-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.test.js"), "// test");
      const entry = {
        id: "meta-260601T0000Z-notests-finding",
        entry_kind: "finding",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Test finding for run_tests false path.",
        status: "open",
        evidence_test: "src.test.js",
        created_at: "2026-06-01T06:39:41.872Z",
      };
      writeFileSync(join(tempDir, "meta-state.jsonl"), JSON.stringify(entry) + "\n", "utf8");

      const result = await metaStateDeriveStatusTool.handler({ id: entry.id, run_tests: false });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.derivation.signals.test_passed, null);
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        if (originalEnv === undefined) {
          delete process.env.GATE_ROOT;
        } else {
          if (originalEnv === undefined) {
            delete process.env.GATE_ROOT;
          } else {
            process.env.GATE_ROOT = originalEnv;
          }
        }
      }
    }
  });

  test("appends a gate log line on each call", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "derive-status-gatelog-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const entry = {
        id: "meta-260601T0000Z-gatelog-finding",
        entry_kind: "finding",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Test finding for gate log line.",
        status: "open",
        created_at: "2026-06-01T06:39:41.872Z",
      };
      writeFileSync(join(tempDir, "meta-state.jsonl"), JSON.stringify(entry) + "\n", "utf8");

      await metaStateDeriveStatusTool.handler({ id: entry.id });
      const gateLogRaw = readFileSync(getGateLogPath(tempDir), "utf8");
      const lines = gateLogRaw.split("\n").filter((l) => l.trim() !== "");
      assert.strictEqual(lines.length, 1);
      const logEntry = JSON.parse(lines[0]);
      assert.strictEqual(logEntry.tool, "meta_state_derive_status");
      assert.strictEqual(logEntry.id, entry.id);
      assert.ok("derived_status" in logEntry);
      assert.ok("drift" in logEntry);
      assert.ok("recommendation" in logEntry);
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        if (originalEnv === undefined) {
          delete process.env.GATE_ROOT;
        } else {
          if (originalEnv === undefined) {
            delete process.env.GATE_ROOT;
          } else {
            process.env.GATE_ROOT = originalEnv;
          }
        }
      }
    }
  });

  test("handles valid GATE_ROOT without other env vars", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "derive-status-env-"));
    const priorGateRoot = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      const entry = {
        id: "meta-260601T0000Z-env-finding",
        entry_kind: "finding",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Test finding for env handling.",
        status: "open",
        created_at: "2026-06-01T06:39:41.872Z",
      };
      writeFileSync(join(tempDir, "meta-state.jsonl"), JSON.stringify(entry) + "\n", "utf8");

      const result = await metaStateDeriveStatusTool.handler({ id: entry.id });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.id, entry.id);
      assert.ok(parsed.derived_status);
    } finally {
      process.env.GATE_ROOT = priorGateRoot;
    }
  });

  test("uses id as the only lookup key (not description substring)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "derive-status-idonly-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const entry = {
        id: "meta-260601T0000Z-long-description-finding",
        entry_kind: "finding",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "This is a very long description with many words to test id-only lookup behavior.",
        status: "open",
        created_at: "2026-06-01T06:39:41.872Z",
      };
      writeFileSync(join(tempDir, "meta-state.jsonl"), JSON.stringify(entry) + "\n", "utf8");

      // Call with a description substring instead of the real id
      const result = await metaStateDeriveStatusTool.handler({ id: "very-long-description" });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.error, "entry_not_found");
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        if (originalEnv === undefined) {
          delete process.env.GATE_ROOT;
        } else {
          if (originalEnv === undefined) {
            delete process.env.GATE_ROOT;
          } else {
            process.env.GATE_ROOT = originalEnv;
          }
        }
      }
    }
  });

  test("writes a gate-log line for a change-log entry (post-migration, no entry-kind fast path)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "derive-status-changelog-gatelog-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateLogChangeTool.handler({
        change_dimension: "surface",
        change_target: "test/fast.js",
        change_diff: { added: ["x"], removed: [], changed: [] },
        reason: "Test change-log entry for gate log (no evidence_code_ref → no-signals).",
      });

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const id = JSON.parse(raw.trim().split("\n")[0]).id;

      await metaStateDeriveStatusTool.handler({ id });
      const gateLogRaw = readFileSync(getGateLogPath(tempDir), "utf8");
      const lines = gateLogRaw.split("\n").filter((l) => l.trim() !== "");
      assert.strictEqual(lines.length, 2); // log_change + derive_status
      const deriveLog = lines.find((l) => JSON.parse(l).tool === "meta_state_derive_status");
      assert.ok(deriveLog);
      const logEntry = JSON.parse(deriveLog);
      assert.strictEqual(logEntry.derived_status, "active-no-signal");
      assert.strictEqual(logEntry.drift, false);
      assert.strictEqual(logEntry.recommendation, "no_action");
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        if (originalEnv === undefined) {
          delete process.env.GATE_ROOT;
        } else {
          if (originalEnv === undefined) {
            delete process.env.GATE_ROOT;
          } else {
            process.env.GATE_ROOT = originalEnv;
          }
        }
      }
    }
  });
});
