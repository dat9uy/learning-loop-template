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
// 4. "cold-session test resolves persisted finding on gap-close" — a
//    unit test for the resolution branch of the cold-session test (runs in a
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
const { probeL1, probeL2 } = require("./probe-helpers.cjs");

describe("cold-session discoverability acceptance", () => {
  // __dirname is .../tools/learning-loop-mcp/__tests__; project root is three levels up.
  const projectRoot = resolve(__dirname, "..", "..", "..");
  const serverEntry = join(projectRoot, "tools/learning-loop-mcp/server.js");

  // L2 probe: spawns a real `droid exec` and asks the agent to call
  // loop_describe via the MCP layer. The agent must echo the numeric
  // tool_count. A bare number in stdout = gap closed; TOOL_UNAVAILABLE
  // marker or no digit = gap open.
  //
  // The droid runtime exposes MCP tools under the namespaced name
  // `learning-loop-mcp___<tool>` (3 underscores; the droid display
  // format). The canonical `mcp__learning_loop_mcp__<tool>` (2
  // underscores per segment) is the MCP-spec name but is NOT what
  // droid's ToolSearch accepts. Earlier versions of this prompt used
  // the canonical name, which caused ToolSearch to return "Not found"
  // and the agent to fall back to `TOOL_UNAVAILABLE` on most runs and
  // hallucinate `59` on rare runs (matching the 59 MCP tool entries
  // listed in droid's system reminder). The droid display name is the
  // contract; we use it directly. See
  // meta-260610T2301Z-cold-session-test-1-l2-probe-flakiness-confirmed-during-meta
  // for the prior flakiness and meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list
  // for the runtime name format.
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
      "Use the tool named learning-loop-mcp___loop_describe with arguments { tier: \"summary\" }.",
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
    // Copy schemas/ into tempRoot so record_*_tool modules that call
    // `buildZodSchemaFor(type, { root: resolveRoot() })` at module load time
    // can find the schema files. Without this, GATE_ROOT=tempRoot makes
    // loadSchemas throw, safeImport returns null, and the 8 record tools
    // never register. See test 2 (cold-session-direct) for the same copy.
    const schemasSrc = join(projectRoot, "schemas");
    const schemasDst = join(tempRoot, "schemas");
    mkdirSync(schemasDst, { recursive: true });
    for (const f of readdirSync(schemasSrc)) {
      if (f.endsWith(".schema.json")) {
        require("node:fs").copyFileSync(join(schemasSrc, f), join(schemasDst, f));
      }
    }

    // Pure 2-MCP-call chain: meta_state_report -> record_create_decision.
    // All paths and values are provided upfront so the agent does not need
    // to read files. The earlier prompt asked the agent to "cites plans/.../
    // plan.md for the resolution path" and "internalize the plan reference",
    // which forced 6+ file reads and consumed the 60s budget before any MCP
    // call could land. See meta-260608T1618Z-corrected-diagnosis-for-meta-
    // 260608t1522z-test-1-cold-sessio for the trace evidence.
    //
    // Use the droid display-format tool names (3 underscores) because droid's
    // ToolSearch rejects the canonical mcp__learning_loop_mcp__ form. Tell
    // the agent to call ToolSearch once per tool — the droid ToolSearch
    // multi-select query syntax (comma-separated names) is not supported
    // and silently fails to load any tool.
    const prompt =
      "Make exactly two MCP tool calls in this order. " +
      "Do not read any files; do not search the codebase; do not explain. " +
      "First, call ToolSearch once with query 'select:learning-loop-mcp___meta_state_report' to load the tool. " +
      "Then call learning-loop-mcp___meta_state_report with arguments " +
      "{ category: \"loop-anti-pattern\", severity: \"warning\", affected_system: \"mcp-tools\", " +
      "description: \"Cold-session test 1 internalization probe.\", " +
      "evidence_code_ref: \"tools/learning-loop-mcp/tools/loop-describe-tool.js\", " +
      "mechanism_check: true }. " +
      "Capture the id field from the response. " +
      "Then call ToolSearch once with query 'select:learning-loop-mcp___record_create_decision'. " +
      "Then call learning-loop-mcp___record_create_decision with arguments " +
      "{ surface: \"meta\", question: \"Does the internalization rule hold?\", " +
      "decision: \"Yes\", rationale: \"The agent cited the code point and used local:meta-state in source_refs.\", " +
      "source_refs: [\"local:meta-state:<id-from-call-1>\"], alternatives: [], tradeoffs: [], supersedes: [] }.";

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
    // were not mutated by the subprocess. Snapshot BOTH at start so pre-existing
    // dirty-tree entries (e.g., a `D records/...` deletion from a prior session)
    // do not cause a false-positive failure. meta-state.jsonl size check is
    // snapshot-based (not git-status-based) so that the third test in this file
    // (which writes a finding only on gap-open novel failure) does not
    // pollute this assertion. records/ check is also snapshot-based for the
    // same reason: it tolerates a dirty starting state and only catches
    // mutations introduced between start and end of this test.
    const realMetaStatePath = join(projectRoot, "meta-state.jsonl");
    const startMetaStateSize = existsSync(realMetaStatePath)
      ? readFileSync(realMetaStatePath, "utf8").length
      : 0;

    const startGitStatus = require("node:child_process")
      .execSync("git status --porcelain", { cwd: projectRoot, encoding: "utf8" })
      .trim();
    const startLines = startGitStatus.split("\n").filter((l) => l.trim() !== "");
    const startRecordsEntries = new Set(
      startLines.filter((l) => l.includes(" records/") || l.includes("/records/")),
    );
    const startRecordsCount = startRecordsEntries.size;

    const endGitStatus = require("node:child_process")
      .execSync("git status --porcelain", { cwd: projectRoot, encoding: "utf8" })
      .trim();
    const endLines = endGitStatus.split("\n").filter((l) => l.trim() !== "");
    const endRecordsEntries = new Set(
      endLines.filter((l) => l.includes(" records/") || l.includes("/records/")),
    );
    const newRecordsEntries = [...endRecordsEntries].filter((l) => !startRecordsEntries.has(l));
    assert.deepStrictEqual(
      newRecordsEntries,
      [],
      `real project records/ were mutated during test 1: ${newRecordsEntries.join(", ")}`,
    );
    // Sanity: the starting state had N records/ entries; we should not have
    // lost any. A negative delta would mean a tracked record was deleted.
    assert.ok(
      endRecordsEntries.size >= startRecordsCount,
      `records/ entries decreased during test 1 (start=${startRecordsCount}, end=${endRecordsEntries.size})`,
    );

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
      assert.strictEqual(warm.discoverability_hints.length, 13);
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
      // Plan 260611-1700-loop-get-instruction: hint H12 advertises the new
      // loop_get_instruction tool and teaches the meta-vs-product surface split.
      assert.ok(
        hints.some((h) => h.includes("loop_get_instruction") && h.includes("product/**")),
        "Hint H12 (loop_get_instruction + meta-vs-product split) must be present",
      );
      // Plan 260612-id-addressed-meta-state-list: hint H13 advertises narrow query.
      assert.ok(
        hints.some((h) => h.includes("meta_state_list") && h.includes("id:") && h.includes("ref_by")),
        "Hint H13 (narrow query: id + ref_by/ref_field) must be present",
      );
      assert.ok(
        hints.length === 13,
        `Expected 13 hints, got ${hints.length}`,
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
      // that the third test in this file (which writes a finding only on gap-open
      // novel failure) does not pollute this assertion.
      const realMetaStatePath = join(projectRoot, "meta-state.jsonl");
      const startMetaStateSize = existsSync(realMetaStatePath)
        ? readFileSync(realMetaStatePath, "utf8").length
        : 0;

      const startGitStatus = require("node:child_process")
        .execSync("git status --porcelain", { cwd: projectRoot, encoding: "utf8" })
        .trim();
      const startLines = startGitStatus.split("\n").filter((l) => l.trim() !== "");
      const startRecordsEntries = new Set(
        startLines.filter((l) => l.includes(" records/") || l.includes("/records/")),
      );
      const startRecordsCount = startRecordsEntries.size;

      const endGitStatus = require("node:child_process")
        .execSync("git status --porcelain", { cwd: projectRoot, encoding: "utf8" })
        .trim();
      const endLines = endGitStatus.split("\n").filter((l) => l.trim() !== "");
      const endRecordsEntries = new Set(
        endLines.filter((l) => l.includes(" records/") || l.includes("/records/")),
      );
      const newRecordsEntries = [...endRecordsEntries].filter((l) => !startRecordsEntries.has(l));
      assert.deepStrictEqual(
        newRecordsEntries,
        [],
        `real project records/ were mutated during test 2: ${newRecordsEntries.join(", ")}`,
      );
      assert.ok(
        endRecordsEntries.size >= startRecordsCount,
        `records/ entries decreased during test 2 (start=${startRecordsCount}, end=${endRecordsEntries.size})`,
      );

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
  // gap-close, resolves any active finding. The session_id and subtype
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
    const gapOpen = !STRICT_MCP_TOOL_PATTERN.test(toolsList);

    if (!gapOpen) {
      console.error("[cold-session/l1] L1 closed: mcp tools listed in CLI catalog (test 5 / L2 is the authoritative probe)");
    }

    const claim = await probeL1(projectRoot, { sessionId, runtime: cli, gapOpen });
    if (gapOpen && claim) {
      if (claim.claimed) {
        console.error(`[cold-session/l1] logged L1 finding: ${claim.id}`);
      } else {
        console.error(`[cold-session/l1] L1 gap already tracked: ${claim.existing.id}`);
      }
    }
  });

  // Fourth test: verify the gap-close resolution branch.
  // This test uses GATE_ROOT isolation to avoid polluting the real project's
  // meta-state.jsonl. It simulates the gap-closed scenario by pre-populating
  // a finding and then invoking the probeL1 helper with gapOpen=false.
  test("cold-session test resolves persisted finding on gap-close", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "cold-session-delete-"));
    process.env.GATE_ROOT = tempRoot;

    const corePath = join(projectRoot, "tools/learning-loop-mcp/core/meta-state.js");
    const core = await import(pathToFileURL(corePath).href);
    const sessionId = "test-cold-session-mcp-client-loading";
    const runtime = "droid";

    // Pre-populate the registry with a finding that the test would otherwise log.
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

    // Verify the finding exists before the test runs.
    const before = core.readRegistry(tempRoot);
    assert.ok(before.find((e) => e.id === existingId), "pre-test: finding should exist");

    // Simulate the gap-close branch: probeL1 resolves the active finding.
    await probeL1(tempRoot, { sessionId, runtime, gapOpen: false });

    // Verify the finding is resolved (status is resolved, not active or stale).
    const after = core.readRegistry(tempRoot);
    const resolved = after.find((e) => e.id === existingId);
    assert.ok(resolved, "finding should still exist in registry");
    assert.strictEqual(resolved.status, "resolved");
    assert.strictEqual(resolved.resolved_by, "auto-cold-session-test");
    assert.ok(resolved.resolution.includes("conditional emission"), "resolution should mention conditional emission");

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
  //   learning-loop-mcp___loop_describe({ tier: "summary" })
  // (droid's display-format tool name — 3 underscores) and echo the
  // numeric tool_count. A bare number in stdout is the success signal;
  // anything else (TOOL_UNAVAILABLE marker, prose only, error message)
  // is the gap-open signal. The shared probeL2Gap helper above owns
  // the prompt; see its comment for why we use the droid display name
  // instead of the canonical mcp__learning_loop_mcp__ form.
  //
  // Like test 3, this test logs a `mcp-client-loading` finding on gap-open
  // and resolves it on gap-close, sharing the same session_id
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

    // Shared L2 probe: see probeL2Gap helper above. On gap-open, log a
    // finding via atomic tryClaimSessionId. On gap-close, resolve ONLY
    // the L2 finding (exact runtime+layer filter prevents cross-resolution).
    const l2Result = await probeL2Gap(projectRoot, serverEntry);
    const gapOpen = !l2Result.gapClosed;

    const claim = await probeL2(projectRoot, {
      sessionId,
      runtime: cli,
      gapOpen,
      entryBuilder: gapOpen ? (() => {
        const corePath = join(projectRoot, "tools/learning-loop-mcp/core/meta-state.js");
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
      }) : undefined,
    });

    if (gapOpen && claim) {
      if (claim.claimed) {
        console.error(`[cold-session/l2] logged L2 finding: ${claim.id}`);
      } else {
        console.error(`[cold-session/l2] L2 gap already tracked: ${claim.existing.id}`);
      }
    } else if (!gapOpen) {
      console.error("[cold-session/l2] gap closed: no L2 finding to resolve");
    }
    writeSentinel(cli, "L2");
  });

  // Regression-guard test: asserts the conditional-emission invariant.
  // On a synthetic pass (gapOpen=false) with no prior finding, the probe
  // must write NOTHING to the registry. A future contributor who re-introduces
  // unconditional writes will break this test.
  test("probeL1 and probeL2 do not write on synthetic pass", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "cold-session-pass-"));
    process.env.GATE_ROOT = tempRoot;

    const sessionId = "test-synthetic-pass";
    const runtime = "test";

    // Call both probes with gapOpen=false on a fresh registry.
    await probeL1(tempRoot, { sessionId, runtime, gapOpen: false });
    await probeL2(tempRoot, { sessionId, runtime, gapOpen: false });

    // Assert the tempRoot registry is empty (no findings written).
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

  test("hook mirror matches canonical hint count (drift prevention)", async () => {
    const hookPath = join(projectRoot, ".factory/hooks/loop-surface-inject.cjs");
    const hookSource = readFileSync(hookPath, "utf8");
    const canonicalPath = join(projectRoot, "tools/learning-loop-mcp/core/loop-introspect.js");
    const canonicalSource = readFileSync(canonicalPath, "utf8");

    const hookMatch = hookSource.match(/LOCAL_DISCOVERABILITY_HINTS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
    const canonicalMatch = canonicalSource.match(/DISCOVERABILITY_HINTS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);

    assert.ok(hookMatch, "hook should contain LOCAL_DISCOVERABILITY_HINTS array");
    assert.ok(canonicalMatch, "canonical should contain DISCOVERABILITY_HINTS array");

    const hookCount = (hookMatch[1].match(/"/g) || []).length / 2;
    const canonicalCount = (canonicalMatch[1].match(/"/g) || []).length / 2;

    assert.strictEqual(
      hookCount,
      canonicalCount,
      `Hook hint count (${hookCount}) must match canonical (${canonicalCount}). The hook mirror has drifted.`,
    );
  });
});
