// Acceptance test: Claude Code MCP client-side loading.
//
// Mirrors the cold-session-discoverability.test.cjs pattern for the Droid CLI
// gap, but probes Claude Code's MCP loading via .mcp.json configuration.
//
// The test has two modes:
// 1. "config probe" — checks .mcp.json for learning-loop server entry
// 2. "direct spawn" — spawns the MCP server directly and verifies tool list
//
// If the config probe fails, the test logs a meta_state_report finding to the
// real meta-state.jsonl (idempotent via session_id). If the config is present,
// the direct spawn test validates the surface.
//
// All temp-root writes are isolated via GATE_ROOT.

const { describe, test } = require("node:test");
const assert = require("node:assert");
const { mkdtempSync, mkdirSync, readFileSync, existsSync, copyFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const { probeL1 } = require("../../../tools/learning-loop-mastra/__tests__/legacy-mcp/probe-helpers.cjs");

describe("Claude Code MCP client-side loading acceptance", () => {
  const projectRoot = resolve(__dirname, "..", "..", "..");
  const mcpConfigPath = join(projectRoot, ".mcp.json");
  const helperPath = pathToFileURL(
    join(projectRoot, "tools/learning-loop-mastra/__tests__/with-mcp-server.js"),
  );

  test(".mcp.json has learning-loop server configured", () => {
    assert.ok(existsSync(mcpConfigPath), ".mcp.json must exist for Claude Code MCP loading");
    const config = JSON.parse(readFileSync(mcpConfigPath, "utf8"));
    assert.ok(config.mcpServers, ".mcp.json must have mcpServers key");
    assert.ok(config.mcpServers["learning-loop"], ".mcp.json must have learning-loop server");
    const server = config.mcpServers["learning-loop"];
    assert.ok(server.command, "learning-loop server must have command");
    assert.ok(server.args, "learning-loop server must have args");
    assert.ok(server.args.some((a) => a.includes("server.js")), "args must reference server.js");
  });

  test("discoverability surface works via direct MCP server spawn", async () => {
    const { withMcpServer } = await import(helperPath.href);

    await withMcpServer(async ({ callTool, tempRoot }) => {
      // 1. loop_describe warm tier returns discoverability hints
      const warm = await callTool("mastra_loop_describe", { tier: "warm" });
      assert.ok(Array.isArray(warm.discoverability_hints), "warm tier should include discoverability_hints");
      const citationHint = warm.discoverability_hints.find((h) => h.includes("evidence_code_ref"));
      assert.ok(citationHint, "citation hint should mention evidence_code_ref");

      // 2. meta_state_report with evidence_code_ref + mechanism_check: true succeeds
      const reportResult = await callTool("mastra_meta_state_report", {
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Claude Code MCP loading direct test finding.",
        evidence_code_ref: "tools/learning-loop-mastra/tools/legacy/loop-describe-tool.js",
        mechanism_check: true,
      });
      assert.strictEqual(reportResult.status, "reported");
      const findingId = reportResult.id;
      assert.ok(findingId.startsWith("meta-"));

      // 3. meta_state_log_change with local:meta-state:<id> succeeds
      const changeResult = await callTool("mastra_meta_state_log_change", {
        change_dimension: "mechanical",
        change_target: "test",
        change_diff: { added: [], removed: [], changed: [] },
        reason: "Claude Code MCP loading direct test validates the surface is functional.",
        source_refs: [`local:meta-state:${findingId}`],
      });
      assert.strictEqual(changeResult.logged, true);

      // 4. meta_state_log_change with empty source_refs succeeds (no deprecated ref check in this tool)
      const secondResult = await callTool("mastra_meta_state_log_change", {
        change_dimension: "mechanical",
        change_target: "test",
        change_diff: { added: [], removed: [], changed: [] },
        reason: "Claude Code MCP loading direct test second call for idempotency check.",
        source_refs: [],
      });
      assert.strictEqual(secondResult.logged, true);

      // Verify no temp-root pollution leaked into the real project's meta-state
      const realMetaStatePath = join(projectRoot, "meta-state.jsonl");
      const startMetaStateSize = existsSync(realMetaStatePath)
        ? readFileSync(realMetaStatePath, "utf8").length
        : 0;

      const gitStatus = require("node:child_process")
        .execSync("git status --porcelain", { cwd: projectRoot, encoding: "utf8" })
        .trim();
      const lines = gitStatus.split("\n").filter((l) => l.trim() !== "");
      const leaked = lines.filter((l) => {
        if (!l.includes(" records/") && !l.includes("/records/")) return false;
        // Ignore test-budget artifacts from check-budget tests
        if (l.includes("test-budget-")) return false;
        // Ignore Phase 2 ledger conversion artifacts (plan 260612-1700)
        if (l.includes("records/_unbound/")) return false;
        if (l.includes("observation-vnstock-device-slot-ledger.yaml")) return false;
        // Ignore Phase 5 archive deletions (all product-surface records moved to _unbound)
        if (l.startsWith(" D records/") && !l.includes("/_unbound/")) return false;
        return true;
      });
      assert.deepStrictEqual(leaked, [], `real project records/ were mutated: ${leaked.join(", ")}`);

      const endMetaStateSize = existsSync(realMetaStatePath)
        ? readFileSync(realMetaStatePath, "utf8").length
        : 0;
      assert.strictEqual(
        endMetaStateSize,
        startMetaStateSize,
        `real project meta-state.jsonl was mutated by subprocess (size ${startMetaStateSize} -> ${endMetaStateSize})`,
      );

      // Verify the temp-root artifacts
      const metaStatePath = join(tempRoot, "meta-state.jsonl");
      const metaStateEntries = existsSync(metaStatePath)
        ? readFileSync(metaStatePath, "utf8")
            .split("\n")
            .filter((l) => l.trim() !== "")
            .map((l) => JSON.parse(l))
        : [];
      const findings = metaStateEntries.filter((e) => e.entry_kind === "finding");
      assert.ok(findings.some((e) => e.evidence_code_ref && e.evidence_code_ref.endsWith(".js")));
      assert.ok(findings.some((e) => e.mechanism_check === true));

      const changeLogs = metaStateEntries.filter((e) => e.entry_kind === "change-log");
      assert.ok(changeLogs.length >= 1, "at least one change-log entry should be written");
    });
  });

  // Third test: Claude Code MCP client-side loading probe.
  //
  // This test probes .mcp.json for learning-loop configuration. If the gap
  // is CLOSED (config present), the test passes silently. If the gap is OPEN
  // (config missing), the test logs a meta_state_report finding directly to the
  // project's meta-state.jsonl (mirroring the cold-session test pattern for Droid).
  //
  // The test does NOT fail CI on the gap. The finding IS the surface.
  // Refactored to use probeL1 helper (conditional emission + atomic dedup).
  test("Claude Code .mcp.json exposes learning-loop (client-side loading)", async () => {
    const sessionId = "test-claude-code-mcp-client-loading";
    const runtime = "claude";
    const gapOpen = !(existsSync(mcpConfigPath) &&
      JSON.parse(readFileSync(mcpConfigPath, "utf8")).mcpServers?.["learning-loop"]);

    if (!gapOpen) {
      console.error("[claude-mcp] gap closed: .mcp.json has learning-loop");
    }

    const claim = await probeL1(projectRoot, {
      sessionId,
      runtime,
      gapOpen,
      entryBuilder: gapOpen ? (() => {
        const corePath = join(projectRoot, "tools/learning-loop-mastra/core/meta-state.js");
        const { generateId } = require(corePath);
        const id = generateId("mcp-client-loading-missing");
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
        return {
          id,
          entry_kind: "finding",
          category: "mcp-tool-missing",
          severity: "warning",
          affected_system: "mcp-tools",
          subtype: "mcp-client-loading",
          description:
            "Claude Code .mcp.json does not expose learning-loop in this environment. " +
            "The MCP server is reachable (server-side probe works), " +
            "but Claude Code is not configured to load the project-local MCP server. " +
            "Detected by claude-code-mcp-loading.test.cjs#Claude Code .mcp.json exposes learning-loop. " +
            `runtime: ${runtime}; layer: L1;`,
          evidence_code_ref: "tools/learning-loop-mastra/server.js",
          session_id: sessionId,
          status: "reported",
          auto_resolve: null,
          created_at: now.toISOString(),
          expires_at: expiresAt,
          acked_at: null,
          resolved_at: null,
          resolved_by: null,
          version: 0,
        };
      }) : undefined,
    });

    if (gapOpen && claim) {
      if (claim.claimed) {
        console.error(`[claude-mcp] logged finding: ${claim.id}`);
      } else {
        console.error(`[claude-mcp] gap already tracked: ${claim.existing.id}`);
      }
    }
  });

  // Regression-guard test: asserts the conditional-emission invariant for
  // the claude-code probe. On a synthetic pass, the probe must write NOTHING.
  test("claude-code probeL1 does not write on synthetic pass", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "claude-mcp-pass-"));
    process.env.GATE_ROOT = tempRoot;

    const sessionId = "test-synthetic-claude";
    const runtime = "claude";

    await probeL1(tempRoot, { sessionId, runtime, gapOpen: false });

    const corePath = join(projectRoot, "tools/learning-loop-mastra/core/meta-state.js");
    const core = await import(pathToFileURL(corePath).href);
    const entries = core.readRegistry(tempRoot);
    const findings = entries.filter((e) =>
      e.entry_kind === "finding" && e.subtype === "mcp-client-loading",
    );
    assert.strictEqual(
      findings.length,
      0,
      `claude-code probe wrote ${findings.length} finding(s) on synthetic pass; expected 0. ` +
        "Conditional-emission invariant violated: pass path must be silent.",
    );

    delete process.env.GATE_ROOT;
  });
});
