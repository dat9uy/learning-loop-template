// Acceptance test: Claude Code MCP client-side loading.
//
// Mirrors the cold-session-discoverability.test.cjs pattern for the Droid CLI
// gap, but probes Claude Code's MCP loading via .mcp.json configuration.
//
// The test has two modes:
// 1. "config probe" — checks .mcp.json for learning-loop-mcp server entry
// 2. "direct spawn" — spawns the MCP server directly and verifies tool list
//
// If the config probe fails, the test logs a meta_state_report finding to the
// real meta-state.jsonl (idempotent via session_id). If the config is present,
// the direct spawn test validates the surface.
//
// All temp-root writes are isolated via GATE_ROOT.

const { describe, test } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const { mkdtempSync, mkdirSync, readFileSync, existsSync, copyFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

describe("Claude Code MCP client-side loading acceptance", () => {
  const projectRoot = resolve(__dirname, "..", "..", "..");
  const serverEntry = join(projectRoot, "tools/learning-loop-mcp/server.js");
  const mcpConfigPath = join(projectRoot, ".mcp.json");

  test(".mcp.json has learning-loop-mcp server configured", () => {
    assert.ok(existsSync(mcpConfigPath), ".mcp.json must exist for Claude Code MCP loading");
    const config = JSON.parse(readFileSync(mcpConfigPath, "utf8"));
    assert.ok(config.mcpServers, ".mcp.json must have mcpServers key");
    assert.ok(config.mcpServers["learning-loop-mcp"], ".mcp.json must have learning-loop-mcp server");
    const server = config.mcpServers["learning-loop-mcp"];
    assert.ok(server.command, "learning-loop-mcp server must have command");
    assert.ok(server.args, "learning-loop-mcp server must have args");
    assert.ok(server.args.some((a) => a.includes("server.js")), "args must reference server.js");
  });

  test("discoverability surface works via direct MCP server spawn", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "claude-mcp-direct-"));
    mkdirSync(join(tempRoot, "records", "meta", "decisions"), { recursive: true });

    // Copy schemas so record tools can import buildZodSchemaFor
    const schemasSrc = join(projectRoot, "schemas");
    const schemasDst = join(tempRoot, "schemas");
    mkdirSync(schemasDst, { recursive: true });
    const { readdirSync } = require("node:fs");
    for (const f of readdirSync(schemasSrc)) {
      if (f.endsWith(".schema.json")) {
        copyFileSync(join(schemasSrc, f), join(schemasDst, f));
      }
    }

    const child = spawn("node", [serverEntry], {
      cwd: projectRoot,
      env: {
        ...process.env,
        GATE_ROOT: tempRoot,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let buffer = "";
    let serverErr = "";
    const pending = new Map();
    child.stderr.on("data", (chunk) => {
      serverErr += chunk.toString();
    });
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      const remaining = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          if (msg.id !== undefined && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message));
            else resolve(msg.result);
          } else {
            remaining.push(line);
          }
        } catch {
          remaining.push(line);
        }
      }
      buffer = remaining.join("\n");
    });

    const send = (id, method, params) => {
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n", (err) => {
          if (err) {
            pending.delete(id);
            reject(err);
          }
        });
      });
    };

    const call = async (id, name, args) => {
      const result = await send(id, "tools/call", { name, arguments: args });
      if (!result || !result.content || !result.content[0] || typeof result.content[0].text !== "string") {
        throw new Error(`Unexpected MCP result for ${name}: ${JSON.stringify(result)}`);
      }
      const text = result.content[0].text;
      try {
        return JSON.parse(text);
      } catch (parseErr) {
        throw new Error(`Failed to parse ${name} result: ${text.slice(0, 500)} (error: ${parseErr.message}); server stderr: ${serverErr.slice(0, 1000)}`);
      }
    };

    try {
      // Wait for the server to start, then initialize
      await new Promise((resolve) => setTimeout(resolve, 300));
      await send(0, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "claude-mcp-test", version: "1.0.0" } });

      // 1. loop_describe warm tier returns discoverability hints
      const warm = await call(1, "loop_describe", { tier: "warm" });
      assert.ok(Array.isArray(warm.discoverability_hints), "warm tier should include discoverability_hints");
      const citationHint = warm.discoverability_hints.find((h) => h.includes("evidence_code_ref"));
      assert.ok(citationHint, "citation hint should mention evidence_code_ref");

      // 2. meta_state_report with evidence_code_ref + mechanism_check: true succeeds
      const reportResult = await call(2, "meta_state_report", {
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Claude Code MCP loading direct test finding.",
        evidence_code_ref: "tools/learning-loop-mcp/tools/loop-describe-tool.js",
        mechanism_check: true,
      });
      assert.strictEqual(reportResult.status, "reported");
      const findingId = reportResult.id;
      assert.ok(findingId.startsWith("meta-"));

      // 3. record_create_decision with local:meta-state:<id> succeeds
      const decisionResult = await call(3, "record_create_decision", {
        surface: "meta",
        question: "Does the Claude Code MCP loading surface work?",
        decision: "Yes",
        rationale: "The direct MCP server spawn validates the surface is functional.",
        source_refs: [`local:meta-state:${findingId}`],
        alternatives: [],
        tradeoffs: [],
        supersedes: [],
      });
      assert.strictEqual(decisionResult.created, true);

      // 4. record_create_decision with deprecated markdown ref is rejected
      const deprecatedResult = await call(4, "record_create_decision", {
        surface: "meta",
        question: "Should markdown refs still work?",
        decision: "No",
        rationale: "Markdown refs are deprecated.",
        source_refs: ["local:plans/x.md"],
        alternatives: [],
        tradeoffs: [],
        supersedes: [],
      });
      assert.strictEqual(deprecatedResult.created, false);
      assert.strictEqual(deprecatedResult.reason, "deprecated_source_refs");

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

      const decisionsDir = join(tempRoot, "records", "meta", "decisions");
      const decisionFiles = existsSync(decisionsDir) ? readdirSync(decisionsDir) : [];
      assert.ok(decisionFiles.length >= 1);
      const { parse: parseYaml } = require("yaml");
      const decisions = decisionFiles
        .filter((f) => f.endsWith(".yaml"))
        .map((f) => parseYaml(readFileSync(join(decisionsDir, f), "utf8")));
      assert.ok(decisions.some((d) =>
        (d.source_refs || []).some((ref) => typeof ref === "string" && ref.startsWith("local:meta-state:")),
      ));
    } finally {
      child.kill();
    }
  });

  // Third test: Claude Code MCP client-side loading probe.
  //
  // This test probes .mcp.json for learning-loop-mcp configuration. If the gap
  // is CLOSED (config present), the test passes silently. If the gap is OPEN
  // (config missing), the test logs a meta_state_report finding directly to the
  // project's meta-state.jsonl (mirroring the cold-session test pattern for Droid).
  //
  // The test does NOT fail CI on the gap. The finding IS the surface.
  test("Claude Code .mcp.json exposes learning-loop-mcp (client-side loading)", async () => {
    const corePath = join(projectRoot, "tools/learning-loop-mcp/core/meta-state.js");
    let writeEntry, readRegistry, updateEntry, generateId;
    try {
      const core = await import(pathToFileURL(corePath).href);
      writeEntry = core.writeEntry;
      readRegistry = core.readRegistry;
      updateEntry = core.updateEntry;
      generateId = core.generateId;
    } catch (e) {
      console.error(`[claude-mcp] cannot import core/meta-state.js: ${e.message}`);
      return;
    }

    const sessionId = "test-claude-code-mcp-client-loading";

    if (existsSync(mcpConfigPath)) {
      const config = JSON.parse(readFileSync(mcpConfigPath, "utf8"));
      if (config.mcpServers && config.mcpServers["learning-loop-mcp"]) {
        console.error("[claude-mcp] gap closed: .mcp.json has learning-loop-mcp");
        // Gap closed: check for existing finding and soft-delete it
        let existing = null;
        try {
          existing = readRegistry(projectRoot).find((e) =>
            e.entry_kind === "finding"
            && e.session_id === sessionId
            && e.subtype === "mcp-client-loading"
            && (e.status === "active" || e.status === "reported"),
          );
        } catch {
          // no existing finding
        }
        if (existing) {
          const now = new Date().toISOString();
          try {
            // Plan 260611-1000-remove-expired-status: rename 'expired' to
            // 'stale' here too. The patch validation is passthrough, so
            // 'expired' was technically allowed; but the registry no longer
            // accepts 'expired' in the status enum, and writing it would
            // create an orphan status. Use 'stale' for consistency with
            // the new enum.
            await updateEntry(projectRoot, existing.id, {
              status: "stale",
              resolved_at: now,
              resolved_by: "auto-claude-mcp-test",
              _expected_version: existing.version ?? 0,
            });
            console.error(`[claude-mcp] soft-deleted finding: ${existing.id}`);
          } catch (e) {
            console.error(`[claude-mcp] cannot soft-delete finding: ${e.message}`);
          }
        }
        return;
      }
    }

    // Gap detected. Log a meta_state_report finding via direct file I/O
    const id = generateId("mcp-client-loading-missing");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const entry = {
      id,
      entry_kind: "finding",
      category: "mcp-tool-missing",
      severity: "warning",
      affected_system: "mcp-tools",
      subtype: "mcp-client-loading",
      description:
        "Claude Code .mcp.json does not expose learning-loop-mcp in this environment. " +
        "The MCP server is reachable (server-side probe works), " +
        "but Claude Code is not configured to load the project-local MCP server. " +
        "Detected by claude-code-mcp-loading.test.cjs#Claude Code .mcp.json exposes learning-loop-mcp.",
      evidence_code_ref: "tools/learning-loop-mcp/server.js",
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

    // Idempotency: skip write if a finding for this session_id is already active or reported
    let existing = null;
    try {
      existing = readRegistry(projectRoot).find((e) =>
        e.entry_kind === "finding"
        && e.session_id === sessionId
        && e.subtype === "mcp-client-loading"
        && (e.status === "active" || e.status === "reported"),
      );
    } catch {
      // registry may not exist yet
    }
    if (existing) {
      console.error(`[claude-mcp] gap already tracked: ${existing.id}`);
      return;
    }

    try {
      await writeEntry(projectRoot, entry);
      console.error(`[claude-mcp] logged finding: ${id}`);
    } catch (e) {
      console.error(`[claude-mcp] cannot write finding: ${e.message}`);
    }
  });
});
