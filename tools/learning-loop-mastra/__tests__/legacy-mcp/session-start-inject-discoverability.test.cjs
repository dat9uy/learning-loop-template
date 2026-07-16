const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");

const HOOK_PATH = path.resolve(__dirname, "..", "..", "hooks", "universal", "session-start-inject-discoverability.cjs");
const CONTEXT_PATH = path.resolve(__dirname, "..", "..", "..", "..", ".claude", "session-context.json");

test("SessionStart hook writes discoverability hints to session-context.json", { timeout: 15000 }, async () => {
  // Clean up any existing context file
  try { fs.unlinkSync(CONTEXT_PATH); } catch { /* ignore */ }

  const child = spawn("node", [HOOK_PATH], {
    env: { ...process.env, MASTRA_STORAGE_DRIVER: "memory" },
  });

  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d; });

  const code = await new Promise((resolve) => child.on("exit", resolve));

  assert.strictEqual(code, 0, `hook exited ${code}; stderr: ${stderr}`);

  const context = JSON.parse(fs.readFileSync(CONTEXT_PATH, "utf8"));
  assert.ok(Array.isArray(context.discoverability_hints), "discoverability_hints must be array");
  assert.ok(context.discoverability_hints.length > 0, "discoverability_hints must not be empty");
  assert.ok(Array.isArray(context.process_hints), "process_hints must be array");
  assert.ok(context.process_hints.length >= 1, "process_hints must have ≥1 entry");
  assert.ok(typeof context.injected_at === "string", "injected_at must be string");
  // Rec 12 closed-loop (plan 260708-1216-rec12-closed-loop, phase 4): the
  // additive `change_log_gap_hints` key must always be present in the
  // happy-path write — downstream readers never see a missing file/key.
  assert.ok(
    Array.isArray(context.change_log_gap_hints?.gap_candidates),
    "change_log_gap_hints.gap_candidates must be an array",
  );
  assert.ok(
    typeof context.change_log_gap_hints?.gap_protocol_prompt === "string",
    "change_log_gap_hints.gap_protocol_prompt must be a string",
  );
});

// Rec 12 closed-loop (phase 4): the BOTH-write-sites rule is load-bearing.
// The fatal-catch path MUST also carry the new key (with empty shape) so
// downstream readers never see a missing key on a failure path — the
// stale-dispatch precedent's invariant (mirror at the `:82` fatal-catch
// write site in session-start-inject-discoverability.cjs).
test("SessionStart hook fatal-catch path still writes change_log_gap_hints key", { timeout: 15000 }, async () => {
  try { fs.unlinkSync(CONTEXT_PATH); } catch { /* ignore */ }

  // Inject a sentinel env var the hook consults; when present, the hook
  // forces its outer try/catch to throw, exercising the fatal-catch path.
  const child = spawn("node", [HOOK_PATH], {
    env: {
      ...process.env,
      MASTRA_STORAGE_DRIVER: "memory",
      SESSION_START_FORCE_FATAL: "1",
    },
  });

  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d; });

  const code = await new Promise((resolve) => child.on("exit", resolve));
  assert.strictEqual(code, 0, `hook must exit 0 even on fatal; stderr: ${stderr}`);

  const context = JSON.parse(fs.readFileSync(CONTEXT_PATH, "utf8"));
  assert.ok(
    Array.isArray(context.change_log_gap_hints?.gap_candidates),
    "fatal-catch path must still write change_log_gap_hints.gap_candidates (empty array)",
  );
});

// Plan 260715-1100 silent-degrade regression. Before this fix, an inner
// loader failure (loadCoreHints / loadRegistry) returned empty arrays via
// try/catch with no signal — downstream readers (and the agent) could not
// distinguish "no hints configured" from "loader failed." This test forces
// the core-hints loader to fail and asserts the sidecar carries the
// `*_source: "fallback"` flag plus the captured error message, plus a
// DEGRADED stderr line so the harness surfaces the failure to the agent.
test("SessionStart hook carries *_source=fallback flags when an inner loader fails", { timeout: 15000 }, async () => {
  try { fs.unlinkSync(CONTEXT_PATH); } catch { /* ignore */ }

  const child = spawn("node", [HOOK_PATH], {
    env: {
      ...process.env,
      MASTRA_STORAGE_DRIVER: "memory",
      SESSION_START_FORCE_HINTS_FAIL: "1",
    },
  });

  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d; });

  const code = await new Promise((resolve) => child.on("exit", resolve));
  assert.strictEqual(code, 0, `hook must still exit 0 on per-loader fallback; stderr: ${stderr}`);

  const context = JSON.parse(fs.readFileSync(CONTEXT_PATH, "utf8"));
  // Sidecar shape stays stable (BOTH-write-sites invariant) — every key
  // present, every array empty, but the *_source flags expose the degrade.
  assert.deepStrictEqual(context.discoverability_hints, [], "discoverability_hints must be empty when loader fails");
  assert.strictEqual(context.discoverability_hints_source, "fallback", "must flag the source as fallback");
  assert.ok(
    typeof context.discoverability_hints_error === "string" && context.discoverability_hints_error.length > 0,
    "must capture the loader error message",
  );
  assert.deepStrictEqual(context.process_hints, [], "process_hints must be empty when loader fails");
  assert.strictEqual(context.process_hints_source, "fallback", "must flag the source as fallback");
  assert.ok(
    typeof context.process_hints_error === "string" && context.process_hints_error.length > 0,
    "must capture the loader error message",
  );
  // Stderr surfaces the DEGRADED line so the harness can route the signal
  // to the agent — without this, the agent has no way to detect the issue.
  assert.ok(
    /DEGRADED loaders:.*process_hints/.test(stderr),
    `stderr must include DEGRADED loaders: line referencing process_hints; got: ${stderr}`,
  );
});

// Plan 260715-1100 follow-up: the fatal-catch path must distinguish itself
// from a per-loader fallback so a downstream reader can tell whether the
// whole hook threw or just one loader failed. Source flag value is "fatal"
// (vs. "fallback" for per-loader degrade, "core" for happy path).
test("SessionStart hook fatal-catch path sets *_source=fatal (not fallback)", { timeout: 15000 }, async () => {
  try { fs.unlinkSync(CONTEXT_PATH); } catch { /* ignore */ }

  const child = spawn("node", [HOOK_PATH], {
    env: {
      ...process.env,
      MASTRA_STORAGE_DRIVER: "memory",
      SESSION_START_FORCE_FATAL: "1",
    },
  });

  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d; });

  const code = await new Promise((resolve) => child.on("exit", resolve));
  assert.strictEqual(code, 0, `hook must exit 0 even on fatal; stderr: ${stderr}`);

  const context = JSON.parse(fs.readFileSync(CONTEXT_PATH, "utf8"));
  assert.strictEqual(context.discoverability_hints_source, "fatal", "fatal path must tag hints_source as 'fatal'");
  assert.strictEqual(context.process_hints_source, "fatal", "fatal path must tag process_hints_source as 'fatal'");
  assert.strictEqual(context.registry_source, "fatal", "fatal path must tag registry_source as 'fatal'");
  assert.ok(
    typeof context.process_hints_error === "string" && context.process_hints_error.length > 0,
    "fatal path must carry the captured fatal error",
  );
});

// Happy-path counterpart: when no env-var forces a failure, source flags
// must be "core" — locks in the success signal so a future regression that
// always emits "fallback" would be caught.
test("SessionStart hook happy path sets *_source=core on every loader", { timeout: 15000 }, async () => {
  try { fs.unlinkSync(CONTEXT_PATH); } catch { /* ignore */ }

  const child = spawn("node", [HOOK_PATH], {
    env: { ...process.env, MASTRA_STORAGE_DRIVER: "memory" },
  });

  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d; });

  const code = await new Promise((resolve) => child.on("exit", resolve));
  assert.strictEqual(code, 0, `hook must exit 0 on happy path; stderr: ${stderr}`);

  const context = JSON.parse(fs.readFileSync(CONTEXT_PATH, "utf8"));
  assert.strictEqual(context.discoverability_hints_source, "core", "happy path must tag discoverability as 'core'");
  assert.strictEqual(context.process_hints_source, "core", "happy path must tag process_hints as 'core'");
  assert.strictEqual(context.registry_source, "core", "happy path must tag registry as 'core'");
  assert.strictEqual(context.discoverability_hints_error, null, "happy path must not carry a discoverability error");
  assert.strictEqual(context.process_hints_error, null, "happy path must not carry a process_hints error");
  assert.strictEqual(context.registry_error, null, "happy path must not carry a registry error");
  assert.ok(
    !/DEGRADED loaders/.test(stderr),
    `stderr must NOT include DEGRADED line on happy path; got: ${stderr}`,
  );
});

// Inline delivery leg (plan 260715-1141). The hook must emit its hint content
// to the agent via stdout JSON `hookSpecificOutput.additionalContext`, not just
// to the sidecar file — the sidecar has no in-process reader, so without this
// the agent never sees the hints. This test captures stdout and asserts the
// additionalContext carries the discoverability hints inline.
test("SessionStart hook emits discoverability hints via stdout additionalContext", { timeout: 15000 }, async () => {
  try { fs.unlinkSync(CONTEXT_PATH); } catch { /* ignore */ }

  const child = spawn("node", [HOOK_PATH], {
    env: { ...process.env, MASTRA_STORAGE_DRIVER: "memory" },
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => { stdout += d; });
  child.stderr.on("data", (d) => { stderr += d; });

  const code = await new Promise((resolve) => child.on("exit", resolve));
  assert.strictEqual(code, 0, `hook must exit 0; stderr: ${stderr}`);

  // stdout is the additionalContext JSON. Parse and assert shape + content.
  const out = JSON.parse(stdout);
  assert.strictEqual(out.hookSpecificOutput.hookEventName, "SessionStart", "must declare SessionStart event");
  const ac = out.hookSpecificOutput.additionalContext;
  assert.ok(typeof ac === "string" && ac.length > 0, "additionalContext must be a non-empty string");
  // 10k-char cap: the injected payload must fit inline (not be persisted/truncated).
  assert.ok([...ac].length <= 10000, `additionalContext must stay under 10k chars; got ${[...ac].length}`);
  assert.ok(ac.includes("Loop discoverability hints"), "must carry the discoverability header");
  // A known discoverability-hint marker (citation pattern) proves real content.
  assert.ok(ac.includes("meta_state_report"), "must include a known discoverability hint (meta_state_report)");
  // Must include all 16 hints (numbered 1..16) so delivery is full, not partial.
  assert.ok(/^1\. /m.test(ac) && /^16\. /m.test(ac), "must number hints 1 through 16 (full set)");
});

// Degraded inline leg: when the core-hints loader fails, the hook must still
// emit an additionalContext (a degraded marker) so the agent isn't left with
// silent-empty injection — the same fail-open contract as the sidecar *_source.
test("SessionStart hook emits degraded additionalContext marker when loader fails", { timeout: 15000 }, async () => {
  try { fs.unlinkSync(CONTEXT_PATH); } catch { /* ignore */ }

  const child = spawn("node", [HOOK_PATH], {
    env: {
      ...process.env,
      MASTRA_STORAGE_DRIVER: "memory",
      SESSION_START_FORCE_HINTS_FAIL: "1",
    },
  });

  let stdout = "";
  child.stdout.on("data", (d) => { stdout += d; });

  const code = await new Promise((resolve) => child.on("exit", resolve));
  assert.strictEqual(code, 0, `hook must exit 0 even when degraded`);

  const out = JSON.parse(stdout);
  const ac = out.hookSpecificOutput.additionalContext;
  assert.ok(ac.includes("degraded"), `degraded additionalContext must say 'degraded'; got: ${ac}`);
  assert.ok(ac.includes("fallback"), `degraded additionalContext must cite source=fallback; got: ${ac}`);
});

// Plan 260716-0624 (stale-view hash-drift fix): the session-start hook must
// thread drift signals (fileIndex + codeHashes) into buildStaleDispatchHints
// so the fixable-candidates filter fires on drift, not just age. Before the
// fix, loadStaleDispatchHints called buildStaleDispatchHints with no signals
// → age-only → a drift-stale-but-age-fresh finding never surfaced. This test
// builds a fixture where the cited file's current bytes differ from the
// file-index baseline (drift) while the finding is <7d old (age-fresh): the
// finding MUST appear in fixable_candidates. Without the wiring fix, the
// age-only predicate would drop it and this assertion would fail.
test("loadStaleDispatchHints threads drift signals — drift-stale age-fresh finding surfaces", () => {
  const root = mkdtempSync(path.join(tmpdir(), "session-start-drift-"));
  try {
    mkdirSync(path.join(root, "src"), { recursive: true });
    // Actual on-disk content. currentHash = sha256("current\n").
    writeFileSync(path.join(root, "src", "foo.js"), "current\n");
    // Index baseline = sha256 of DIFFERENT content → storedHash != currentHash → drift.
    const baselineHash = `sha256:${crypto.createHash("sha256").update("different\n").digest("hex")}`;
    writeFileSync(
      path.join(root, "file-index.jsonl"),
      JSON.stringify({ path: "src/foo.js", code_fingerprint: baselineHash }) + "\n",
    );

    const { loadStaleDispatchHints } = require(HOOK_PATH);
    const nowIso = new Date().toISOString();
    const entries = [{
      id: "meta-test-drift-stale-finding",
      entry_kind: "finding",
      status: "open",
      severity: "warning",
      evidence_code_ref: "src/foo.js",
      created_at: nowIso,
      last_verified_at: nowIso, // age-fresh (<7d) → age-only would NOT flag it
      mechanism_check: true,
      // no ledger_ref → passes the dispatch filter
    }];

    const result = loadStaleDispatchHints(entries, [], root);
    const ids = (result.fixable_candidates ?? []).map((c) => c.id);
    assert.ok(
      ids.includes("meta-test-drift-stale-finding"),
      `drift-stale age-fresh finding must surface in fixable_candidates (drift-aware wiring); got: ${JSON.stringify(ids)}`,
    );
  } finally {
    try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// Same fixture, but the file-index baseline MATCHES the current bytes → no
// drift, and the finding is age-fresh → must NOT surface. Guards against a
// wiring that always flags (path-presence-style regression).
test("loadStaleDispatchHints drift-aware — hash-match age-fresh finding does NOT surface", () => {
  const root = mkdtempSync(path.join(tmpdir(), "session-start-nodrift-"));
  try {
    mkdirSync(path.join(root, "src"), { recursive: true });
    writeFileSync(path.join(root, "src", "foo.js"), "current\n");
    const matchHash = `sha256:${crypto.createHash("sha256").update("current\n").digest("hex")}`;
    writeFileSync(
      path.join(root, "file-index.jsonl"),
      JSON.stringify({ path: "src/foo.js", code_fingerprint: matchHash }) + "\n",
    );

    const { loadStaleDispatchHints } = require(HOOK_PATH);
    const nowIso = new Date().toISOString();
    const entries = [{
      id: "meta-test-nodrift-finding",
      entry_kind: "finding",
      status: "open",
      severity: "warning",
      evidence_code_ref: "src/foo.js",
      created_at: nowIso,
      last_verified_at: nowIso,
      mechanism_check: true,
    }];

    const result = loadStaleDispatchHints(entries, [], root);
    const ids = (result.fixable_candidates ?? []).map((c) => c.id);
    assert.ok(
      !ids.includes("meta-test-nodrift-finding"),
      `hash-match age-fresh finding must NOT surface (no drift, no age); got: ${JSON.stringify(ids)}`,
    );
  } finally {
    try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});
