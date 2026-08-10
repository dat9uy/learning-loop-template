#!/usr/bin/env node
/**
 * Claude Code SessionStart hook: inject discoverability hints.
 *
 * Reads `buildDiscoverabilityHints()` directly from core/loop-introspect.js
 * (a frozen constant; no MCP server startup required). Writes hints to
 * .claude/session-context.json. Replaces the previous hand-rolled JSON-RPC
 * pattern that was the documented deadlock root cause in meta-260621T1743Z.
 *
 * Per Red Team Finding 2: the previous pattern spawned the full MCP server
 * (~50-500ms startup) and hand-rolled JSON-RPC parsing to read a frozen
 * constant. Direct import eliminates that entire class of risk.
 *
 * Each hint source is loaded by a dedicated helper (Rec 9 discoverability +
 * process, Rec 10 stale-dispatch, Rec 12 change-log-gap). Helpers degrade to
 * empty defaults on builder failure so downstream readers see a stable
 * shape; the BOTH-write-sites invariant (Rec 10/12) keeps the fatal-catch
 * path in sync with the happy-path key set.
 */

const fs = require("node:fs");
const path = require("node:path");
const { CLI_READ_TOOLS, CLI_WRITE_TOOLS } = require("../../core/cli-tools.js");
const { META_STATE_FINDING_CATEGORIES, META_STATE_FINDING_SEVERITIES } = require("../../core/constants.js");

// write-tool one-line arg sketches for the
// SessionStart banner. Each entry lists the top-level required keys (no `?`)
// plus a curated subset of optional ones (trailing `?`); the agent composes
// the JSON string from a sketch and pulls the full shape (enums, nested
// objects) on demand via `loop.mjs <tool> --schema`. A required key may
// include a `key:enum1|enum2|...` annotation so the enforced enum values
// are visible in the banner without forcing a `--schema` round-trip. The
// drift test parser (`cli-write-hint-sketch-drift.test.cjs`) strips the
// annotation via `key.split(":")[0]` before extracting the key name, so an
// annotation does not poison the required-keys check. Keep the table
// aligned with the actual schema: the drift test asserts, per write tool,
// that the sketch's required (no-`?`) keys exactly equal the schema's
// `required` top-level keys and that every `?` key is a real optional
// schema property — so a schema change that adds or renames a required
// key breaks the test, not the agent's first write. The fallback (no
// schema access) is the harness failing closed — empty sketches.
const WRITE_TOOL_SKETCHES = {
  // Required-enum annotations live after the key with a `:` separator,
  // built from META_STATE_FINDING_CATEGORIES / META_STATE_FINDING_SEVERITIES
  // (core/constants.js) so a schema enum change propagates to the banner
  // instead of leaving a hand-copied list stale. The drift-test parser
  // strips the annotation before extracting the key name, so the
  // annotation does not poison the required-keys check.
  meta_state_report: `{category:${META_STATE_FINDING_CATEGORIES.join("|")},severity:${META_STATE_FINDING_SEVERITIES.join("|")},affected_system,description}`,
  meta_state_resolve: "{id,resolution,resolved_by:operator|auto-resolve?}",
  meta_state_promote_rule: "{id,rule_id,enforcement:gate|agent,pattern_type:regex|glob|determinism-checklist|agent-checklist,pattern,hint_text?,hint_suggestion?,hint_order?,hint_slug?}",
  // change_dimension is an enforced enum and change_diff is a nested object
  // whose keys the Zod type-error does NOT reveal — annotating both kills the
  // guess→reject→`--schema`→retry round-trip (session 6bd99328).
  meta_state_log_change: "{change_dimension:semantic|mechanical|surface,change_target,change_diff:{added,removed,changed},reason}",
  meta_state_patch: "{id,entry_kind:finding|rule|loop-design|change-log,patch}",
  meta_state_batch: "{operations:[{op,...}]}",
  meta_state_archive: "{override:[id],reason,confirm?}",
  meta_state_unarchive: "{id,reason?}",
  meta_state_supersede: "{id,consolidated_into,resolution}",
  meta_state_accept: "{id,accepted_reason,accepted_by?}",
  meta_state_propose_design: "{title,description,proposed_design_for,affected_system,severity_hint:low|medium|high?}",
  meta_state_ship_loop_design: "{id,shipped_in_plan}",
  meta_state_dispatch_finding: "{id,stage:prepare|commit?,issue_number?,issue_url?,repo?}",
  meta_state_re_verify: "{id}",
  meta_state_touch: "{id}",
  meta_state_refresh_file_index: "{path,reason?}",
  runtime_state_record: "{affected_system,kind:ledger-event|budget-state,id,source_ref,timestamp}",
  runtime_state_pause: "{surface}",
  runtime_state_resume: "{surface}",
  runtime_state_stop: "{surface,confirm}",
  gate_mark_preflight: "{surface}",
  gate_override: "{rule_id,ttl_seconds,operator_note}",
  // Workflow helpers reclassified into CLI_WRITE_TOOLS (the only writes that
// ride the CLI besides meta_state_* / runtime_state_*).
  workflow_notify_artifact: "{path,change_type:created|updated|deleted}",  // path must be records/** (in-handler guard)
  workflow_trigger: "{name,context?}",             // context is the legacy-preprocess optional
  // Portable-six: stateless pure transforms unwrapped from createLoopWorkflow.
  workflow_classify_prompt: "{prompt}",
  workflow_prepare_runtime_request: "{dimension,scope,output_level,command_class,temp_root_class,evidence_missing?,why_local_insufficient?}",
  workflow_self_improvement: "{improvement_type:schema-change|workflow-gap|heuristic-tune|tool-addition,description,proposed_changes?}",
  workflow_intentional_skip: "{assertion_id,skip_reason,scope}",
  workflow_report_phase_status: "{process_steps_total,process_steps_complete,experiment_result:success|failure|inconclusive,blocker_reason?}",
  workflow_runtime_probe: "{stack,probe_type:install|build|test|runtime,temp_dir?}",
};

const EMPTY_STALE_DISPATCH = { fixable_candidates: [], orphan_findings: [], dispatch_protocol_prompt: "" };
const EMPTY_CHANGE_LOG_GAP = { gap_candidates: [], gap_protocol_prompt: "" };
const PULL_PATH = "Loop steering (pull): loop_describe({tier:'warm'}) | hints: .claude/session-context.json | one: loop_get_instruction({key})";

// Read the .claude runtime's mcp.json env block. This hook is wired only for
// .claude (see .claude/settings.json), so the config path is fixed. Returns {}
// when the file is absent or malformed (fail-open: no banner, no crash).
function readSurfaceMcpJson(projectRoot) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(projectRoot, ".mcp.json"), "utf8"));
    return config.mcpServers?.["learning-loop"]?.env ?? {};
  } catch {
    return {};
  }
}

// Footer sections for the records-via-cli vs reads-only paths. Extracted
// from buildTransportBanner so each helper stays below fallow's CRAP
// threshold (PR #75: buildTransportBanner was CRAP 30 at cyclomatic 5
// because subprocess hook coverage doesn't attribute back).
//
// `surface` is the concrete LOOP_SURFACE value pinned in the runtime's
// .mcp.json env block (e.g. ".claude"). When present it is interpolated into
// the footer so the agent is told the exact value to set on the CLI, instead
// of a generic "Set LOOP_SURFACE" prompt that forces a guess (and a rejected
// first call — e.g. LOOP_SURFACE=loop). Fail-open: an absent/empty value
// falls back to the original prompt; the identity pin in loop.mjs remains the
// real validator.
function loopSurfaceFooterLine(surface) {
  const value = typeof surface === "string" && surface.trim() ? surface.trim() : null;
  return value
    ? `  Set LOOP_SURFACE=${value} before invoking; set GATE_ROOT when reading a different repo.`
    : "  Set LOOP_SURFACE before invoking; set GATE_ROOT when reading a different repo.";
}

function buildRecordsViaCliLines(surface) {
  const lines = [
    "  Writes also ride the CLI: mastra_<write> MCP tools are NOT registered either.",
    "  Exit 0 → result JSON on stdout. Exit 1 → structured JSON on stderr (recognized rejection: {error,code,reason}; InternalError: {error:'InternalError',internal:true}). Exit 2 → usage/caller-config (human-readable).",
    "  Invoke with inline JSON: `loop.mjs <tool> '<json-args>'`. Read JSON from a file when the payload is too large or shell-risky for argv: `loop.mjs <tool> --args-file <path>`. Schema enums (e.g. meta_state_report category) are inlined into the sketch; pull the full shape on demand via `loop.mjs <tool> --schema`.",
    "  Write-tool arg sketches (one-liner; full shape via `loop.mjs <tool> --schema`):",
  ];
  for (const tool of CLI_WRITE_TOOLS) {
    const sketch = WRITE_TOOL_SKETCHES[tool];
    if (sketch) lines.push(`    loop.mjs ${tool} '${sketch}'`);
  }
  lines.push(loopSurfaceFooterLine(surface));
  return lines;
}

function buildReadsOnlyFooterLines(surface) {
  return [
    "  Writes still use mastra_<write> MCP tools.",
    loopSurfaceFooterLine(surface),
  ];
}

function buildTransportBanner({ readsViaCli = false, recordsViaCli = false, surface = null } = {}) {
  if (!readsViaCli) return "";
  const toolNames = [...CLI_READ_TOOLS].join(", ");
  const lines = [
    `Loop read transport: this runtime reads the loop's ${CLI_READ_TOOLS.size} read tools via CLI, not MCP.`,
    "  Read: node tools/learning-loop-mastra/bin/loop.mjs <tool> '<json-args>'",
    `  Tools: ${toolNames} (loop.mjs list prints them).`,
    "  The mastra_<read> MCP tools are NOT registered for this runtime.",
  ];
  if (recordsViaCli) {
    lines.push(...buildRecordsViaCliLines(surface));
  } else {
    lines.push(...buildReadsOnlyFooterLines(surface));
  }
  return lines.join("\n");
}

function buildConfiguredTransportBanner(projectRoot) {
  const mcpEnv = readSurfaceMcpJson(projectRoot);
  // The combined flag (LOOP_RECORDS_VIA_CLI) drops reads + writes from MCP,
  // so it implies reads-via-cli as well. A runtime that sets only
  // LOOP_READS_VIA_CLI=1 keeps writes on MCP. Either flag is enough to
  // surface the banner; the banner text adapts to which flag fired.
  const recordsViaCli = /^(1|true)$/i.test(String(mcpEnv.LOOP_RECORDS_VIA_CLI ?? ""));
  const readsViaCli = recordsViaCli || /^(1|true)$/i.test(String(mcpEnv.LOOP_READS_VIA_CLI ?? ""));
  // Echo the pinned surface verbatim so the agent sets the exact value on
  // CLI invocations rather than guessing. The MCP server already validated
  // this value at boot (pinRuntimeIdAtBoot), so a running config's value is
  // by construction one of the allowed surfaces. loopSurfaceFooterLine
  // treats undefined/empty as "fail open", so the raw value is passed through
  // without an extra coalesce here.
  return buildTransportBanner({ readsViaCli, recordsViaCli, surface: mcpEnv.LOOP_SURFACE });
}

/**
 * Load discoverability + process hints (Rec 9).
 * Returns empty arrays on builder failure so the JSON shape stays stable.
 *
 * Each hint payload carries a `*_source` flag ("core" on success,
 * "fallback" on degraded loader) plus an optional `*_error` string. The
 * flag is what makes the silent-degrade failure mode visible: without it,
 * a consumer reading the sidecar cannot distinguish "no hints configured"
 * from "loaders failed and returned empty." The stderr-summary fix for the
 * PROCESS_HINTS row #1 silent-degrade path observed in sessions
 * 260715-1010 and 260715-1100.
 */
function loadCoreHints() {
  try {
    if (process.env.SESSION_START_FORCE_HINTS_FAIL === "1") {
      throw new Error("forced core-hints loader failure (SESSION_START_FORCE_HINTS_FAIL=1)");
    }
    const { buildDiscoverabilityPointers, buildProcessPointers, buildHintIndex } = require("../../core/loop-introspect.js");
    const { loadPromotedRules } = require("../../core/gate-logic.js");
    // Session start is a warm-injection site: only startup-tier pointers are
    // auto-injected; on-demand rows stay discoverable via hint_index and are
    // fetched in full via loop_get_instruction. Full text is never written
    // to the sidecar. rulesById merges rule-derived process slugs into the
    // index so it is the complete discovery surface.
    const rulesById = new Map(loadPromotedRules(process.cwd()).map((r) => [r.id, r]));
    return {
      discoverability_hints: buildDiscoverabilityPointers({ tier: "startup" }),
      discoverability_hints_source: "core",
      process_hints: buildProcessPointers({ tier: "startup", rulesById }),
      process_hints_source: "core",
      hint_index: buildHintIndex({ rulesById }),
      hint_index_source: "core",
    };
  } catch (err) {
    console.error(`[session-start] buildHints failed: ${err.message}`);
    return {
      discoverability_hints: [],
      discoverability_hints_source: "fallback",
      discoverability_hints_error: err.message,
      process_hints: [],
      process_hints_source: "fallback",
      process_hints_error: err.message,
      hint_index: [],
      hint_index_source: "fallback",
      hint_index_error: err.message,
    };
  }
}

/**
 * Read the meta-state registry. Returns [] on read failure; never throws.
 * Carries a `_source` flag mirroring the loadCoreHints contract.
 */
function loadRegistry(root) {
  try {
    if (process.env.SESSION_START_FORCE_REGISTRY_FAIL === "1") {
      throw new Error("forced registry loader failure (SESSION_START_FORCE_REGISTRY_FAIL=1)");
    }
    const { readRegistry } = require("../../core/meta-state.js");
    return { entries: readRegistry(root), registry_source: "core" };
  } catch (err) {
    console.error(`[session-start] readRegistry failed: ${err.message}`);
    return { entries: [], registry_source: "fallback", registry_error: err.message };
  }
}

/**
 * True iff `r` is a runtime-state.jsonl row that recorded a finding dispatch
 * (used by `buildStaleDispatchHints` to surface INC-10 orphans). CC kept low
 * via `?.` + short-circuit `&&` — three branches instead of four explicit
 * `if` returns.
 */
function isDispatchLedgerRow(r) {
  return typeof r?.id === "string"
    && r.kind === "ledger-event"
    && r.id.startsWith("dispatch-");
}

/**
 * Read runtime-state.jsonl and project out the dispatched-finding ids.
 * Returns [] on read failure or when the sidecar is absent.
 */
function loadDispatchIds(root) {
  try {
    const { readRuntimeStateRows } = require("../../core/runtime-state.js");
    return readRuntimeStateRows(root)
      .filter(isDispatchLedgerRow)
      .map((r) => r.id.slice("dispatch-".length));
  } catch (err) {
    console.error(`[session-start] readRuntimeStateRows failed: ${err.message}`);
    return [];
  }
}

/**
 * Rec 10 surfacing — stale-findings dispatch handler (stale-fixable candidates
 * + orphan-finding reconciliation).
 * Builder over `entries` + dispatch ids. Returns empty shape on builder failure.
 *
 * Stale-view hash-drift fix: thread drift signals
 * (`fileIndex` + `codeHashes`) into `buildStaleDispatchHints` so the
 * fixable-candidates filter fires on drift, not just age. This is the
 * session-start user-facing stale-dispatch surface — the most visible place
 * the plan's hash-aware semantics must reach. Signal building is best-effort:
 * if the file-index sidecar is absent or hashing fails, degrade to age-only
 * (the pre-fix behavior) rather than empty, so a missing sidecar never
 * silently drops age-stale candidates. Non-"missing" skipped paths surface
 * via stderr (the hook's observability channel — universal hooks do not use
 * the MCP gate-log).
 */
// fallow-ignore-next-line complexity -- two guarded best-effort blocks (drift-signal build, then hint build) with documented degrade-to-age-only fallbacks
function loadStaleDispatchHints(entries, dispatchIds, root) {
  let fileIndex;
  let codeHashes;
  try {
    const { readFileIndex } = require("../../core/meta-state.js");
    const { computeCurrentHashes } = require("../../core/stale-view.js");
    fileIndex = readFileIndex(root);
    const { ok, skipped } = computeCurrentHashes(entries, root);
    codeHashes = ok;
    for (const s of skipped) {
      if (s.reason !== "missing") {
        console.error(`[session-start] computeCurrentHashes skipped ${s.canonical}: ${s.reason}`);
      }
    }
  } catch (err) {
    // Sidecar absent or hash build failed — degrade to age-only (pre-fix
    // behavior). isStaleView treats missing codeHashes as no-drift signal.
    console.error(`[session-start] drift signals unavailable, age-only stale-dispatch: ${err.message}`);
    fileIndex = undefined;
    codeHashes = undefined;
  }
  try {
    const { buildStaleDispatchHints } = require("../../core/loop-introspect.js");
    return buildStaleDispatchHints(entries, new Set(dispatchIds), fileIndex, codeHashes);
  } catch (err) {
    console.error(`[session-start] buildStaleDispatchHints failed: ${err.message}`);
    return EMPTY_STALE_DISPATCH;
  }
}

/**
 * Rec 12 closed-loop — change-log gap detection (bound-artifact paths touched
 * on this branch that no `meta_state_log_change` entry covers). The gap
 * builder is pure (caller-supplied set); we read branch-touched paths via
 * a read-only git call (never throws). Returns empty shape on builder
 * failure.
 */
function loadChangeLogGapHints(root, entries) {
  try {
    const { buildChangeLogGapHints } = require("../../core/loop-introspect.js");
    const { readBranchTouchedPaths } = require("../../core/git-diff.js");
    return buildChangeLogGapHints(entries, readBranchTouchedPaths(root));
  } catch (err) {
    console.error(`[session-start] buildChangeLogGapHints failed: ${err.message}`);
    return EMPTY_CHANGE_LOG_GAP;
  }
}

/**
 * Write the session-context.json sidecar. mkdirSync({recursive:true}) keeps
 * the path available on a fresh clone; both happy-path and fatal-catch
 * write through this helper.
 */
function writeContext(root, payload) {
  const contextPath = path.join(root, ".claude", "session-context.json");
  fs.mkdirSync(path.dirname(contextPath), { recursive: true });
  fs.writeFileSync(contextPath, JSON.stringify(payload, null, 2));
  return contextPath;
}

/**
 * Emit hint content to the agent as a SessionStart system-reminder via
 * hookSpecificOutput.additionalContext (stdout JSON). This is the
 * deterministic delivery leg: without it, hint content lives only in the
 * sidecar file (no in-process reader), so the agent never sees
 * PROCESS_HINTS row #1 unless it voluntarily calls loop_describe — the
 * observed regression in session 4760ee34 (4× `pnpm test | grep`).
 *
 * The additionalContext channel is capped at 10k chars by the harness; the
 * two hint sets combined (~11.8k) exceed it, so discoverability hints are
 * injected here and process hints by the companion
 * session-start-inject-process-hints.cjs hook. Both stay under the cap and
 * land as separate system-reminders before the first prompt.
 *
 * Fail-open: a degraded loader (empty hints) emits a marker string so the
 * agent knows to consult the sidecar's *_source flags rather than silently
 * receiving nothing.
 */
function buildAdditionalContext(hints, source, label, transportBanner = "") {
  const body = Array.isArray(hints) && hints.length > 0
    ? hints.map((h, i) => `${i + 1}. ${h}`).join("\n")
    : `unavailable — ${label} loader degraded (source=${source}). Inspect .claude/session-context.json *_source flags.`;
  const base = `${PULL_PATH}\n${body}`;
  return transportBanner ? `${transportBanner}\n${base}` : base;
}

function emitAdditionalContext(hints, source, label, transportBanner = "") {
  const text = buildAdditionalContext(hints, source, label, transportBanner);
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } }));
}

/**
 * Collect the set of loader names that degraded to "fallback". Pure over the
 * core + registry loader results. Exported so the test suite can exercise the
 * branchy logic in-process (the spawn-based integration test can't attribute
 * coverage into a child process).
 */
function computeDegradedSources(core, registry) {
  return [
    core.discoverability_hints_source === "fallback" ? "discoverability_hints" : null,
    core.process_hints_source === "fallback" ? "process_hints" : null,
    registry.registry_source === "fallback" ? "registry" : null,
  ].filter(Boolean);
}

/**
 * Format the stderr success-summary line. Pure over the loader results + the
 * sidecar path written by `main`. Exported for in-process testing.
 */
function formatSessionSummary(core, stale_dispatch_hints, change_log_gap_hints, contextPath) {
  return `[session-start] wrote ${core.discoverability_hints.length} discoverability + ${core.process_hints.length} process + ${stale_dispatch_hints.fixable_candidates.length} stale-dispatch + ${change_log_gap_hints.gap_candidates.length} change-log-gap hints to ${contextPath}`;
}

/**
 * Build the session-context.json payload from the loader results. Pure over
 * its inputs (no I/O, no `new Date`). The `?? null` coalescing for per-loader
 * error fields lives in `orNull` (below) rather than inlined here or in
 * `main`, so both functions' cyclomatic complexity stays low. Exported for
 * in-process testing.
 */
// Normalize a possibly-undefined per-loader error field to null. Centralizing
// the `??` here keeps the decision points out of buildContextPayload (and
// main), which would otherwise cross the cyclomatic threshold as per-loader
// error fields are added.
const orNull = (v) => v ?? null;

function buildContextPayload(core, registry, stale_dispatch_hints, change_log_gap_hints, injectedAt) {
  return {
    discoverability_hints: core.discoverability_hints,
    discoverability_hints_source: core.discoverability_hints_source,
    discoverability_hints_error: orNull(core.discoverability_hints_error),
    process_hints: core.process_hints,
    process_hints_source: core.process_hints_source,
    process_hints_error: orNull(core.process_hints_error),
    hint_index: core.hint_index,
    hint_index_source: core.hint_index_source,
    hint_index_error: orNull(core.hint_index_error),
    registry_source: registry.registry_source,
    registry_error: orNull(registry.registry_error),
    stale_dispatch_hints,
    change_log_gap_hints,
    injected_at: injectedAt,
  };
}

async function main() {
  // Test hook: when SESSION_START_FORCE_FATAL=1, throw to exercise the
  // fatal-catch write path (the BOTH-write-sites invariant).
  if (process.env.SESSION_START_FORCE_FATAL === "1") {
    throw new Error("forced fatal for smoke test");
  }

  const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");
  const transportBanner = buildConfiguredTransportBanner(projectRoot);

  // 1. Core hints (no registry dep).
  const core = loadCoreHints();

  // 2. Registry + dispatch ids (Rec 10 INC-10 orphan detection).
  const registry = loadRegistry(projectRoot);
  const dispatchIds = loadDispatchIds(projectRoot);

  // 3. Stale dispatch hints (Rec 10) + change-log gap hints (Rec 12).
  const stale_dispatch_hints = loadStaleDispatchHints(registry.entries, dispatchIds, projectRoot);
  const change_log_gap_hints = loadChangeLogGapHints(projectRoot, registry.entries);

  const contextPath = writeContext(projectRoot, buildContextPayload(core, registry, stale_dispatch_hints, change_log_gap_hints, new Date().toISOString()));

  // Inline delivery leg: surface discoverability hints to the agent as a
  // SessionStart system-reminder. process hints are injected by the companion
  // hook (the 10k-char cap forces the split). See emitAdditionalContext.
  emitAdditionalContext(core.discoverability_hints, core.discoverability_hints_source, "discoverability", transportBanner);

  // Stderr summary line — the existing success signal. Includes source flags
  // when any loader degraded so the harness surfaces the failure to the agent
  // (silent-degrade was the bug class fixed by per-source degraded-flag
  // instrumentation; silent failures no longer slip through).
  const degradedSources = computeDegradedSources(core, registry);
  if (degradedSources.length > 0) {
    console.error(
      `[session-start] DEGRADED loaders: ${degradedSources.join(", ")} — sidecar at ${contextPath} carries *_source=fallback flags`,
    );
  }
  console.error(formatSessionSummary(core, stale_dispatch_hints, change_log_gap_hints, contextPath));
  process.exit(0);
}

module.exports = {
  computeDegradedSources,
  formatSessionSummary,
  buildContextPayload,
  loadStaleDispatchHints,
  readSurfaceMcpJson,
  buildTransportBanner,
  buildConfiguredTransportBanner,
  buildAdditionalContext,
  // Exported so cli-write-hint-sketch-drift.test.cjs can cross-check the
  // one-line arg sketches against each write tool's actual schema required
  // keys — the drift guard the table comment above promises.
  WRITE_TOOL_SKETCHES,
};

if (require.main === module) {
  main().catch((err) => {
  console.error(`[session-start] fatal: ${err.message}`);
  // BOTH-write-sites invariant: fatal-catch must carry the same keys as the
  // happy-path write (incl. `change_log_gap_hints`) so downstream readers
  // never see a missing key on a failure path. The fatal path also sets
  // every `*_source` to "fatal" so a downstream reader can distinguish a
  // fatal from a per-loader fallback — both look like empty arrays on the
  // surface but represent different failure modes.
  const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");
  try {
    writeContext(projectRoot, {
      discoverability_hints: [],
      discoverability_hints_source: "fatal",
      discoverability_hints_error: err.message,
      process_hints: [],
      process_hints_source: "fatal",
      process_hints_error: err.message,
      hint_index: [],
      hint_index_source: "fatal",
      hint_index_error: err.message,
      registry_source: "fatal",
      registry_error: err.message,
      stale_dispatch_hints: EMPTY_STALE_DISPATCH,
      change_log_gap_hints: EMPTY_CHANGE_LOG_GAP,
      injected_at: new Date().toISOString(),
    });
  } catch { /* ignore */ }
  // Surface the fatal degrade to the agent so it isn't silent.
  const transportBanner = buildConfiguredTransportBanner(projectRoot);
  emitAdditionalContext([], "fatal", "pointer-discoverability", transportBanner);
  process.exit(0);
});
}