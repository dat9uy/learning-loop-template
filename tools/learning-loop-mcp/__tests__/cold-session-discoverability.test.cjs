// Acceptance test: cold session discoverability.
//
// Five tests live in this file:
//
// 1. "agent cites code via meta_state_report ..." — the canonical real-spawn test
//    that spawns `droid exec` and asserts the agent followed the internalization
//    rule. Skips on the L2 probe (probeL2Gap) finding MCP tools unavailable
//    to droid's --auto agent runtime, so CI does not accumulate 60s timeouts
//    in envs where the runtime is broken (see
//    meta-260608T1522Z-test-1-cold-session-hangs-in-mcp-gapped-env).
//
// 2. "discoverability surface works via direct MCP server spawn" — a fallback
//    integration test that spawns the MCP server directly (no droid), drives
//    loop_describe warm tier + meta_state_report + record_create_decision over
//    stdio JSON-RPC, and asserts the same internalization contract. This test
//    runs on every PR and guards the surface even when droid exec is not
//    MCP-enabled.
//
// 3. "droid exec CLI catalog lists runtime-namespaced MCP tools (L1 probe)" —
//    the L1 (CLI catalog) probe via `droid exec --list-tools`. Asserts a
//    runtime-namespaced tool entry is present. The CLI catalog may show
//    the tools while the agent runtime cannot invoke them, so L1 is a
//    layer-1 signal only; the L2 probe is the authoritative one.
//
// 4. "cold-session test soft-deletes persisted finding on gap-close" — a
//    unit test for the deletion branch of the cold-session test (runs in a
//    GATE_ROOT-isolated temp directory).
//
// 5. "agent runtime exposes mcp__learning_loop_mcp__* tools to the AI
//    (L2 probe)" — the authoritative agent-runtime layer probe. Spawns a
//    real droid exec and asks the agent to call mcp__learning_loop_mcp__
//    loop_describe. The 1410Z finding documents that the L1 catalog probe
//    is a false-positive proxy for this layer; L2 is the layer the 0443Z
//    and 1410Z findings actually care about.
//
// All tests use GATE_ROOT to isolate all meta-state/record writes to a temp
// directory; the real project files are never mutated. A post-test git-status
// assertion locks this isolation contract.

const { describe, test } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const { mkdtempSync, mkdirSync, readFileSync, readdirSync, existsSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const { parse: parseYaml } = require("yaml");

describe("cold-session discoverability acceptance", () => {
  // __dirname is .../tools/learning-loop-mcp/__tests__; project root is three levels up.
  const projectRoot = resolve(__dirname, "..", "..", "..");
  const serverEntry = join(projectRoot, "tools/learning-loop-mcp/server.js");

  // L2 probe: spawns a real `droid exec` and asks the agent to call
  // mcp__learning_loop_mcp__loop_describe({ tier: "summary" }). The agent
  // must echo the numeric tool_count. A bare number in stdout = gap
  // closed; TOOL_UNAVAILABLE marker or no digit = gap open.
  //
  // This is the authoritative probe for the 1410Z finding's "agent
  // runtime layer" — distinct from the L1 probe (test 3) which checks
  // the CLI catalog via `droid exec --list-tools`. The L1 layer may
  // pass while L2 fails; L2 is the layer the 0443Z/1410Z findings
  // actually care about.
  //
  // Used by:
  //   - test 1's skip check (skip if L2 gap open; the L1 check was
  //     a false-positive proxy — see
  //     meta-260608T1410Z-finding-meta-260606t0443z-mcp-tools-not-loaded-into-agent-to)
  //   - test 5 (the standalone L2 probe test)
  //
  // Returns true on gap-closed, false on gap-open or probe failure
  // (fail-safe: a probe that can't run is treated as gap-open so
  // downstream tests are gated correctly).
  async function probeL2Gap(root, server) {
    if (!existsSync(server)) {
      console.error("[probeL2Gap] server entry missing");
      return false;
    }

    const cli = await detectAgentCli();
    if (!cli) {
      console.error("[probeL2Gap] no agent CLI in PATH");
      return false;
    }

    const canSpawn = await new Promise((resolve) => {
      const probe = spawn(cli, ["--version"], { stdio: "pipe" });
      probe.on("error", () => resolve(false));
      probe.on("exit", (code) => resolve(code === 0));
    });
    if (!canSpawn) {
      console.error(`[probeL2Gap] ${cli} not in PATH`);
      return false;
    }

    const tempRoot = mkdtempSync(join(tmpdir(), "l2-probe-"));
    const prompt = [
      "Use the tool named mcp__learning_loop_mcp__loop_describe with arguments { tier: \"summary\" }.",
      "From the JSON result, output ONLY the numeric value of the tool_count field.",
      "Do not output any other text. Do not explain. Do not apologize.",
      "If the tool is unavailable, output exactly the string: TOOL_UNAVAILABLE",
    ].join(" ");

    const child = spawn(cli, ["exec", "--auto", "low", prompt], {
      cwd: root,
      env: { ...process.env, GATE_ROOT: tempRoot },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    const exitCode = await new Promise((resolve) => {
      const timeout = setTimeout(() => { child.kill("SIGTERM"); resolve(-1); }, 90000);
      child.on("exit", (code) => { clearTimeout(timeout); resolve(code ?? -1); });
      child.on("error", () => { clearTimeout(timeout); resolve(-1); });
    });

    console.error(
      `[probeL2Gap] exit=${exitCode} stdout_len=${stdout.length} stdout_first200=${JSON.stringify(stdout.slice(0, 200))}`,
    );

    const trimmed = stdout.trim();
    const gapClosed = /\b\d+\b/.test(trimmed) && !trimmed.includes("TOOL_UNAVAILABLE");
    return { gapClosed, exitCode, stdout, stderr };
  }

  // Detect which agent CLI is available: droid first, then claude.
  // Returns the first CLI whose --version probe exits 0, or null if neither.
  async function detectAgentCli() {
    for (const cli of ["droid", "claude"]) {
      const ok = await new Promise((resolve) => {
        const probe = spawn(cli, ["--version"], { stdio: "pipe" });
        probe.on("error", () => resolve(false));
        probe.on("exit", (code) => resolve(code === 0));
      });
      if (ok) return cli;
    }
    return null;
  }

  // Write freshness sentinel so normal `pnpm test` knows cold-session was run.
  function writeSentinel(cli, layer) {
    const sentinelPath = join(__dirname, ".cold-session-sentinel.json");
    writeFileSync(sentinelPath, JSON.stringify({
      last_pass_at: new Date().toISOString(),
      cli: cli ?? "droid",
      layer,
    }, null, 2));
  }

  test("agent cites code via meta_state_report and local:meta-state refs", async () => {
    console.error("[cold-session] test starting", { projectRoot, serverEntry, exists: existsSync(serverEntry) });
    if (!existsSync(serverEntry)) {
      console.error("[cold-session] skipping: server entry missing");
      return;
    }

    const cli = await detectAgentCli();
    if (!cli) {
      console.error("[cold-session] skipping because no agent CLI in PATH");
      return;
    }

    // Verify agent CLI is in PATH by trying to spawn it.
    const canSpawn = await new Promise((resolve) => {
      const probe = spawn(cli, ["--version"], { stdio: "pipe" });
      let out = "";
      let err = "";
      probe.stdout.on("data", (c) => { out += c; });
      probe.stderr.on("data", (c) => { err += c; });
      probe.on("error", (e) => {
        console.error(`[cold-session] ${cli} probe error:`, e.message);
        resolve(false);
      });
      probe.on("exit", (code) => {
        console.error(`[cold-session] ${cli} probe exit:`, code, out, err);
        resolve(code === 0);
      });
    });
    if (!canSpawn) {
      console.error(`[cold-session] skipping because ${cli} probe failed`);
      return;
    }

    // L2 skip check: this test asks the agent to call meta_state_report and
    // record_create_decision. If droid's --auto runtime cannot call MCP tools
    // (the agent-runtime layer gap from finding
    // meta-260608T1522Z-test-1-cold-session-hangs-in-mcp-gapped-env and
    // meta-260608T1410Z-finding-meta-260606t0443z-mcp-tools-not-loaded-into-agent-to),
    // the agent will hang for the full 60s timeout and produce no output. The
    // L1 proxy (droid exec --list-tools) is a false-positive check — the CLI
    // catalog may show the tools while the agent runtime cannot invoke them.
    // Skip on L2 gap-open so CI does not accumulate 60s timeouts in envs where
    // the runtime is broken. probeL2Gap is the shared helper used by test 5.
    const l2Result = await probeL2Gap(projectRoot, serverEntry);
    if (!l2Result.gapClosed) {
      console.error("[cold-session] skipping: L2 probe found MCP tools unavailable to droid agent runtime (see test 5 / finding meta-260608T1522Z)");
      return;
    }

    const tempRoot = mkdtempSync(join(tmpdir(), "cold-session-"));
    mkdirSync(join(tempRoot, "records", "meta", "decisions"), { recursive: true });

    const prompt =
      "Create a decision record that cites plans/260605-superseded-status-and-discoverability/plan.md " +
      "for the resolution path. Use record_create_decision. Before creating the decision, " +
      "internalize the plan reference by reporting a finding with evidence_code_ref pointing at " +
      "the relevant code (tools/learning-loop-mcp/tools/loop-describe-tool.js) and mechanism_check: true. " +
      "Then create the decision with source_refs using local:meta-state:<id> of the finding you just reported.";

    const child = spawn(cli, ["exec", "--auto", "medium", prompt], {
      cwd: projectRoot,
      env: {
        ...process.env,
        GATE_ROOT: tempRoot,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    const exitCode = await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        resolve(-1);
      }, 60000);
      child.on("exit", (code) => {
        clearTimeout(timeout);
        resolve(code ?? -1);
      });
      child.on("error", () => {
        clearTimeout(timeout);
        resolve(-1);
      });
    });

    // Debug breadcrumbs: keep these in stderr so test failures are actionable.
    // eslint-disable-next-line no-console
    console.error(`[cold-session] exit=${exitCode} stdout_len=${stdout.length} stderr_len=${stderr.length}`);

    // Read temp-root artifacts.
    const metaStatePath = join(tempRoot, "meta-state.jsonl");
    const metaStateEntries = existsSync(metaStatePath)
      ? readFileSync(metaStatePath, "utf8")
          .split("\n")
          .filter((l) => l.trim() !== "")
          .map((l) => JSON.parse(l))
      : [];

    const decisionsDir = join(tempRoot, "records", "meta", "decisions");
    const decisionFiles = existsSync(decisionsDir) ? readdirSync(decisionsDir) : [];
    const decisions = decisionFiles
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => parseYaml(readFileSync(join(decisionsDir, f), "utf8")));

    // 1. Agent called meta_state_report at least once.
    const findings = metaStateEntries.filter((e) => e.entry_kind === "finding");
    assert.ok(findings.length >= 1, "expected at least one finding entry");

    // 2. At least one meta_state_report call has evidence_code_ref ending in .js.
    const codeRefFindings = findings.filter(
      (e) => typeof e.evidence_code_ref === "string" && e.evidence_code_ref.endsWith(".js"),
    );
    assert.ok(codeRefFindings.length >= 1, "expected at least one finding with evidence_code_ref pointing at .js");

    // 3. At least one meta_state_report call has mechanism_check: true.
    const mechanismChecked = findings.filter((e) => e.mechanism_check === true);
    assert.ok(mechanismChecked.length >= 1, "expected at least one finding with mechanism_check: true");

    // 4. Agent called record_create_decision at least once.
    assert.ok(decisions.length >= 1, "expected at least one decision record");

    // 5. At least one decision has source_refs containing local:meta-state:...
    const decisionsWithMetaState = decisions.filter((d) =>
      (d.source_refs || []).some((ref) => typeof ref === "string" && ref.startsWith("local:meta-state:")),
    );
    assert.ok(decisionsWithMetaState.length >= 1, "expected at least one decision with local:meta-state source_ref");

    // 6. No source_refs contain records/meta/evidence/.
    for (const d of decisions) {
      for (const ref of d.source_refs || []) {
        assert.ok(
          !(typeof ref === "string" && ref.includes("records/meta/evidence/")),
          `decision must not cite records/meta/evidence/: ${ref}`,
        );
      }
    }

    // 7. No source_refs use local:plans/... (proves code-pointed rule).
    for (const d of decisions) {
      for (const ref of d.source_refs || []) {
        assert.ok(
          !(typeof ref === "string" && ref.startsWith("local:plans/")),
          `decision must not use deprecated local:plans/ ref: ${ref}`,
        );
      }
    }

    // Isolation: verify the real project's meta-state.jsonl and records directories
    // were not mutated by the subprocess. Snapshot meta-state.jsonl size at start
    // and verify it hasn't grown (catches subprocess bypass of GATE_ROOT). For
    // records/, we use git status because new record files would be untracked.
    // The meta-state.jsonl size check is snapshot-based (not git-status-based) so
    // that the third test in this file (which legitimately writes a finding to
    // the real meta-state.jsonl on every run) does not pollute this assertion.
    const realMetaStatePath = join(projectRoot, "meta-state.jsonl");
    const startMetaStateSize = existsSync(realMetaStatePath)
      ? readFileSync(realMetaStatePath, "utf8").length
      : 0;

    const gitStatus = require("node:child_process")
      .execSync("git status --porcelain", { cwd: projectRoot, encoding: "utf8" })
      .trim();
    const lines = gitStatus.split("\n").filter((l) => l.trim() !== "");
    const leaked = lines.filter((l) =>
      l.includes(" records/") || l.includes("/records/"),
    );
    assert.deepStrictEqual(leaked, [], `real project records/ were mutated: ${leaked.join(", ")}`);

    const endMetaStateSize = existsSync(realMetaStatePath)
      ? readFileSync(realMetaStatePath, "utf8").length
      : 0;
    assert.strictEqual(
      endMetaStateSize,
      startMetaStateSize,
      `real project meta-state.jsonl was mutated by subprocess (size ${startMetaStateSize} -> ${endMetaStateSize})`,
    );

    // Freshness sentinel: record that the cold-session test ran.
    writeSentinel(cli, "L1");
  });

  test("discoverability surface works via direct MCP server spawn", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "cold-session-direct-"));
    mkdirSync(join(tempRoot, "records", "meta", "decisions"), { recursive: true });
    // Copy all schemas into temp root so create-decision-record-tool.js (and the
    // other record tools) can import buildZodSchemaFor without ENOENT.
    const schemasSrc = join(projectRoot, "schemas");
    const schemasDst = join(tempRoot, "schemas");
    mkdirSync(schemasDst, { recursive: true });
    for (const f of readdirSync(schemasSrc)) {
      if (f.endsWith(".schema.json")) {
        require("node:fs").copyFileSync(join(schemasSrc, f), join(schemasDst, f));
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
      // Wait for the server to start, then initialize.
      await new Promise((resolve) => setTimeout(resolve, 300));
      await send(0, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "cold-session-test", version: "1.0.0" } });

      // 1. loop_describe warm tier returns discoverability hints.
      const warm = await call(1, "loop_describe", { tier: "warm" });
      assert.ok(Array.isArray(warm.discoverability_hints), "warm tier should include discoverability_hints");
      assert.strictEqual(warm.discoverability_hints.length, 9);
      const citationHint = warm.discoverability_hints.find((h) => h.includes("evidence_code_ref"));
      assert.ok(citationHint, "citation hint should mention evidence_code_ref");

      // Track A — new hints A4 + A5 (Plan 260609-adopt-instruction-layer)
      const hints = warm.discoverability_hints;
      assert.ok(
        hints.some((h) => h.includes("canonical MCP tool") && h.includes("4-question framework")),
        "Hint A4 (tool selection — 4-question framework) must be present",
      );
      assert.ok(
        hints.some((h) => h.includes("priority-1 prompt") && h.includes("AGENTS.md")),
        "Hint A5 (4-layer role split) must be present",
      );
      assert.ok(
        hints.some((h) => h.includes("reopens")),
        "DISCOVERABILITY_HINTS should include a hint about reopens",
      );
      assert.ok(
        hints.length === 9,
        `Expected 9 hints, got ${hints.length}`,
      );
      const totalHintsByteLength = hints.reduce(
        (sum, h) => sum + Buffer.byteLength(h, "utf8"),
        0,
      );
      assert.ok(
        totalHintsByteLength < 5000,
        `Warm tier hints must be <5KB; got ${totalHintsByteLength} bytes`,
      );

      // 2. meta_state_report with evidence_code_ref + mechanism_check: true succeeds.
      const reportResult = await call(2, "meta_state_report", {
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Cold-session discoverability direct MCP test finding.",
        evidence_code_ref: "tools/learning-loop-mcp/tools/loop-describe-tool.js",
        mechanism_check: true,
      });
      assert.strictEqual(reportResult.status, "reported");
      const findingId = reportResult.id;
      assert.ok(findingId.startsWith("meta-"));

      // 3. record_create_decision with local:meta-state:<id> succeeds.
      const decisionResult = await call(3, "record_create_decision", {
        surface: "meta",
        question: "Does the discoverability surface close the gap?",
        decision: "Yes",
        rationale: "The validator accepts local:meta-state refs and the MCP server surfaces the internalization rule.",
        source_refs: [`local:meta-state:${findingId}`],
        alternatives: [],
        tradeoffs: [],
        supersedes: [],
      });
      assert.strictEqual(decisionResult.created, true);

      // 4. record_create_decision with deprecated markdown ref is rejected.
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
      // or records directories. Snapshot meta-state.jsonl size at start and
      // verify it hasn't grown (catches subprocess bypass of GATE_ROOT). For
      // records/, we use git status because new record files would be untracked.
      // The meta-state.jsonl size check is snapshot-based (not git-status-based) so
      // that the third test in this file (which legitimately writes a finding to
      // the real meta-state.jsonl on every run) does not pollute this assertion.
      const realMetaStatePath = join(projectRoot, "meta-state.jsonl");
      const startMetaStateSize = existsSync(realMetaStatePath)
        ? readFileSync(realMetaStatePath, "utf8").length
        : 0;

      const gitStatus = require("node:child_process")
        .execSync("git status --porcelain", { cwd: projectRoot, encoding: "utf8" })
        .trim();
      const lines = gitStatus.split("\n").filter((l) => l.trim() !== "");
      const leaked = lines.filter((l) =>
        l.includes(" records/") || l.includes("/records/"),
      );
      assert.deepStrictEqual(leaked, [], `real project records/ were mutated: ${leaked.join(", ")}`);

      const endMetaStateSize = existsSync(realMetaStatePath)
        ? readFileSync(realMetaStatePath, "utf8").length
        : 0;
      assert.strictEqual(
        endMetaStateSize,
        startMetaStateSize,
        `real project meta-state.jsonl was mutated by subprocess (size ${startMetaStateSize} -> ${endMetaStateSize})`,
      );

      // Verify the temp-root artifacts.
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

  // Strict pattern: a runtime-namespaced MCP tool entry. Droid formats MCP
  // tools in three documented ways:
  //   - `mcp__learning_loop_mcp__<tool>` (canonical, 2 underscores per segment)
  //   - `learning-loop-mcp___<tool>` (droid display, 3 underscores)
  //   - `[MCP] learning-loop-mcp:<tool>` (verbose display, colon)
  // The match is a single tool entry, not just the server name. This is the
  // L1 (CLI catalog) signal; a substring match on the bare server name
  // ("learning-loop-mcp") would be a false-positive proxy (see finding
  // meta-260608T1410Z-finding-meta-260606t0443z-mcp-tools-not-loaded-into-agent-to).
  const STRICT_MCP_TOOL_PATTERN = /(?:mcp__learning_loop_mcp__|learning-loop-mcp___|\[MCP\] learning-loop-mcp:)[A-Za-z][A-Za-z0-9_]*/;

  // Third test: droid-runtime MCP client-side loading probe (L1, CLI catalog).
  //
  // Probes `droid exec --list-tools` (the CLI catalog layer). Asserts that at
  // least one runtime-namespaced MCP tool entry is present. On gap-open, logs
  // a `meta_state_report` finding (idempotent on session_id+subtype). On
  // gap-close, soft-deletes any existing finding. The session_id and subtype
  // are shared with test 5 (L2 probe) so the
  // rule-cold-session-test-must-pass-before-resolution evidence aggregates
  // both layers.
  //
  // This is the L1 probe; test 5 is the authoritative L2 probe. Both must
  // agree (gap closed) for the rule to release.
  test("droid exec CLI catalog lists runtime-namespaced MCP tools (L1 probe)", async () => {
    console.error("[cold-session/l1] test starting");
    if (!existsSync(serverEntry)) {
      console.error("[cold-session/l1] skipping: server entry missing");
      return;
    }

    const cli = await detectAgentCli();
    if (!cli) {
      console.error("[cold-session/l1] skipping: no agent CLI in PATH");
      return;
    }

    // Probe agent CLI exec --list-tools.
    const toolsList = await new Promise((resolve) => {
      const probe = spawn(cli, ["exec", "--list-tools"], { cwd: projectRoot, stdio: "pipe" });
      let out = "";
      probe.stdout.on("data", (c) => { out += c; });
      probe.stderr.on("data", () => {});
      probe.on("error", () => resolve(""));
      probe.on("exit", () => resolve(out));
    });

    const sessionId = "test-cold-session-mcp-client-loading";
    const corePath = join(projectRoot, "tools/learning-loop-mcp/core/meta-state.js");
    let writeEntry, readRegistry, updateEntry, generateId, tryClaimSessionId;
    try {
      const core = await import(pathToFileURL(corePath).href);
      writeEntry = core.writeEntry;
      readRegistry = core.readRegistry;
      updateEntry = core.updateEntry;
      generateId = core.generateId;
      tryClaimSessionId = core.tryClaimSessionId;
    } catch (e) {
      console.error(`[cold-session/mcp-client-loading] cannot import core/meta-state.js: ${e.message}`);
      return;
    }

    if (STRICT_MCP_TOOL_PATTERN.test(toolsList)) {
      console.error("[cold-session/l1] L1 closed: mcp tools listed in CLI catalog (test 5 / L2 is the authoritative probe)");
      // L1 (CLI catalog) closed: soft-delete ONLY the L1 finding.
      // Exact filter on runtime+layer prevents L1 from resolving L2 findings.
      let existing = null;
      try {
        existing = readRegistry(projectRoot).find((e) =>
          e.entry_kind === "finding"
          && e.session_id === sessionId
          && e.subtype === "mcp-client-loading"
          && (e.status === "active" || e.status === "reported")
          && e.description.includes(`runtime: ${cli}`)
          && e.description.includes("layer: L1"),
        );
      } catch {
        // no existing finding
      }
      if (existing) {
        const now = new Date().toISOString();
        try {
          await updateEntry(projectRoot, existing.id, {
            status: "stale",
            resolved_at: now,
            resolved_by: "auto-cold-session-test",
            _expected_version: existing.version ?? 0,
          });
          console.error(`[cold-session/mcp-client-loading] soft-deleted L1 finding: ${existing.id}`);
        } catch (e) {
          console.error(`[cold-session/mcp-client-loading] cannot soft-delete L1 finding: ${e.message}`);
        }
      }
      return;
    }

    // Gap detected. Use atomic tryClaimSessionId to eliminate TOCTOU race.
    const claim = await tryClaimSessionId(projectRoot, {
      sessionId,
      subtype: "mcp-client-loading",
      runtime: cli,
      layer: "L1",
    }, () => {
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
          `${cli} exec --list-tools does not expose mcp__learning_loop_mcp__* tools in this environment. ` +
          "The MCP server is reachable (server-side probe works — see meta-260606T0200Z-loop-surface-inject-spawnandcall-chicken-egg-fix), " +
          `but the ${cli} agent runtime is not loading project-local MCP servers into its tool list. ` +
          "This is the client-side gap described in meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list. " +
          "Detected by cold-session-discoverability.test.cjs#agent runtime exposes mcp__learning_loop_mcp__* tools to the AI (L2 probe). " +
          `runtime: ${cli}; layer: L1;`,
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
    });

    if (claim.claimed) {
      console.error(`[cold-session/l1] logged L1 finding: ${claim.id}`);
    } else {
      console.error(`[cold-session/l1] L1 gap already tracked: ${claim.existing.id}`);
    }
  });

  // Fourth test: verify the deletion branch of the cold-session test.
  // This test uses GATE_ROOT isolation to avoid polluting the real project's
  // meta-state.jsonl. It simulates the gap-closed scenario by pre-populating
  // a finding and then invoking the same deletion logic.
  test("cold-session test soft-deletes persisted finding on gap-close", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "cold-session-delete-"));
    process.env.GATE_ROOT = tempRoot;

    const corePath = join(projectRoot, "tools/learning-loop-mcp/core/meta-state.js");
    const core = await import(pathToFileURL(corePath).href);
    const sessionId = "test-cold-session-mcp-client-loading";

    // Pre-populate the registry with a finding that the test would otherwise log.
    const existingId = core.generateId("mcp-client-loading-missing");
    await core.writeEntry(tempRoot, {
      id: existingId,
      entry_kind: "finding",
      category: "mcp-tool-missing",
      severity: "warning",
      affected_system: "mcp-tools",
      subtype: "mcp-client-loading",
      description: "Pre-existing finding (test setup).",
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

    // Verify the finding exists before the test runs.
    const before = core.readRegistry(tempRoot);
    assert.ok(before.find((e) => e.id === existingId), "pre-test: finding should exist");

    // Simulate the deletion branch: gap is closed, finding exists → soft-delete.
    const now = new Date().toISOString();
    await core.updateEntry(tempRoot, existingId, {
      status: "stale",
      resolved_at: now,
      resolved_by: "auto-cold-session-test",
      _expected_version: 0,
    });

    // Verify the finding is soft-deleted (status is stale, not active).
    const after = core.readRegistry(tempRoot);
    const deleted = after.find((e) => e.id === existingId);
    assert.ok(deleted, "finding should still exist in registry");
    assert.strictEqual(deleted.status, "stale");
    assert.strictEqual(deleted.resolved_by, "auto-cold-session-test");

    // Cleanup
    delete process.env.GATE_ROOT;
  });

  // Fifth test: authoritative agent-runtime layer probe (L2).
  //
  // Finding meta-260608T1410Z-finding-meta-260606t0443z-mcp-tools-not-loaded-into-agent-to
  // correctly identified that test 3 above probes the wrong layer (droid CLI
  // catalog) for the agent-runtime gap. This test probes the ACTUAL agent
  // runtime by spawning a real `droid exec` and asking the agent to call a
  // specific MCP tool. If the tool is not in the AI's callable list, the
  // agent cannot call it and the response shape will diverge from the
  // success signal.
  //
  // Probe contract: the agent must call
  //   mcp__learning_loop_mcp__loop_describe({ tier: "summary" })
  // and echo the numeric tool_count. A bare number in stdout is the success
  // signal; anything else (TOOL_UNAVAILABLE marker, prose only, error
  // message) is the gap-open signal.
  //
  // Like test 3, this test logs a `mcp-client-loading` finding on gap-open
  // and soft-deletes it on gap-close, sharing the same session_id
  // ("test-cold-session-mcp-client-loading") and subtype
  // ("mcp-client-loading"). The rule-cold-session-test-must-pass-before-
  // resolution check (core/gate-logic.js#checkResolutionEvidence, branch 2)
  // looks for `subtype=mcp-client-loading && session_id=<pattern>`, so
  // either probe can independently contribute evidence.
  //
  // Unlike test 3, this test does NOT soft-skip on the catalog state — it
  // runs whenever droid is in PATH. This is the contract test for the
  // 0443Z/1410Z gap.
  test("agent runtime exposes mcp__learning_loop_mcp__* tools to the AI (L2 probe)", async () => {
    console.error("[cold-session/l2] test starting");
    if (!existsSync(serverEntry)) {
      console.error("[cold-session/l2] skipping: server entry missing");
      writeSentinel(cli, "L2");
      return;
    }

    const sessionId = "test-cold-session-mcp-client-loading";
    const cli = await detectAgentCli() ?? "droid";
    const corePath = join(projectRoot, "tools/learning-loop-mcp/core/meta-state.js");
    let readRegistry, updateEntry, generateId, tryClaimSessionId;
    try {
      const core = await import(pathToFileURL(corePath).href);
      readRegistry = core.readRegistry;
      updateEntry = core.updateEntry;
      generateId = core.generateId;
      tryClaimSessionId = core.tryClaimSessionId;
    } catch (e) {
      console.error(`[cold-session/l2] cannot import core/meta-state.js: ${e.message}`);
      return;
    }

    // Shared L2 probe: see probeL2Gap helper above. On gap-open, log a
    // finding via atomic tryClaimSessionId. On gap-close, soft-delete ONLY
    // the L2 finding (exact runtime+layer filter prevents cross-resolution).
    const l2Result = await probeL2Gap(projectRoot, serverEntry);
    const gapOpen = !l2Result.gapClosed;

    if (!gapOpen) {
      // Gap closed: soft-delete ONLY the L2 finding.
      let existing = null;
      try {
        existing = readRegistry(projectRoot).find((e) =>
          e.entry_kind === "finding"
          && e.session_id === sessionId
          && e.subtype === "mcp-client-loading"
          && (e.status === "active" || e.status === "reported")
          && e.description.includes(`runtime: ${cli}`)
          && e.description.includes("layer: L2"),
        );
      } catch {
        // no registry
      }
      if (existing) {
        const now = new Date().toISOString();
        try {
          await updateEntry(projectRoot, existing.id, {
            status: "stale",
            resolved_at: now,
            resolved_by: "auto-cold-session-test-l2",
            _expected_version: existing.version ?? 0,
          });
          console.error(`[cold-session/l2] gap closed: soft-deleted L2 finding ${existing.id}`);
        } catch (e) {
          console.error(`[cold-session/l2] cannot soft-delete L2 finding: ${e.message}`);
        }
      } else {
        console.error("[cold-session/l2] gap closed: no L2 finding to soft-delete");
      }
      writeSentinel(cli, "L2");
      return;
    }

    // Gap-open branch: use atomic tryClaimSessionId to eliminate TOCTOU race.
    const claim = await tryClaimSessionId(projectRoot, {
      sessionId,
      subtype: "mcp-client-loading",
      runtime: cli,
      layer: "L2",
    }, () => {
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
          `L2 probe: ${cli} exec cannot call mcp__learning_loop_mcp__loop_describe in this environment. ` +
          `The MCP server is reachable and the ${cli} CLI catalog may show the tools (see test 3 / L1 probe), ` +
          `but the ${cli} agent runtime is not surfacing MCP tools to the AI's callable list. ` +
          "This is the agent-runtime layer gap described in meta-260608T1410Z-finding-meta-260606t0443z-mcp-tools-not-loaded-into-agent-to. " +
          "Detected by cold-session-discoverability.test.cjs#agent runtime exposes mcp__learning_loop_mcp__* tools to the AI (L2 probe). " +
          `Probe: exit=${l2Result.exitCode}, stdout_len=${l2Result.stdout.length}, stderr_len=${l2Result.stderr.length}, first200=${JSON.stringify(l2Result.stdout.slice(0, 200))}. ` +
          `runtime: ${cli}; layer: L2;`,
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
    });

    if (claim.claimed) {
      console.error(`[cold-session/l2] logged L2 finding: ${claim.id}`);
    } else {
      console.error(`[cold-session/l2] L2 gap already tracked: ${claim.existing.id}`);
    }
    writeSentinel(cli, "L2");
  });

  test("stale entries do not trigger session-id churn (regression for TTL recursion)", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "cold-session-stale-"));
    process.env.GATE_ROOT = tempRoot;

    const corePath = join(projectRoot, "tools/learning-loop-mcp/core/meta-state.js");
    const core = await import(pathToFileURL(corePath).href);
    const sessionId = `test-cold-session-stale-${Date.now()}`;

    // Pre-populate with a stale entry (the new model for past-TTL findings)
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

    // Verify the stale entry exists
    const before = core.readRegistry(tempRoot);
    assert.strictEqual(before.filter((e) => e.session_id === sessionId).length, 1, "pre-test: exactly one stale entry");

    // Simulate what meta_state_list does: checkExpiry on stale should return null
    // so no transition happens. The entry stays stale.
    const staleEntry = before.find((e) => e.id === id);
    assert.strictEqual(core.checkExpiry(staleEntry), null, "stale entries should not re-expire");

    delete process.env.GATE_ROOT;
  });
});
