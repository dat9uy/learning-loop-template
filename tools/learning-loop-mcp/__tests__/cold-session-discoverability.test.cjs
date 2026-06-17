// Cold-session discoverability — deterministic rewrite.
//
// All tests use direct module imports. No external process spawning (no droid
// exec, no MCP server stdio). This eliminates the two dominant flakiness
// sources: (1) agent-CLI availability and runtime behavior, (2) wire-format
// coercion / Zod schema drift in live JSON-RPC.
//
// Test inventory:
//   1. MCP tools register from manifest — imports each tool module, verifies
//      name/description/inputSchema are present.
//   2. Discoverability hints are well-formed — imports buildDiscoverabilityHints,
//      checks structure, content anchors, and byte budget.
//   3. meta_state_report + meta_state_patch chain — exercises the
//      Internalization-Rule pathway via direct core calls in a temp GATE_ROOT.
//   4. Gap-close resolution branch — pre-populates a finding, calls probeL1
//      with gapOpen=false, asserts resolved.
//   5. Conditional-emission invariant — probeL1/probeL2 with gapOpen=false on
//      a fresh registry must write nothing.
//   6. Stale entries do not trigger session-id churn — regression for TTL
//      recursion.
//   7. Hook mirror hint count matches canonical — reads both files, compares
//      array lengths (not regex-based quote counting).

const { describe, test, before, after } = require("node:test");
const assert = require("node:assert");
const { mkdtempSync, mkdirSync, readFileSync, readdirSync, existsSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const { probeL1, probeL2 } = require("./probe-helpers.cjs");

describe("cold-session discoverability", () => {
  const projectRoot = resolve(__dirname, "..", "..", "..");
  const serverEntry = join(projectRoot, "tools/learning-loop-mcp/server.js");

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Copy schemas/*.schema.json into tempRoot so core modules resolve. */
  function copySchemas(tempRoot) {
    const src = join(projectRoot, "schemas");
    const dst = join(tempRoot, "schemas");
    mkdirSync(dst, { recursive: true });
    for (const f of readdirSync(src)) {
      if (f.endsWith(".schema.json")) {
        require("node:fs").copyFileSync(join(src, f), join(dst, f));
      }
    }
  }

  /** Write freshness sentinel. */
  function writeSentinel(layer) {
    const sentinelPath = join(__dirname, ".cold-session-sentinel.json");
    writeFileSync(sentinelPath, JSON.stringify({
      last_pass_at: new Date().toISOString(),
      cli: "deterministic",
      layer,
    }, null, 2));
  }

  // ---------------------------------------------------------------------------
  // Test 1: MCP tools register from manifest
  // ---------------------------------------------------------------------------

  test("MCP tools register from manifest", async () => {
    const manifestPath = join(projectRoot, "tools/learning-loop-mcp/tools/manifest.json");
    assert.ok(existsSync(manifestPath), "manifest.json must exist");

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert.ok(Array.isArray(manifest), "manifest must be an array");
    assert.ok(manifest.length > 0, "manifest must have at least one tool");

    const failures = [];
    for (const entry of manifest) {
      const filePath = join(projectRoot, "tools/learning-loop-mcp", entry.file.replace(/^\.\//, ""));
      try {
        const mod = require(filePath);
        const toolConfig = mod[entry.export];
        if (!toolConfig) {
          failures.push(`${entry.export}: export not found in ${entry.file}`);
          continue;
        }
        if (typeof toolConfig.name !== "string" || toolConfig.name.length === 0) {
          failures.push(`${entry.export}: missing or empty name`);
        }
        if (typeof toolConfig.description !== "string" || toolConfig.description.length === 0) {
          failures.push(`${entry.export}: missing or empty description`);
        }
        // Tools may use `inputSchema` or `schema` for their JSON Schema.
        const hasSchema = (typeof toolConfig.inputSchema === "object" && toolConfig.inputSchema !== null)
          || (typeof toolConfig.schema === "object" && toolConfig.schema !== null);
        if (!hasSchema) {
          failures.push(`${entry.export}: missing schema (checked inputSchema and schema)`);
        }
      } catch (err) {
        failures.push(`${entry.export}: import failed — ${err.message}`);
      }
    }

    assert.deepStrictEqual(failures, [], `Tool registration failures:\n${failures.join("\n")}`);
    writeSentinel("manifest");
  });

  // ---------------------------------------------------------------------------
  // Test 2: Discoverability hints are well-formed
  // ---------------------------------------------------------------------------

  test("discoverability hints are well-formed", async () => {
    const corePath = join(projectRoot, "tools/learning-loop-mcp/core/loop-introspect.js");
    const { buildDiscoverabilityHints } = await import(pathToFileURL(corePath).href);
    const hints = buildDiscoverabilityHints();

    assert.ok(Array.isArray(hints), "hints must be an array");
    assert.ok(hints.length >= 10, `expected at least 10 hints, got ${hints.length}`);

    // Structure: every hint is a non-empty string.
    for (const [i, h] of hints.entries()) {
      assert.strictEqual(typeof h, `string`, `hint[${i}] must be a string`);
      assert.ok(h.length > 20, `hint[${i}] is suspiciously short (${h.length} chars)`);
    }

    // Content anchors — key concepts must appear somewhere in the hints.
    const joined = hints.join("\n");
    const anchors = [
      "evidence_code_ref",
      "mechanism_check",
      "reopens",
      "meta_state_list",
      "loop_get_instruction",
      "meta_state_report",
    ];
    for (const anchor of anchors) {
      assert.ok(joined.includes(anchor), `hints must mention "${anchor}"`);
    }

    // Byte budget: total hints must be under 5KB.
    const totalBytes = hints.reduce((sum, h) => sum + Buffer.byteLength(h, "utf8"), 0);
    assert.ok(totalBytes < 5000, `hints must be <5KB; got ${totalBytes} bytes`);

    writeSentinel("hints");
  });

  // ---------------------------------------------------------------------------
  // Test 3: meta_state_report + meta_state_patch chain (Internalization Rule)
  // ---------------------------------------------------------------------------

  test("meta_state_report + meta_state_patch chain succeeds", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "cold-session-chain-"));
    copySchemas(tempRoot);

    const corePath = join(projectRoot, "tools/learning-loop-mcp/core/meta-state.js");
    const core = await import(pathToFileURL(corePath).href);

    // meta_state_report: create a finding with evidence_code_ref + mechanism_check.
    const id = core.generateId("cold-session-chain-test");
    const now = new Date();
    const entry = {
      id,
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Cold-session chain test: meta_state_report + meta_state_patch.",
      evidence_code_ref: "tools/learning-loop-mcp/tools/loop-describe-tool.js",
      mechanism_check: true,
      session_id: `test-chain-${Date.now()}`,
      status: "reported",
      auto_resolve: null,
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      acked_at: null,
      resolved_at: null,
      resolved_by: null,
      version: 0,
    };

    await core.writeEntry(tempRoot, entry);

    // Verify write landed.
    const afterWrite = core.readRegistry(tempRoot);
    const written = afterWrite.find((e) => e.id === id);
    assert.ok(written, "finding must exist after writeEntry");
    assert.strictEqual(written.evidence_code_ref, "tools/learning-loop-mcp/tools/loop-describe-tool.js");
    assert.strictEqual(written.mechanism_check, true);

    // meta_state_patch: update description + evidence_journal (self-id ref).
    const patchResult = await core.updateEntry(tempRoot, id, {
      description: "Cold-session chain test (patched).",
      evidence_journal: "plans/260612-1700-meta-surface-re-debate/phase-a-remaining-work.md",
      _expected_version: 0,
    });
    assert.strictEqual(patchResult, true, "updateEntry should return true on success");

    const afterPatch = core.readRegistry(tempRoot);
    const patched = afterPatch.find((e) => e.id === id);
    assert.ok(patched, "finding must exist after patch");
    assert.strictEqual(patched.description, "Cold-session chain test (patched).");
    assert.strictEqual(patched.evidence_journal, "plans/260612-1700-meta-surface-re-debate/phase-a-remaining-work.md");
    // evidence_code_ref preserved.
    assert.strictEqual(patched.evidence_code_ref, "tools/learning-loop-mcp/tools/loop-describe-tool.js");

    // Negative: patching a non-existent id returns null.
    const fakeId = "meta-260601T0000Z-does-not-exist";
    const notFoundResult = await core.updateEntry(tempRoot, fakeId, { description: "nope" });
    assert.strictEqual(notFoundResult, null, "updateEntry should return null for non-existent id");

    writeSentinel("chain");
  });

  // ---------------------------------------------------------------------------
  // Test 4: Gap-close resolution branch
  // ---------------------------------------------------------------------------

  test("cold-session test resolves persisted finding on gap-close", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "cold-session-delete-"));
    process.env.GATE_ROOT = tempRoot;

    const corePath = join(projectRoot, "tools/learning-loop-mcp/core/meta-state.js");
    const core = await import(pathToFileURL(corePath).href);
    const sessionId = "test-cold-session-mcp-client-loading";
    const runtime = "droid";

    // Pre-populate with a finding the probe would otherwise log.
    const existingId = core.generateId("mcp-client-loading-missing");
    await core.writeEntry(tempRoot, {
      id: existingId,
      entry_kind: "finding",
      category: "mcp-tool-missing",
      severity: "warning",
      affected_system: "mcp-tools",
      subtype: "mcp-client-loading",
      description: `Pre-existing finding (test setup). runtime: ${runtime}; layer: L1;`,
      evidence_code_ref: "tools/learning-loop-mcp/server.js",
      session_id: sessionId,
      status: "active",
      auto_resolve: null,
      created_at: new Date().toISOString(),
      expires_at: null,
      acked_at: new Date().toISOString(),
      resolved_at: null,
      resolved_by: null,
      version: 0,
    });

    const before = core.readRegistry(tempRoot);
    assert.ok(before.find((e) => e.id === existingId), "pre-test: finding should exist");

    // Simulate gap-close: probeL1 resolves the active finding.
    await probeL1(tempRoot, { sessionId, runtime, gapOpen: false });

    const after = core.readRegistry(tempRoot);
    const resolved = after.find((e) => e.id === existingId);
    assert.ok(resolved, "finding should still exist in registry");
    assert.strictEqual(resolved.status, "resolved");
    assert.strictEqual(resolved.resolved_by, "auto-cold-session-test");
    assert.ok(resolved.resolution.includes("conditional emission"), "resolution should mention conditional emission");

    delete process.env.GATE_ROOT;
  });

  // ---------------------------------------------------------------------------
  // Test 5: Conditional-emission invariant
  // ---------------------------------------------------------------------------

  test("probeL1 and probeL2 do not write on synthetic pass", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "cold-session-pass-"));
    process.env.GATE_ROOT = tempRoot;

    const sessionId = "test-synthetic-pass";
    const runtime = "test";

    await probeL1(tempRoot, { sessionId, runtime, gapOpen: false });
    await probeL2(tempRoot, { sessionId, runtime, gapOpen: false });

    const corePath = join(projectRoot, "tools/learning-loop-mcp/core/meta-state.js");
    const core = await import(pathToFileURL(corePath).href);
    const entries = core.readRegistry(tempRoot);
    const findings = entries.filter((e) =>
      e.entry_kind === "finding" && e.subtype === "mcp-client-loading",
    );
    assert.strictEqual(
      findings.length,
      0,
      `probe wrote ${findings.length} finding(s) on synthetic pass; expected 0. ` +
        "Conditional-emission invariant violated: pass path must be silent.",
    );

    delete process.env.GATE_ROOT;
  });

  // ---------------------------------------------------------------------------
  // Test 6: Stale entries do not trigger session-id churn
  // ---------------------------------------------------------------------------

  test("stale entries do not trigger session-id churn (regression for TTL recursion)", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "cold-session-stale-"));
    process.env.GATE_ROOT = tempRoot;

    const corePath = join(projectRoot, "tools/learning-loop-mcp/core/meta-state.js");
    const core = await import(pathToFileURL(corePath).href);
    const sessionId = `test-cold-session-stale-${Date.now()}`;

    // Pre-populate with a stale entry.
    const id = core.generateId("stale-test");
    await core.writeEntry(tempRoot, {
      id,
      entry_kind: "finding",
      category: "mcp-tool-missing",
      severity: "warning",
      affected_system: "mcp-tools",
      subtype: "mcp-client-loading",
      description: "Synthetic stale entry for churn regression testing.",
      evidence_code_ref: "tools/learning-loop-mcp/server.js",
      session_id: sessionId,
      status: "stale",
      auto_resolve: null,
      created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      acked_at: null,
      resolved_at: null,
      resolved_by: null,
      version: 0,
    });

    const before = core.readRegistry(tempRoot);
    assert.strictEqual(before.filter((e) => e.session_id === sessionId).length, 1, "pre-test: exactly one stale entry");

    // checkExpiry on stale should return null — no re-expiration.
    const staleEntry = before.find((e) => e.id === id);
    assert.strictEqual(core.checkExpiry(staleEntry), null, "stale entries should not re-expire");

    delete process.env.GATE_ROOT;
  });

  // ---------------------------------------------------------------------------
  // Test 7: Hook mirror hint count matches canonical
  // ---------------------------------------------------------------------------

  describe("hook mirror hint count", () => {
    let hookSource;
    let canonicalSource;

    before(() => {
      const hookPath = join(projectRoot, ".factory/hooks/loop-surface-inject.cjs");
      assert.ok(existsSync(hookPath), "hook file must exist");
      hookSource = readFileSync(hookPath, "utf8");
      const canonicalPath = join(projectRoot, "tools/learning-loop-mcp/core/loop-introspect.js");
      canonicalSource = readFileSync(canonicalPath, "utf8");
    });

    after(() => {
      hookSource = null;
      canonicalSource = null;
    });

    test("matches canonical hint count (drift prevention)", async () => {
      // Extract array contents between Object.freeze([ and ]).
      const hookMatch = hookSource.match(/LOCAL_DISCOVERABILITY_HINTS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
      const canonicalMatch = canonicalSource.match(/DISCOVERABILITY_HINTS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);

      assert.ok(hookMatch, "hook should contain LOCAL_DISCOVERABILITY_HINTS array");
      assert.ok(canonicalMatch, "canonical should contain DISCOVERABILITY_HINTS array");

      // Count hints by splitting on the hint-delimiter pattern (each hint starts
      // with a quoted string after optional whitespace/newlines). This is more
      // robust than counting quote characters which can appear inside hints.
      function countHints(arrayBody) {
        // Each hint is a string literal. Count opening quotes that start a new
        // hint entry (preceded by [ or , with optional whitespace).
        const matches = arrayBody.match(/(?<=\[|,)\s*"/g);
        return matches ? matches.length : 0;
      }

      const hookCount = countHints(hookMatch[1]);
      const canonicalCount = countHints(canonicalMatch[1]);

      assert.ok(hookCount > 0, "hook hint count should be > 0");
      assert.ok(canonicalCount > 0, "canonical hint count should be > 0");
      assert.strictEqual(
        hookCount,
        canonicalCount,
        `Hook hint count (${hookCount}) must match canonical (${canonicalCount}). The hook mirror has drifted.`,
      );
    });
  });
});
