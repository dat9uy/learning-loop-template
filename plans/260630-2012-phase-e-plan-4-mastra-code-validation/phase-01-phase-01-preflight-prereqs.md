---
phase: 1
title: "phase-01-preflight-prereqs"
status: pending
effort: ""
---

# Phase 1: Preflight + Prerequisites

## Overview

Resolve the open integration questions (tool namespacing, write/edit tool names, LibSQL storage conflict, Harness `harness.shutdown()` availability) via a small read-only probe BEFORE committing to config-file paths or smoke-test scripts. Avoids the failure mode of building `.mastracode/hooks.json` with wrong `tool_name` matchers, or a smoke test that calls non-existent harness methods.

**Output contract:** Phase 2 MUST NOT start until Phase 1 probe exits 0 + captures all required data. Phase 2 config files reference Phase 1 probe values; "phantom" data is a blocker.

## Requirements

- **Functional:** verify `mastracode` npm package is installable + boots programmatically + reports actual MCP tool naming convention
- **Non-functional:** pre-flight gate check before any vendor install (per learning-loop `gate_check` protocol)
- **Testability:** probe script exits with structured JSON output; CI-friendly

## Architecture

**Probe script** (`scripts/probe-mastracode.cjs` — created in Phase 1, reused by Phase 4 smoke test):

```
createMastraCode({ cwd: process.cwd(), resourceId: 'mastra-code' })
  ↓
mcpManager.connectAll() → list MCP servers + tools (resolve Q6 namespacing)
  ↓
hookManager.listHooks() → list configured hooks (resolve write/edit tool names)
  ↓
harness.subscribe('tool_start', log) → subscribe + unsubscribe (resolve tool_name in hook payload)
  ↓
write JSON to stdout: { ok, mcp_servers, hook_tool_names, namespacing_format, ... }
```

The probe is **read-only** — it does not invoke any tool, just lists the runtime's configured hooks and MCP servers. Phase 4 reuses the same script to do the actual tool round-trip.

## Related Code Files

- Create: `scripts/probe-mastracode.cjs` (probe script; ~80 LoC)
- Modify: `package.json` (add `mastracode` to `devDependencies` or `peerDependencies`)
- Modify: `pnpm-lock.yaml` (after install)
- Modify: `meta-state.jsonl` (1 `meta_state_log_change` entry recording probe results + 1 finding if install blocked)

## Implementation Steps

1. **Pre-flight gate check.** Call `mastra_gate_check` for `npm install mastracode --save-dev`. If blocked (vendor API constraint), call `meta_state_report(category="budget-check")` per AGENTS.md §10 protocol; record the reason; fallback: `pnpm view mastracode` (read-only) to confirm package exists + latest version + dependencies.
2. **Install.** Run `pnpm add -D mastracode`. Verify exit 0 + `node_modules/mastracode/package.json` exists with `bin` field (for any CLI) and `main`/`exports` field (for programmatic).
3. **Verify Mastra dependency versions.** Confirm `@mastra/core@1.42.0` + `@mastra/mcp@1.10.0` already installed (per harness-class report §"Research Methodology"). If not, note the gap; plan must not depend on a different Mastra version.
4. **Write probe script.** `scripts/probe-mastracode.cjs` (skeleton from "Architecture" above). Catch all errors; write structured JSON `{ok, error?, mcp_servers, hook_tool_names, namespacing_format, resourceId, ...}` to stdout. Exit 0 on success; 1 on failure.
5. **Run probe.** `node scripts/probe-mastracode.cjs`. Capture stdout. Record:
   - **Tool namespacing** (Q6 resolved): `learning-loop_loop_describe` vs `mcp__learning-loop__loop_describe` vs other format
   - **Hook tool names** (write/edit): the actual `tool_name` Mastra Code uses for built-in write/edit tools (needed for `.mastracode/hooks.json` matcher)
   - **LibSQL storage default path** (R3): the path Mastra Code uses for its default DB (to disambiguate from `tools/learning-loop-mastra/data/mastra-memory.db`)
   - **`createMastraCode` resolved config**: which `.mastracode/*.json` files were read; in what priority order
   - **Harness method inventory** (red-team fix F8): `Object.getOwnPropertyNames(Harness.prototype).filter(n => typeof harness[n] === 'function')` — record which methods are present (e.g., `shutdown`, `subscribe`, `callTool`, `listTools`). Phase 4 smoke test only invokes methods present here.
   - **Hook payload wire format** (red-team fix F6): spawn `node tools/learning-loop-mastra/hooks/legacy/bash-gate.js` directly with a synthetic Mastra Code hook payload; verify the gate parses + returns valid JSON. If parse fails, file finding — the wire format mismatch is a blocker.
6. **File findings.** If probe reveals Q6 or R3 issues that change Phase 2/3 design, file as `meta_state_report(category="mcp-tool-missing" or "schema-drift")`. Otherwise: no-op.
7. **Phase 2 gate enforcement.** Phase 2 does NOT start until Phase 1 probe exits 0 AND all required fields (Q6, write/edit tool names, harness method inventory, wire format) are captured. If any are missing, Phase 1 is incomplete; rerun or escalate.
8. **Commit probe script** as a standalone artifact (read-only; Phase 4 creates a separate interactive smoke script).

## Success Criteria

- [ ] `npm install mastracode` succeeds; `node_modules/mastracode/` exists
- [ ] `@mastra/core@1.42.0` + `@mastra/mcp@1.10.0` confirmed (no version drift)
- [ ] `node scripts/probe-mastracode.cjs` exits 0 with structured JSON output
- [ ] Q6 (tool namespacing) resolved: actual format documented
- [ ] Write/edit tool names resolved: actual `tool_name` values documented
- [ ] R3 (LibSQL storage conflict) status documented (no-conflict OR explicit `database.json` override needed)
- [ ] `meta_state_log_change` filed with `change_target: 'plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md'`, `reason: 'Phase E Plan 4 Phase 1 prereqs complete; probe results: ...'`

## Risk Assessment

- **R1 (install blocked):** `mastracode` may be a vendor package with API cost. Mitigation: pre-flight gate + fallback to `pnpm view`.
- **R3 (storage conflict):** if both processes write to the same LibSQL DB, locks will collide. Mitigation: probe will detect; if conflict, configure `.mastracode/database.json` with a sibling path (e.g., `./tools/learning-loop-mastra/data/mastra-code-memory.db`).
- **Probe script complexity:** keep first version < 100 LoC; defer tool round-trip to Phase 4.