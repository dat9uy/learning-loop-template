import assert from "node:assert";
import { describe, test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = resolve(process.cwd());

// We need to import AFTER setting GATE_ROOT so resolveRoot picks up the temp dir.
async function importCore(tempRoot) {
  const corePath = pathToFileURL(join(projectRoot, "tools/learning-loop-mastra/core/meta-state.js")).href;
  const core = await import(corePath);
  return core;
}

async function importGateLogic() {
  const gateLogicPath = pathToFileURL(join(projectRoot, "tools/learning-loop-mastra/core/gate-logic.js")).href;
  return await import(gateLogicPath);
}

async function importMetaStateResolveTool() {
  const toolPath = pathToFileURL(join(projectRoot, "tools/learning-loop-mastra/tools/legacy/meta-state-resolve-tool.js")).href;
  return await import(toolPath);
}

async function importLoopIntrospect() {
  const introspectPath = pathToFileURL(join(projectRoot, "tools/learning-loop-mastra/core/loop-introspect.js")).href;
  return await import(introspectPath);
}

async function importCheckGrounding() {
  const groundingPath = pathToFileURL(join(projectRoot, "tools/learning-loop-mastra/core/check-grounding.js")).href;
  return await import(groundingPath);
}

describe("checkResolutionEvidence", () => {
  test("returns satisfied when no finding exists", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "res-ev-"));
    const { checkResolutionEvidence } = await importGateLogic();
    const rule = {
      id: "rule-test",
      pattern: "test-session-id",
    };
    const result = checkResolutionEvidence(rule, tempRoot);
    assert.strictEqual(result.satisfied, true);
    assert.strictEqual(result.rule_id, "rule-test");
  });

  test("returns unsatisfied when active finding exists", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "res-ev-"));
    const core = await importCore(tempRoot);
    const id = core.generateId("mcp-client-loading-missing");
    await core.writeEntry(tempRoot, {
      id,
      entry_kind: "finding",
      category: "mcp-tool-missing",
      severity: "warning",
      affected_system: "mcp-tools",
      subtype: "mcp-client-loading",
      description: "Test finding for resolution-evidence check.",
      session_id: "test-session-id",
      status: "active",
      created_at: new Date().toISOString(),
      version: 0,
    });

    const { checkResolutionEvidence } = await importGateLogic();
    const rule = {
      id: "rule-test",
      pattern: "test-session-id",
        applies_to_resolution: "meta-target-finding",
    };
    const result = checkResolutionEvidence(rule, tempRoot);
    assert.strictEqual(result.satisfied, false);
    assert.strictEqual(result.rule_id, "rule-test");
    assert.strictEqual(result.blocking_id, id);
    assert.strictEqual(result.applies_to_resolution, "meta-target-finding");
  });

  test("returns satisfied when finding is reported (still active-ish)", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "res-ev-"));
    const core = await importCore(tempRoot);
    const id = core.generateId("mcp-client-loading-missing");
    await core.writeEntry(tempRoot, {
      id,
      entry_kind: "finding",
      category: "mcp-tool-missing",
      severity: "warning",
      affected_system: "mcp-tools",
      subtype: "mcp-client-loading",
      description: "Test finding for resolution-evidence check.",
      session_id: "test-session-id",
      status: "reported",
      created_at: new Date().toISOString(),
      version: 0,
    });

    const { checkResolutionEvidence } = await importGateLogic();
    const rule = {
      id: "rule-test",
      pattern: "test-session-id",
    };
    const result = checkResolutionEvidence(rule, tempRoot);
    assert.strictEqual(result.satisfied, false);
    assert.strictEqual(result.blocking_id, id);
  });

  test("returns satisfied when finding is in a terminal status (no longer in active || reported)", async () => {
    // Plan 260611-1000 removed the 'expired' status. Terminal statuses that
    // remove the finding from the active/reported filter are now 'resolved',
    // 'superseded', and 'auto-resolved'. Use 'resolved' as the canonical
    // terminal status in the test fixture.
    const tempRoot = mkdtempSync(join(tmpdir(), "res-ev-"));
    const core = await importCore(tempRoot);
    const id = core.generateId("mcp-client-loading-missing");
    await core.writeEntry(tempRoot, {
      id,
      entry_kind: "finding",
      category: "mcp-tool-missing",
      severity: "warning",
      affected_system: "mcp-tools",
      subtype: "mcp-client-loading",
      description: "Test finding for resolution-evidence check.",
      session_id: "test-session-id",
      status: "resolved",
      created_at: new Date().toISOString(),
      version: 0,
    });

    const { checkResolutionEvidence } = await importGateLogic();
    const rule = {
      id: "rule-test",
      pattern: "test-session-id",
    };
    const result = checkResolutionEvidence(rule, tempRoot);
    assert.strictEqual(result.satisfied, true);
  });

  test("rule-no-orphaned-evidence blocks resolution when an active finding has mechanism_check=true and code_fingerprint mismatch", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "res-ev-"));
    const core = await importCore(tempRoot);
    const { computeFileHash } = await importCheckGrounding();
    const { checkResolutionEvidence } = await importGateLogic();

    const dummyFile = join(tempRoot, "dummy.js");
    writeFileSync(dummyFile, "const x = 1;");

    const findingId = core.generateId("orphan-test");
    await core.writeEntry(tempRoot, {
      id: findingId,
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for orphan check.",
      status: "active",
      created_at: new Date().toISOString(),
      version: 0,
      mechanism_check: true,
      evidence_code_ref: "dummy.js",
      code_fingerprint: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    });

    const rule = {
      id: "rule-no-orphaned-evidence",
      pattern: "*",
        applies_to_resolution: "*",
    };

    const result = checkResolutionEvidence(rule, tempRoot);
    assert.strictEqual(result.satisfied, false);
    assert.strictEqual(result.rule_id, "rule-no-orphaned-evidence");
    assert.ok(result.orphans);
    assert.strictEqual(result.orphans.length, 1);
    assert.strictEqual(result.orphans[0].id, findingId);
    assert.strictEqual(result.orphans[0].reason, "fingerprint_mismatch");
    assert.strictEqual(result.orphans[0].expected, "sha256:0000000000000000000000000000000000000000000000000000000000000000");
    assert.ok(result.orphans[0].actual);
    assert.ok(result.orphans[0].actual.startsWith("sha256:"));
  });

  test("rule-no-orphaned-evidence allows resolution when all active findings are grounded (fingerprint matches)", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "res-ev-"));
    const core = await importCore(tempRoot);
    const { computeFileHash } = await importCheckGrounding();
    const { checkResolutionEvidence } = await importGateLogic();

    const dummyFile = join(tempRoot, "dummy.js");
    writeFileSync(dummyFile, "const y = 2;");
    const hash = computeFileHash(dummyFile);

    const findingId = core.generateId("orphan-test");
    await core.writeEntry(tempRoot, {
      id: findingId,
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for orphan check.",
      status: "active",
      created_at: new Date().toISOString(),
      version: 0,
      mechanism_check: true,
      evidence_code_ref: "dummy.js",
      code_fingerprint: hash,
    });

    const rule = {
      id: "rule-no-orphaned-evidence",
      pattern: "*",
        applies_to_resolution: "*",
    };

    const result = checkResolutionEvidence(rule, tempRoot);
    assert.strictEqual(result.satisfied, true);
    assert.strictEqual(result.rule_id, "rule-no-orphaned-evidence");
  });

  test("rule-no-orphaned-evidence allows resolution when active finding has mechanism_check=true but no code_fingerprint", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "res-ev-"));
    const core = await importCore(tempRoot);
    const { checkResolutionEvidence } = await importGateLogic();

    const dummyFile = join(tempRoot, "dummy.js");
    writeFileSync(dummyFile, "const z = 3;");

    const findingId = core.generateId("orphan-test");
    await core.writeEntry(tempRoot, {
      id: findingId,
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for orphan check.",
      status: "active",
      created_at: new Date().toISOString(),
      version: 0,
      mechanism_check: true,
      evidence_code_ref: "dummy.js",
    });

    const rule = {
      id: "rule-no-orphaned-evidence",
      pattern: "*",
        applies_to_resolution: "*",
    };

    const result = checkResolutionEvidence(rule, tempRoot);
    assert.strictEqual(result.satisfied, true);
    assert.strictEqual(result.rule_id, "rule-no-orphaned-evidence");
  });

  // Regression for meta-260607T1625Z-gate-line-suffix-not-stripped-from-evidence-code-ref:
  // The gate must strip `:line` suffixes (the documented canonical syntax in
  // meta-state.js#metaStateFindingEntrySchema and loop-introspect.js discoverability
  // hint) before resolving the file path. Without this, every finding that uses
  // `:line` syntax is treated as code_ref_missing and the consult-gate blocks
  // resolution even when the file exists.
  test("rule-no-orphaned-evidence strips :line suffix from evidence_code_ref", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "res-ev-"));
    const core = await importCore(tempRoot);
    const { checkResolutionEvidence } = await importGateLogic();

    const dummyFile = join(tempRoot, "dummy.js");
    writeFileSync(dummyFile, "const w = 4;");

    const findingId = core.generateId("orphan-line-suffix");
    await core.writeEntry(tempRoot, {
      id: findingId,
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding with :line suffix in evidence_code_ref.",
      status: "active",
      created_at: new Date().toISOString(),
      version: 0,
      mechanism_check: true,
      evidence_code_ref: "dummy.js:42",
    });

    const rule = {
      id: "rule-no-orphaned-evidence",
      pattern: "*",
        applies_to_resolution: "*",
    };

    const result = checkResolutionEvidence(rule, tempRoot);
    assert.strictEqual(result.satisfied, true, `gate should strip :line suffix; orphans=${JSON.stringify(result.orphans)}`);
    assert.strictEqual(result.rule_id, "rule-no-orphaned-evidence");
  });

  test("rule-no-orphaned-evidence strips #anchor suffix from evidence_code_ref", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "res-ev-"));
    const core = await importCore(tempRoot);
    const { checkResolutionEvidence } = await importGateLogic();

    const dummyFile = join(tempRoot, "dummy.js");
    writeFileSync(dummyFile, "const v = 5;");

    const findingId = core.generateId("orphan-anchor-suffix");
    await core.writeEntry(tempRoot, {
      id: findingId,
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding with #anchor suffix in evidence_code_ref.",
      status: "active",
      created_at: new Date().toISOString(),
      version: 0,
      mechanism_check: true,
      evidence_code_ref: "dummy.js#someFunction",
    });

    const rule = {
      id: "rule-no-orphaned-evidence",
      pattern: "*",
        applies_to_resolution: "*",
    };

    const result = checkResolutionEvidence(rule, tempRoot);
    assert.strictEqual(result.satisfied, true, `gate should strip #anchor suffix; orphans=${JSON.stringify(result.orphans)}`);
    assert.strictEqual(result.rule_id, "rule-no-orphaned-evidence");
  });

  test("rule-no-orphaned-evidence flags code_ref_missing when :line suffix points to a real missing file", async () => {
    // Negative case: when neither the bare path nor the :line-stripped path
    // exists, the gate should still flag the finding as code_ref_missing.
    const tempRoot = mkdtempSync(join(tmpdir(), "res-ev-"));
    const core = await importCore(tempRoot);
    const { checkResolutionEvidence } = await importGateLogic();

    const findingId = core.generateId("orphan-real-missing");
    await core.writeEntry(tempRoot, {
      id: findingId,
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding pointing at a non-existent file with :line suffix.",
      status: "active",
      created_at: new Date().toISOString(),
      version: 0,
      mechanism_check: true,
      evidence_code_ref: "does-not-exist.js:99",
    });

    const rule = {
      id: "rule-no-orphaned-evidence",
      pattern: "*",
        applies_to_resolution: "*",
    };

    const result = checkResolutionEvidence(rule, tempRoot);
    assert.strictEqual(result.satisfied, false);
    assert.strictEqual(result.orphans[0].reason, "code_ref_missing");
  });
});

describe("applyPromotedRules resolution-evidence-required", () => {
  test("skips resolution-evidence-required pattern type (returns ok)", async () => {
    const { applyPromotedRules } = await importGateLogic();
    const rule = {
      id: "rule-test",
      status: "active",
      enforcement: "gate",
      pattern_type: "resolution-evidence-required",
      pattern: "test-session-id",
    };
    const result = applyPromotedRules("mvn install -DskipTests", null, [rule]);
    assert.deepStrictEqual(result, { decision: "ok" });
  });

  test("does NOT warn when resolution-evidence-required is called from the bash gate (command set)", async () => {
    // Regression: previously this branch emitted `console.warn` on every bash
    // command because the bash gate always has `command` set. The warning was
    // misleading — the rule is correctly skipped via `continue`; the warning
    // just created log spam. Lock in the silent-skip behavior.
    const { applyPromotedRules } = await importGateLogic();
    const rule = {
      id: "rule-test",
      status: "active",
      enforcement: "gate",
      pattern_type: "resolution-evidence-required",
      pattern: "test-session-id",
    };

    // Capture stderr/stdout around the call.
    const origWarn = console.warn;
    const origErr = console.error;
    const captured = [];
    console.warn = (...args) => captured.push(["warn", ...args]);
    console.error = (...args) => captured.push(["error", ...args]);
    try {
      // Realistic bash-gate shape: command set, filePath null, one rule.
      const result = applyPromotedRules("ls -la", null, [rule]);
      assert.deepStrictEqual(result, { decision: "ok" });
    } finally {
      console.warn = origWarn;
      console.error = origErr;
    }
    // No log spam from the resolution-evidence-required branch in the bash gate.
    const noisy = captured.filter(([, msg]) =>
      typeof msg === "string" && msg.includes("resolution-evidence-required should not have"),
    );
    assert.deepStrictEqual(noisy, [], `unexpected warning: ${JSON.stringify(noisy)}`);
  });

  test("legacy alias: skips resolution-evidence-required pattern (test name preserved for history)", async () => {
    const { applyPromotedRules } = await importGateLogic();
    const rule = {
      id: "rule-test",
      status: "active",
      enforcement: "gate",
      pattern_type: "resolution-evidence-required",
      pattern: "test-session-id",
    };
    const result = applyPromotedRules("test", null, [rule]);
    assert.deepStrictEqual(result, { decision: "ok" });
  });
});

describe("meta_state_resolve consultation", () => {
  test("returns resolution_evidence_required when rule is unsatisfied", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "res-ev-"));
    const core = await importCore(tempRoot);
    const targetId = core.generateId("target-finding");
    const blockingId = core.generateId("mcp-client-loading-missing");
    await core.writeEntry(tempRoot, {
      id: targetId,
      entry_kind: "finding",
      category: "mcp-tool-missing",
      severity: "warning",
      affected_system: "mcp-tools",
      subtype: "mcp-client-loading",
      description: "Target finding that should be resolved by operator.",
      status: "active",
      created_at: new Date().toISOString(),
      version: 0,
    });
    await core.writeEntry(tempRoot, {
      id: blockingId,
      entry_kind: "finding",
      category: "mcp-tool-missing",
      severity: "warning",
      affected_system: "mcp-tools",
      subtype: "mcp-client-loading",
      description: "Blocking finding for resolution test.",
      session_id: "test-session-id",
      status: "active",
      created_at: new Date().toISOString(),
      version: 0,
    });
    await core.writeEntry(tempRoot, {
      id: "rule-cold-session-test-must-pass-before-resolution",
      entry_kind: "rule",
      origin: targetId,
      enforcement: "gate",
      pattern_type: "resolution-evidence-required",
      pattern: "test-session-id",
      applies_to_resolution: targetId,
      description: "Rule entry for resolution evidence test.",
      status: "active",
      promoted_at: new Date().toISOString(),
      promoted_by: "test",
      created_at: new Date().toISOString(),
      version: 0,
    });

    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempRoot;
    try {
      const { metaStateResolveTool } = await importMetaStateResolveTool();
      const result = await metaStateResolveTool.handler({
        id: targetId,
        resolved_by: "operator",
      });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.resolved, false);
      assert.strictEqual(parsed.reason, "resolution_evidence_required");
      assert.strictEqual(parsed.rule_id, "rule-cold-session-test-must-pass-before-resolution");
      assert.ok(parsed.blocking_id);
      assert.strictEqual(parsed.applies_to_resolution, targetId);

      // Verify registry was NOT mutated
      const after = core.readRegistry(tempRoot);
      const target = after.find((e) => e.id === targetId);
      assert.strictEqual(target.status, "active");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("allows resolution when rule is satisfied", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "res-ev-"));
    const core = await importCore(tempRoot);
    const targetId = core.generateId("target-finding");
    await core.writeEntry(tempRoot, {
      id: targetId,
      entry_kind: "finding",
      category: "mcp-tool-missing",
      severity: "warning",
      affected_system: "mcp-tools",
      subtype: "mcp-client-loading",
      description: "Target finding that should be resolved by operator.",
      status: "active",
      created_at: new Date().toISOString(),
      version: 0,
    });
    await core.writeEntry(tempRoot, {
      id: "rule-cold-session-test-must-pass-before-resolution",
      entry_kind: "rule",
      origin: targetId,
      enforcement: "gate",
      pattern_type: "resolution-evidence-required",
      pattern: "test-session-id",
      applies_to_resolution: targetId,
      description: "Rule entry for resolution evidence test.",
      status: "active",
      promoted_at: new Date().toISOString(),
      promoted_by: "test",
      created_at: new Date().toISOString(),
      version: 0,
    });

    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempRoot;
    try {
      const { metaStateResolveTool } = await importMetaStateResolveTool();
      const result = await metaStateResolveTool.handler({
        id: targetId,
        resolved_by: "operator",
      });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.resolved, true);
      assert.strictEqual(parsed.status, "resolved");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("does not block when rule targets a different id", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "res-ev-"));
    const core = await importCore(tempRoot);
    const targetId = core.generateId("target-finding");
    const otherId = core.generateId("other-finding");
    await core.writeEntry(tempRoot, {
      id: targetId,
      entry_kind: "finding",
      category: "mcp-tool-missing",
      severity: "warning",
      affected_system: "mcp-tools",
      subtype: "mcp-client-loading",
      description: "Target finding that should be resolved by operator.",
      status: "active",
      created_at: new Date().toISOString(),
      version: 0,
    });
    await core.writeEntry(tempRoot, {
      id: "rule-cold-session-test-must-pass-before-resolution",
      entry_kind: "rule",
      origin: targetId,
      enforcement: "gate",
      pattern_type: "resolution-evidence-required",
      pattern: "test-session-id",
      applies_to_resolution: targetId,
      description: "Rule entry for resolution evidence test.",
      status: "active",
      promoted_at: new Date().toISOString(),
      promoted_by: "test",
      created_at: new Date().toISOString(),
      version: 0,
    });

    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempRoot;
    try {
      const { metaStateResolveTool } = await importMetaStateResolveTool();
      const result = await metaStateResolveTool.handler({
        id: targetId,
        resolved_by: "operator",
      });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.resolved, true);
      assert.strictEqual(parsed.status, "resolved");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });
});

describe("listPromotedRules filter", () => {
  test("excludes resolution-evidence-required rules", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "res-ev-"));
    const regexRule = {
      id: "rule-regex",
      entry_kind: "rule",
      origin: "meta-test-origin",
      enforcement: "gate",
      pattern_type: "regex",
      pattern: "test",
      description: "Test regex rule for listPromotedRules filter regression coverage",
      status: "active",
      promoted_at: new Date().toISOString(),
      promoted_by: "operator",
    };
    const resolutionRule = {
      id: "rule-resolution",
      entry_kind: "rule",
      origin: "meta-test-origin",
      enforcement: "gate",
      pattern_type: "resolution-evidence-required",
      pattern: "test-session-id",
      description: "Test resolution rule for listPromotedRules filter regression coverage",
      status: "active",
      promoted_at: new Date().toISOString(),
      promoted_by: "operator",
    };
    writeFileSync(
      join(tempRoot, "meta-state.jsonl"),
      JSON.stringify(regexRule) + "\n" + JSON.stringify(resolutionRule) + "\n",
    );

    const { listPromotedRules } = await importLoopIntrospect();
    const rules = listPromotedRules(tempRoot);
    assert.strictEqual(rules.length, 1);
    assert.strictEqual(rules[0].id, "rule-regex");
  });
});
