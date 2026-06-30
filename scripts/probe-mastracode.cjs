#!/usr/bin/env node
/**
 * scripts/probe-mastracode.cjs
 *
 * Phase 1 probe (read-only): inspects the `mastracode` npm package's runtime
 * surface so the .mastracode/ config and the Phase 4 smoke test can be wired
 * against the ACTUAL tool namespacing, hook tool names, and Harness method
 * inventory. Writes structured JSON to stdout; exits 0 on success, 1 on error.
 *
 * Behavior branches:
 *   1. mastracode installed + createMastraCode bootable → live probe
 *   2. mastracode installed but boot fails              → {ok:false, error}
 *   3. mastracode not installed (current sandbox)       → {ok:false,
 *      status:'install-blocked', research_defaults:{...}} drawn from the
 *      mastracode-prep + harness-class reports.
 *
 * Phase 4 smoke (scripts/smoke-mastracode.cjs) reuses the same shape; the
 * probe here is read-only and may run unattended in CI.
 *
 * Exit codes:
 *   0 = probe completed (live or documented fallback)
 *   1 = probe error (unhandled exception)
 */
'use strict';

const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');

const PROJECT_ROOT = process.cwd();

const RESEARCH_DEFAULTS = Object.freeze({
  // research-260626-2314-phase-e-plan-4-mastracode-prep-report.md §2:
  //   "tools are auto-namespaced as serverName_toolName."
  tool_namespacing_format: '<serverName>_<toolName>',
  tool_namespacing_examples: [
    'learning-loop_loop_describe',
    'learning-loop_meta_state_list',
    'learning-loop_meta_state_report',
  ],
  // research-260626-2314-phase-e-plan-4-mastracode-prep-report.md §4:
  //   Built-in tool names referenced in the documented .mastracode/hooks.json
  //   example: "execute_command". Write/edit tools follow Mastra Code's
  //   ToolCategory taxonomy (`'edit'`); their exact `tool_name` is runtime-
  //   discovered by this probe when the package is installed.
  hook_event_types: ['PreToolUse', 'PostToolUse', 'Stop', 'UserPromptSubmit', 'SessionStart', 'SessionEnd', 'Notification'],
  // research-260626-2314-phase-e-plan-4-harness-class-report.md §5:
  //   HarnessConfig.resourceId is the framework-level runtime identity.
  resourceId: 'mastra-code',
  // harness-class-report §7:
  //   MCP integration via `@mastra/mcp/client`. Wire format for hook payloads
  //   documented in `@mastra/core/dist/harness/types.d.ts`.
  source: 'plans/reports/research-260626-2314-phase-e-plan-4-mastracode-prep-report.md + plans/reports/research-260626-2314-phase-e-plan-4-harness-class-report.md',
});

function detectInstall() {
  const pkgPath = join(PROJECT_ROOT, 'node_modules', 'mastracode', 'package.json');
  if (!existsSync(pkgPath)) return { installed: false, reason: 'node_modules/mastracode/package.json missing' };
  try {
    const pkg = JSON.parse(require('node:fs').readFileSync(pkgPath, 'utf8'));
    return { installed: true, version: pkg.version, main: pkg.main || null };
  } catch (err) {
    return { installed: false, reason: `parse-failed: ${err.message}` };
  }
}

async function liveProbe() {
  // Lazy-require so the documented-fallback branch can run when mastracode
  // is not installed (no `require('mastracode')` evaluated).
  const mastracode = require('mastracode');
  const factory = mastracode.createMastraCode || mastracode.default?.createMastraCode;
  if (typeof factory !== 'function') {
    return { ok: false, status: 'install-ok-but-no-factory', error: 'createMastraCode not exported from mastracode package' };
  }

  // NOTE: mastracode@0.26.0 — `createMastraCode` is an alias for `bootLocalAgentController`.
  // Actual return shape: { session, controller, storage, mcpManager, hookManager, ... }.
  // The prep report described the old `createMastraCode` returning `{ harness, mcpManager, hookManager }`.
  // (Harness was the @mastra/core wrapper pre-0.26.) We enumerate the actual surface.
  const boot = await factory({ cwd: PROJECT_ROOT });
  const { session, controller, mcpManager, hookManager } = boot;

  // Method inventories (red-team fix F8): only call methods present here
  const safeMethods = (obj) => obj ? Object.keys(obj).filter((k) => typeof obj[k] === 'function') : [];
  const bootKeys = Object.keys(boot || {});
  const controllerMethods = safeMethods(controller);
  const sessionMethods = safeMethods(session);

  // MCP server reachability — use the actual McpManager API
  let mcpServers = [];
  let mcpInitError = null;
  try {
    if (mcpManager && typeof mcpManager.init === 'function') {
      await mcpManager.init();
    }
    if (mcpManager) {
      // McpManager API (from dist/mcp/manager.d.ts):
      //   getServerStatuses(): McpServerStatus[]
      //   getTools(): Record<string, any>  (namespaced as serverName_toolName)
      //   getConfigPaths(): { ... }        (project + global paths)
      mcpServers = mcpManager.getServerStatuses?.() ?? [];
    }
  } catch (err) {
    mcpInitError = err.message;
  }

  // Hook config (from .mastracode/hooks.json) — actual API is getConfig() + getConfigPaths()
  let hookConfig = null;
  let hookConfigPaths = null;
  let hookEventTypes = [];
  try {
    if (hookManager) {
      hookConfig = hookManager.getConfig?.() ?? null;
      hookConfigPaths = hookManager.getConfigPaths?.() ?? null;
      if (hookConfig && typeof hookConfig === 'object') {
        hookEventTypes = Object.keys(hookConfig);
      }
    }
  } catch (err) {
    hookConfig = { error: err.message };
  }

  // Tool namespacing — discover MCP tools via getTools() (real API)
  let mcpTools = {};
  let mcpToolNames = [];
  try {
    if (mcpManager && typeof mcpManager.getTools === 'function') {
      mcpTools = await mcpManager.getTools();
      mcpToolNames = Object.keys(mcpTools);
    }
  } catch (err) {
    mcpTools = { error: err.message };
  }

  // MCP config discovery paths (proves .mastracode/mcp.json was found)
  let mcpConfigPaths = null;
  try {
    if (mcpManager && typeof mcpManager.getConfigPaths === 'function') {
      mcpConfigPaths = mcpManager.getConfigPaths();
    }
  } catch (err) {
    mcpConfigPaths = { error: err.message };
  }

  // Actual tool round-trip (Phase 4 smoke): invoke one MCP tool via tool.execute().
  // loop_describe is the canonical "give me the loop's manifest" tool; if MCP integration
  // is wired correctly, calling it via the namespaced name returns the 6-group manifest.
  let roundtrip = null;
  const roundtripToolName = 'learning-loop_mastra_loop_describe';
  try {
    const tool = mcpTools[roundtripToolName];
    if (tool && typeof tool.execute === 'function') {
      const result = await tool.execute({ tier: 'warm' }, { requestContext: { get: () => undefined } });
      roundtrip = {
        tool: roundtripToolName,
        ok: true,
        response_shape: typeof result === 'object' ? Object.keys(result).slice(0, 8) : typeof result,
        response_preview: typeof result === 'object' ? JSON.stringify(result).slice(0, 500) : String(result).slice(0, 500),
      };
    } else {
      roundtrip = {
        tool: roundtripToolName,
        ok: false,
        error: `tool not found or has no execute(): found=${Boolean(tool)}, hasExecute=${Boolean(tool?.execute)}`,
        available_tool_count: mcpToolNames.length,
        first_3_tool_names: mcpToolNames.slice(0, 3),
      };
    }
  } catch (err) {
    roundtrip = { tool: roundtripToolName, ok: false, error: err.message };
  }

  // Wire-format probe (red-team Security obs): synthetic Mastra-Code-shaped payload
  const wireProbe = await verifyWireFormat();

  // Cleanup: best-effort, only call methods present in inventory
  try { if (mcpManager && typeof mcpManager.disconnect === 'function') await mcpManager.disconnect(); } catch {}
  try { if (mcpManager && typeof mcpManager.disconnectAll === 'function') await mcpManager.disconnectAll(); } catch {}
  try { if (typeof boot.shutdown === 'function') await boot.shutdown(); } catch {}

  return {
    ok: true,
    status: 'live',
    boot_keys: bootKeys,
    controller_methods: controllerMethods,
    session_methods: sessionMethods,
    mcp_servers: mcpServers,
    mcp_tool_names: mcpToolNames,
    mcp_tools: mcpTools,
    mcp_config_paths: mcpConfigPaths,
    mcp_init_error: mcpInitError,
    roundtrip,
    hook_event_types: hookEventTypes,
    hook_config_paths: hookConfigPaths,
    hook_config: hookConfig,
    wire_format_probe: wireProbe,
    config_dir_resolution: existsSync(join(PROJECT_ROOT, '.mastracode')) ? 'discovered' : 'missing',
  };
}

async function verifyWireFormat() {
  // Universal hooks consume the Claude Code hook payload shape (stdin JSON).
  // Confirm the universal bash-gate parses a Mastra-Code-shaped payload so
  // the .mastracode/hooks.json `command` entries actually work end-to-end.
  const { spawn } = require('node:child_process');
  return new Promise((resolve) => {
    const probe = spawn('node', [join(PROJECT_ROOT, 'tools/learning-loop-mastra/hooks/legacy/bash-gate.js')], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    probe.stdout.on('data', (c) => { stdout += c; });
    probe.stderr.on('data', (c) => { stderr += c; });
    probe.on('exit', (code) => {
      resolve({ exit_code: code, stdout, stderr, parsed_stdout: safeParse(stdout), stderr_truncated: stderr.slice(0, 500) });
    });
    // Mastra Code's documented hook payload (see prep-report §4). Falls back to
    // a Claude-Code-compatible shape since both are subsets of the same JSON.
    probe.stdin.end(JSON.stringify({
      session_id: 'probe-mastracode-001',
      cwd: PROJECT_ROOT,
      hook_event_name: 'PreToolUse',
      tool_name: 'execute_command',
      tool_input: { command: 'ls' },
    }));
  });
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function documentedFallback(installStatus) {
  return {
    ok: false,
    status: 'install-blocked',
    install: installStatus,
    error: 'mastracode package not installed in this sandbox; install blocked by stale @ai-sdk/provider-utils@4.0.33 pin (see meta-state finding meta-260630T2050Z-phase-e-plan-4-phase-1-install-attempt-pnpm-add-d-mastracode).',
    research_defaults: RESEARCH_DEFAULTS,
    // Wire format verification is still useful — it confirms the universal
    // bash-gate can parse a synthetic Mastra-Code-shaped payload even when
    // the harness isn't installed.
    wire_format_probe: undefined, // populated below in runProbe()
  };
}

async function runProbe() {
  const install = detectInstall();
  let result;
  if (install.installed) {
    try {
      result = await liveProbe();
    } catch (err) {
      result = { ok: false, status: 'install-ok-but-probe-failed', install, error: err.message, stack: err.stack };
    }
  } else {
    result = documentedFallback(install);
  }
  // Always run the wire-format probe (universal hook is git-tracked, not
  // runtime-mutable). This catches the F6 wire-format gap regardless of
  // install state.
  if (result.status !== 'live' || !result.wire_format_probe) {
    try {
      result.wire_format_probe = await verifyWireFormat();
    } catch (err) {
      result.wire_format_probe = { error: err.message };
    }
  }
  return result;
}

(async () => {
  try {
    const result = await runProbe();
    console.log(JSON.stringify(result, null, 2));
    // Exit 0 in both live-OK and documented-fallback branches (the probe
    // completed; downstream phases consume the result).
    // Exit 1 only on unhandled exception (handled inside runProbe).
    process.exit(0);
  } catch (err) {
    console.log(JSON.stringify({ ok: false, status: 'unhandled-exception', error: err.message, stack: err.stack }, null, 2));
    process.exit(1);
  }
})();