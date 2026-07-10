import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as pathResolve } from "node:path";
import { pathToFileURL } from "node:url";

import { PathContainmentError, clearRealpathCache } from "../../core/path-containment.js";
import { checkGrounding } from "../../core/check-grounding.js";
import { deriveStatus } from "../../core/derive-status.js";
import { runVerification } from "../../core/verification-runner.js";
import { metaStateRefreshFileIndexTool } from "../../tools/handlers/meta-state-refresh-file-index-tool.js";
import { metaStateCheckGroundingTool } from "../../tools/handlers/meta-state-check-grounding-tool.js";
import { metaStateDeriveStatusTool } from "../../tools/handlers/meta-state-derive-status-tool.js";
import { metaStateReportTool } from "../../tools/handlers/meta-state-report-tool.js";

const projectRoot = pathResolve(process.cwd());

async function importGateLogic() {
  const gateLogicPath = pathToFileURL(join(projectRoot, "tools/learning-loop-mastra/core/gate-logic.js")).href;
  return await import(gateLogicPath);
}

async function importMetaState() {
  const corePath = pathToFileURL(join(projectRoot, "tools/learning-loop-mastra/core/meta-state.js")).href;
  return await import(corePath);
}

const ORIGINAL_GATE_ROOT = process.env.GATE_ROOT;

function withGateRoot(tempDir, fn) {
  return async () => {
    process.env.GATE_ROOT = tempDir;
    try {
      return await fn();
    } finally {
      if (ORIGINAL_GATE_ROOT === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = ORIGINAL_GATE_ROOT;
      clearRealpathCache();
    }
  };
}

describe("audit-site migrations — path containment rejection", () => {
  // ---- Site 1: meta-state-refresh-file-index-tool.js (refresh_file_index path escape) ----
  test("refresh_file_index_rejects_traversal (evidence_code_ref escape)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "audit-refresh-"));
    try {
      process.env.GATE_ROOT = tempDir;
      // Register a finding with a traversal evidence_code_ref. The report tool
      // stores it as-is; the rejection happens at refresh time when the path
      // is resolved.
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Traversal test for refresh file index.",
        evidence_code_ref: "../../../etc/passwd",
        mechanism_check: true,
      });
      // The refresh tool takes the cited path directly (not the finding id).
      await assert.rejects(
        () => metaStateRefreshFileIndexTool.handler({ path: "../../../etc/passwd" }),
        (err) => err instanceof PathContainmentError && err.reason === "outside_root",
      );
    } finally {
      delete process.env.GATE_ROOT;
      clearRealpathCache();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ---- Site 1 (ENOENT preservation): a missing evidence file INSIDE root
  // returns the documented `code_missing` JSON response — NOT a thrown
  // PathContainmentError. The escape case (above) throws; the missing-file
  // case (here) is a legitimate "code-missing" result. Mirrors the ENOENT
  // preservation at the other 6 audit sites.
  test("refresh_file_index_missing_file_inside_root_returns_code_missing (no throw)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "audit-refresh-missing-"));
    try {
      process.env.GATE_ROOT = tempDir;
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Missing-file test for refresh file index.",
        evidence_code_ref: "does-not-exist.js",
        mechanism_check: true,
      });
      const result = await metaStateRefreshFileIndexTool.handler({ path: "does-not-exist.js" });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.error, "code_missing");
      assert.strictEqual(parsed.path, "does-not-exist.js");
      assert.strictEqual(parsed.cache_hit, false);
    } finally {
      delete process.env.GATE_ROOT;
      clearRealpathCache();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ---- Site 2: check-grounding.js:142 ----
  test("check_grounding_rejects_traversal (evidence_code_ref escape)", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "audit-cg-"));
    try {
      const entry = {
        id: "meta-260702T0000Z-traversal",
        entry_kind: "finding",
        status: "open",
        evidence_code_ref: "../../../etc/passwd",
        mechanism_check: true,
      };
      assert.throws(
        () => checkGrounding(entry, { root: tempDir, now: () => 1700000000000 }),
        (err) => err instanceof PathContainmentError && err.reason === "outside_root",
      );
    } finally {
      clearRealpathCache();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ---- Site 3: derive-status.js:88 (checkExists) ----
  test("derive_status_rejects_traversal (evidence_code_ref escape)", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "audit-ds-"));
    try {
      const entry = {
        id: "meta-260702T0000Z-traversal-ds",
        entry_kind: "finding",
        status: "open",
        evidence_code_ref: "../../../etc/passwd",
        mechanism_check: true,
      };
      assert.throws(
        () => deriveStatus(entry, { root: tempDir, now: () => 1700000000000 }),
        (err) => err instanceof PathContainmentError && err.reason === "outside_root",
      );
    } finally {
      clearRealpathCache();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("derive_status_rejects_traversal (evidence_test escape)", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "audit-ds-test-"));
    try {
      const entry = {
        id: "meta-260702T0000Z-traversal-ds-test",
        entry_kind: "finding",
        status: "open",
        evidence_test: "../../../etc/passwd",
        mechanism_check: true,
      };
      assert.throws(
        () => deriveStatus(entry, { root: tempDir, now: () => 1700000000000 }),
        (err) => err instanceof PathContainmentError && err.reason === "outside_root",
      );
    } finally {
      clearRealpathCache();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("derive_status_preserves_missing_file_returns_false (no throw on ENOENT inside root)", () => {
    // Behavior preservation: a missing file inside root must yield
    // code_ref_exists: false / kind: code-missing — NOT throw. This is the
    // legitimate "code-missing" derivation; only escapes throw.
    const tempDir = mkdtempSync(join(tmpdir(), "audit-ds-missing-"));
    try {
      const entry = {
        id: "meta-260702T0000Z-missing",
        entry_kind: "finding",
        status: "open",
        evidence_code_ref: "missing.js",
        mechanism_check: true,
      };
      const result = deriveStatus(entry, { root: tempDir, now: () => 1700000000000 });
      assert.strictEqual(result.derivation.kind, "code-missing");
      assert.strictEqual(result.derivation.signals.code_ref_exists, false);
    } finally {
      clearRealpathCache();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ---- Site 4: gate-logic.js:672 (checkResolutionEvidence) ----
  test("gate_logic_resolution_evidence_rejects_traversal", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "audit-gate-"));
    try {
      const core = await importMetaState();
      const id = core.generateId("traversal-finding");
      await core.writeEntry(tempDir, {
        id,
        entry_kind: "finding",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        subtype: "test",
        description: "Traversal test for resolution evidence.",
        evidence_code_ref: "../../../etc/passwd",
        status: "open",
        mechanism_check: true,
      });
      const { checkResolutionEvidence } = await importGateLogic();
      const rule = { id: "rule-no-orphaned-evidence", pattern: "test-session-id" };
      assert.throws(
        () => checkResolutionEvidence(rule, tempDir),
        (err) => err instanceof PathContainmentError && err.reason === "outside_root",
      );
    } finally {
      clearRealpathCache();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ---- Site 5a: meta-state-check-grounding-tool.js:17 (runTest) ----
  test("check_grounding_tool_run_test_rejects_traversal (evidence_test escape)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "audit-cgt-"));
    try {
      process.env.GATE_ROOT = tempDir;
      writeFileSync(join(tempDir, "src.js"), "// code");
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Traversal test for check-grounding tool.",
        evidence_code_ref: "src.js",
        evidence_test: "../../../etc/passwd",
        mechanism_check: true,
      });
      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const id = JSON.parse(raw.trim().split("\n")[0]).id;
      await assert.rejects(
        () => metaStateCheckGroundingTool.handler({ id, run_tests: true }),
        (err) => err instanceof PathContainmentError && err.reason === "outside_root",
      );
    } finally {
      delete process.env.GATE_ROOT;
      clearRealpathCache();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ---- Site 5b: meta-state-derive-status-tool.js:17 (runTest) ----
  test("derive_status_tool_run_test_rejects_traversal (evidence_test escape)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "audit-dst-"));
    try {
      process.env.GATE_ROOT = tempDir;
      writeFileSync(join(tempDir, "src.js"), "// code");
      const entry = {
        id: "meta-260702T0000Z-dst-traversal",
        entry_kind: "finding",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        subtype: "test",
        description: "Traversal test for derive-status tool.",
        status: "open",
        evidence_code_ref: "src.js",
        evidence_test: "../../../etc/passwd",
        created_at: "2026-07-02T00:00:00.000Z",
      };
      writeFileSync(join(tempDir, "meta-state.jsonl"), JSON.stringify(entry) + "\n", "utf8");
      await assert.rejects(
        () => metaStateDeriveStatusTool.handler({ id: entry.id, run_tests: true }),
        (err) => err instanceof PathContainmentError && err.reason === "outside_root",
      );
    } finally {
      delete process.env.GATE_ROOT;
      clearRealpathCache();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ---- Site 7: verification-runner.js:34 ----
  test("verification_runner_rejects_out_of_tree_cwd", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "audit-vr-"));
    try {
      assert.throws(
        () => runVerification(tempDir, { cmd: "echo", args: ["ok"], cwd: "../../../etc" }),
        (err) => err instanceof PathContainmentError && err.reason === "outside_root",
      );
    } finally {
      clearRealpathCache();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ---- Legitimate paths smoke ----
  test("legitimate_paths_still_work across migrated sites", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "audit-legit-"));
    try {
      process.env.GATE_ROOT = tempDir;
      writeFileSync(join(tempDir, "src.js"), "// code");
      // Site 2 + 3: checkGrounding and deriveStatus with legit relative path
      const entry = {
        id: "meta-260702T0000Z-legit",
        entry_kind: "finding",
        status: "open",
        evidence_code_ref: "src.js",
        mechanism_check: true,
      };
      const cg = checkGrounding(entry, { root: tempDir, now: () => 1700000000000 });
      assert.strictEqual(cg.status, "grounded");
      const ds = deriveStatus(entry, { root: tempDir, now: () => 1700000000000 });
      // No positive test_passed signal → code-only (active-uncertain).
      assert.strictEqual(ds.derivation.kind, "code-only");

      // Site 7: verification-runner with legit cwd inside root
      mkdirSync(join(tempDir, "subdir"), { recursive: true });
      const vr = runVerification(tempDir, { cmd: "echo", args: ["ok"], cwd: "subdir" });
      assert.strictEqual(vr.status, "passed");

      // Site 1: refresh file index with legit evidence_code_ref
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Legit smoke test for audit sites.",
        evidence_code_ref: "src.js",
        mechanism_check: true,
      });
      const refresh = await metaStateRefreshFileIndexTool.handler({ path: "src.js" });
      const parsed = JSON.parse(refresh.content[0].text);
      assert.strictEqual(parsed.status, "refreshed");
    } finally {
      delete process.env.GATE_ROOT;
      clearRealpathCache();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ---- LOCK: grep guard — no migrated user-path pattern remains ----
  test("grep guard: no `isAbsolute(...) ? ... : join(root,` user-path pattern at audit sites", () => {
    const siteFiles = [
      "tools/learning-loop-mastra/tools/handlers/meta-state-refresh-file-index-tool.js",
      "tools/learning-loop-mastra/core/check-grounding.js",
      "tools/learning-loop-mastra/core/derive-status.js",
      "tools/learning-loop-mastra/core/gate-logic.js",
      "tools/learning-loop-mastra/tools/handlers/meta-state-check-grounding-tool.js",
      "tools/learning-loop-mastra/tools/handlers/meta-state-derive-status-tool.js",
      "tools/learning-loop-mastra/core/verification-runner.js",
    ];
    // The migrated patterns we expect to be GONE after migration. Each is the
    // exact pre-migration user-path resolution line.
    const bannedPatterns = [
      "isAbsolute(strippedCodeRef) ? strippedCodeRef : join(root, strippedCodeRef)",
      "isAbsolute(strippedRef) ? strippedRef : join(root, strippedRef)",
      "isAbsolute(path) ? path : join(root, path)",
      "isAbsolute(codeRef) ? codeRef : join(root, stripEvidenceAnchor(codeRef))",
      "isAbsolute(testPath) ? testPath : join(root, testPath)",
      "isAbsolute(step.cwd) ? step.cwd : join(root, step.cwd)",
    ];
    for (const rel of siteFiles) {
      const abs = join(projectRoot, rel);
      const src = readFileSync(abs, "utf8");
      for (const pat of bannedPatterns) {
        assert.ok(
          !src.includes(pat),
          `Banned user-path pattern still present in ${rel}: ${pat}`,
        );
      }
    }
  });
});